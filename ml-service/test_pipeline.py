"""
CollabLens — ML Pipeline Test Script

Tests all 4 seed datasets + edge cases against the /analyze endpoint.
Run this AFTER starting the ML service with `python app.py`.

Usage:
  python test_pipeline.py                    # Test all seeds + edge cases
  python test_pipeline.py balanced_team      # Test single seed
  python test_pipeline.py --quick            # Fast 3-message sanity check (no seed files needed)
  python test_pipeline.py --local            # Test modules directly (no server needed)
  python test_pipeline.py --edge             # Edge case tests only

Expected outcomes:
  balanced_team:       Equity > 0.7, good exploration, multiple clusters
  one_dominant:        Equity < 0.5, hub-and-spoke network, Raj dominates
  stuck_then_recovered: Stuck period detected, recovery message identified
  highly_exploratory:  High exploration score (> 0.5), 4-5 clusters
"""

import json
import sys
import os
import time

# Force UTF-8 output on Windows
if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

import requests

SEED_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'seed')

# ANSI color codes for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
BOLD = '\033[1m'
DIM = '\033[2m'
RESET = '\033[0m'


def detect_ml_url():
    """Try port 5000, then 5001, then 5002 to find the running ML service."""
    base = os.environ.get('ML_SERVICE_URL', '')
    if base:
        return base

    for port in [5000, 5001, 5002]:
        url = f'http://localhost:{port}'
        try:
            resp = requests.get(f'{url}/health', timeout=3)
            if resp.status_code == 200:
                return url
        except Exception:
            pass

    return 'http://localhost:5000'  # default fallback


ML_URL = detect_ml_url()


def load_seed(name):
    """Load a seed JSON file."""
    path = os.path.join(SEED_DIR, f'{name}.json')
    if not os.path.exists(path):
        print(f"{RED}  Seed file not found: {path}{RESET}")
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def check_health():
    """Check if the ML service is running and healthy."""
    try:
        resp = requests.get(f'{ML_URL}/health', timeout=10)
        data = resp.json()
        print(f"\n{'=' * 60}")
        print(f"{BOLD}  CollabLens ML Pipeline Test{RESET}")
        print(f"{'=' * 60}")
        print(f"  Service:      {GREEN}Online{RESET} ({ML_URL})")
        print(f"  Models:       {'✅ Loaded' if data.get('models_loaded') else '❌ Not loaded'}")
        device = data.get('device', {})
        print(f"  Device:       {device.get('device', 'unknown').upper()}")
        if device.get('gpu_name'):
            print(f"  GPU:          {device['gpu_name']} ({device.get('gpu_memory_gb', '?')} GB)")
        print(f"  Load Time:    {data.get('load_time_seconds', '?')}s")
        print(f"  Torch:        {device.get('torch_version', '?')}")
        print(f"  Python:       {device.get('python_version', '?')}")
        print(f"{'=' * 60}\n")
        return data.get('models_loaded', False)
    except requests.ConnectionError:
        print(f"\n{RED}❌ ML Service is not running at {ML_URL}{RESET}")
        print(f"   Start it with: cd ml-service && python app.py\n")
        return False
    except Exception as e:
        print(f"\n{RED}❌ Health check failed: {e}{RESET}")
        return False


def validate_report(report, seed_name):
    """Validate that the report has all required fields with sane values."""
    errors = []
    warnings = []

    # ── Required top-level keys ───────────────────────────────
    required_keys = [
        'messages', 'contributions', 'ideaClusters', 'explorationScore',
        'communicationNetwork', 'stuckPeriods', 'timeline', 'summary', 'meta'
    ]
    for key in required_keys:
        if key not in report:
            errors.append(f"Missing required key: {key}")

    if errors:
        return errors, warnings

    # ── Messages ──────────────────────────────────────────────
    msgs = report['messages']
    if not isinstance(msgs, list) or len(msgs) == 0:
        errors.append("messages is empty or not a list")
    else:
        for i, m in enumerate(msgs):
            for field in ['userId', 'userName', 'text', 'sentimentScore', 'messageType', 'clusterLabel']:
                if field not in m:
                    errors.append(f"messages[{i}] missing '{field}'")
                    break

    # ── Contributions ─────────────────────────────────────────
    contrib = report['contributions']
    if 'equity' not in contrib:
        errors.append("contributions.equity missing")
    elif not (0 <= contrib['equity'] <= 1):
        errors.append(f"contributions.equity out of range: {contrib['equity']}")

    if 'byMember' not in contrib:
        errors.append("contributions.byMember missing")
    elif len(contrib['byMember']) == 0:
        warnings.append("contributions.byMember is empty")

    # ── Exploration Score ─────────────────────────────────────
    exp = report['explorationScore']
    if 'score' not in exp:
        errors.append("explorationScore.score missing")
    elif not (0 <= exp['score'] <= 1):
        errors.append(f"explorationScore out of range: {exp['score']}")

    # ── Communication Network ─────────────────────────────────
    net = report['communicationNetwork']
    if 'density' not in net:
        errors.append("communicationNetwork.density missing")
    if 'pattern' not in net:
        errors.append("communicationNetwork.pattern missing")
    if 'nodes' not in net:
        errors.append("communicationNetwork.nodes missing")

    # ── Summary ───────────────────────────────────────────────
    summary = report['summary']
    if 'overallScore' not in summary:
        errors.append("summary.overallScore missing")
    elif not (0 <= summary['overallScore'] <= 1):
        errors.append(f"summary.overallScore out of range: {summary['overallScore']}")

    if 'insights' in summary:
        ins = summary['insights']
        if not ins.get('strengths'):
            warnings.append("No strengths in insights")
        if not ins.get('improvements'):
            warnings.append("No improvements in insights")

    # ── Meta ──────────────────────────────────────────────────
    meta = report['meta']
    if meta.get('analysisTimeSeconds', 0) > 120:
        warnings.append(f"Analysis took {meta['analysisTimeSeconds']}s (>120s)")

    return errors, warnings


def validate_scenario(report, seed_name):
    """Scenario-specific assertions — returns list of failures."""
    failures = []
    contrib = report.get('contributions', {})
    exp = report.get('explorationScore', {})
    net = report.get('communicationNetwork', {})
    stuck = report.get('stuckPeriods', [])
    summary = report.get('summary', {})

    if seed_name == 'balanced_team':
        if contrib.get('equity', 0) < 0.6:
            failures.append(f"Equity {contrib['equity']:.3f} too low for balanced team (expected >= 0.6)")
        if summary.get('overallScore', 0) < 0.5:
            failures.append(f"Overall score {summary['overallScore']:.3f} too low for balanced team (expected >= 0.5)")

    elif seed_name == 'one_dominant':
        if contrib.get('equity', 1) > 0.6:
            failures.append(f"Equity {contrib['equity']:.3f} too high for dominant team (expected <= 0.6)")
        # Check that Raj has highest message count
        by_member = contrib.get('byMember', [])
        if by_member:
            top = max(by_member, key=lambda m: m.get('messageCount', 0))
            if top.get('name', '') != 'Raj':
                failures.append(f"Expected Raj as top contributor, got {top.get('name', '?')}")

    elif seed_name == 'stuck_then_recovered':
        if len(stuck) == 0:
            failures.append("No stuck periods detected (expected at least 1)")

    elif seed_name == 'highly_exploratory':
        if exp.get('score', 0) < 0.3:
            failures.append(f"Exploration score {exp['score']:.3f} too low (expected >= 0.3)")

    return failures


def test_seed(seed_name):
    """Run a single seed dataset through the ML pipeline."""
    print(f"\n{'─' * 60}")
    print(f"{CYAN}{BOLD}  Testing: {seed_name}{RESET}")
    print(f"{'─' * 60}")

    data = load_seed(seed_name)
    if not data:
        return False

    print(f"  Messages:     {len(data['messages'])}")
    print(f"  Participants: {len(data['participants'])}")

    try:
        start = time.time()
        resp = requests.post(
            f'{ML_URL}/analyze',
            json=data,
            timeout=180
        )
        elapsed = time.time() - start

        if resp.status_code != 200:
            print(f"  {RED}❌ HTTP {resp.status_code}: {resp.text[:200]}{RESET}")
            return False

        report = resp.json()

        if 'error' in report:
            print(f"  {RED}❌ ML Error: {report['error']}{RESET}")
            return False

        # Validate structure
        errors, warnings = validate_report(report, seed_name)

        # Validate scenario expectations
        scenario_failures = validate_scenario(report, seed_name)

        # Print results
        print(f"\n  {BOLD}Results:{RESET}")
        print(f"  ├─ Analysis Time:  {elapsed:.1f}s (ML: {report.get('meta', {}).get('analysisTimeSeconds', '?')}s)")
        print(f"  ├─ Device:         {report.get('meta', {}).get('device', '?').upper()}")
        print(f"  ├─ Overall Score:  {report['summary']['overallScore']}")
        print(f"  ├─ Score Label:    {report['summary'].get('scoreLabel', 'N/A')}")
        print(f"  ├─ Equity:         {report['contributions']['equity']} ({report['contributions']['equityLabel']})")
        print(f"  ├─ Exploration:    {report['explorationScore']['score']} ({report['explorationScore']['label']})")
        print(f"  ├─ Clusters:       {report['ideaClusters']['n_clusters']}")
        print(f"  ├─ Network:        {report['communicationNetwork']['pattern']} (density: {report['communicationNetwork']['density']})")
        print(f"  ├─ Stuck Periods:  {len(report['stuckPeriods'])}")
        print(f"  ├─ Timeline:       {len(report['timeline'])} windows")

        # Contributions per member
        print(f"  ├─ Contributions:")
        for m in report['contributions']['byMember']:
            print(f"  │   {m['name']:12} msgs={m['messageCount']:2d}  quality={m['qualityScore']:.3f}  ideas={m['newIdeas']}")

        # Insights
        insights = report['summary'].get('insights', {})
        if insights.get('strengths'):
            print(f"  ├─ Strengths:")
            for s in insights['strengths'][:2]:
                print(f"  │   ✅ {s[:80]}")
        if insights.get('improvements'):
            print(f"  ├─ Improvements:")
            for i in insights['improvements'][:2]:
                print(f"  │   ⚠️  {i[:80]}")

        # Stuck periods detail
        if report['stuckPeriods']:
            print(f"  ├─ Stuck Details:")
            for sp in report['stuckPeriods']:
                rec = sp.get('recovery', {})
                print(f"  │   [{sp['startTime']:.0f}s-{sp['endTime']:.0f}s] score={sp['stuckScore']:.3f}" +
                      (f" → recovered by {rec.get('userName', '?')}" if rec else " → no recovery"))

        # Validation results
        has_errors = False
        if errors:
            print(f"\n  {RED}❌ STRUCTURE ERRORS:{RESET}")
            for e in errors:
                print(f"  │   {RED}• {e}{RESET}")
            has_errors = True

        if scenario_failures:
            print(f"\n  {RED}❌ SCENARIO ASSERTION FAILURES:{RESET}")
            for f in scenario_failures:
                print(f"  │   {RED}• {f}{RESET}")
            has_errors = True

        if warnings:
            print(f"\n  {YELLOW}⚠️  WARNINGS:{RESET}")
            for w in warnings:
                print(f"  │   {YELLOW}• {w}{RESET}")

        if has_errors:
            print(f"\n  {RED}❌ FAILED{RESET}")
            return False

        print(f"\n  {GREEN}✅ PASSED{RESET}")
        return True

    except requests.Timeout:
        print(f"  {RED}❌ Request timed out after 180s{RESET}")
        return False
    except requests.ConnectionError:
        print(f"  {RED}❌ Cannot connect to ML service at {ML_URL}{RESET}")
        return False
    except Exception as e:
        print(f"  {RED}❌ Error: {e}{RESET}")
        import traceback
        traceback.print_exc()
        return False


# ═══════════════════════════════════════════════════════════════
# EDGE CASE TESTS — inline data, no seed files needed
# ═══════════════════════════════════════════════════════════════

EDGE_CASES = {
    "minimum_messages": {
        "description": "Exactly 3 messages (minimum required)",
        "data": {
            "sessionId": "edge_min_msgs",
            "duration": 5,
            "participants": [
                {"userId": "u1", "name": "Alice"},
                {"userId": "u2", "name": "Bob"}
            ],
            "messages": [
                {"userId": "u1", "userName": "Alice", "text": "Let's discuss the database design for our app.", "timestamp": "2026-01-01T10:00:00.000Z", "source": "text", "sequenceNumber": 1},
                {"userId": "u2", "userName": "Bob", "text": "I think we should use PostgreSQL with proper indexing.", "timestamp": "2026-01-01T10:00:30.000Z", "source": "text", "sequenceNumber": 2},
                {"userId": "u1", "userName": "Alice", "text": "Good idea, and we can add Redis for caching hot queries.", "timestamp": "2026-01-01T10:01:00.000Z", "source": "voice", "sequenceNumber": 3}
            ]
        },
        "expect_status": 200
    },
    "single_participant": {
        "description": "All messages from one person",
        "data": {
            "sessionId": "edge_single",
            "duration": 5,
            "participants": [
                {"userId": "u1", "name": "Solo"}
            ],
            "messages": [
                {"userId": "u1", "userName": "Solo", "text": "I'll start by outlining the system architecture.", "timestamp": "2026-01-01T10:00:00.000Z", "source": "text", "sequenceNumber": 1},
                {"userId": "u1", "userName": "Solo", "text": "We need a load balancer in front of the API servers.", "timestamp": "2026-01-01T10:00:30.000Z", "source": "text", "sequenceNumber": 2},
                {"userId": "u1", "userName": "Solo", "text": "For storage, let's use S3 with CloudFront CDN for static assets.", "timestamp": "2026-01-01T10:01:00.000Z", "source": "text", "sequenceNumber": 3},
                {"userId": "u1", "userName": "Solo", "text": "The API layer should be containerized with Docker and deployed on Kubernetes.", "timestamp": "2026-01-01T10:01:30.000Z", "source": "text", "sequenceNumber": 4}
            ]
        },
        "expect_status": 200
    },
    "mixed_voice_text": {
        "description": "Mix of voice and text sources",
        "data": {
            "sessionId": "edge_mixed",
            "duration": 10,
            "participants": [
                {"userId": "u1", "name": "Alice"},
                {"userId": "u2", "name": "Bob"},
                {"userId": "u3", "name": "Carol"}
            ],
            "messages": [
                {"userId": "u1", "userName": "Alice", "text": "Welcome everyone, today we're solving the payment processing bottleneck.", "timestamp": "2026-01-01T10:00:00.000Z", "source": "text", "sequenceNumber": 1},
                {"userId": "u2", "userName": "Bob", "text": "I think we should look at event sourcing for the payment flow.", "timestamp": "2026-01-01T10:00:20.000Z", "source": "voice", "sequenceNumber": 2},
                {"userId": "u3", "userName": "Carol", "text": "Event sourcing would give us an audit trail for free.", "timestamp": "2026-01-01T10:00:40.000Z", "source": "voice", "sequenceNumber": 3},
                {"userId": "u1", "userName": "Alice", "text": "What about using Stripe webhooks with an idempotency key pattern?", "timestamp": "2026-01-01T10:01:00.000Z", "source": "text", "sequenceNumber": 4},
                {"userId": "u2", "userName": "Bob", "text": "Idempotency keys are essential. Every payment mutation needs one.", "timestamp": "2026-01-01T10:01:20.000Z", "source": "voice", "sequenceNumber": 5},
                {"userId": "u3", "userName": "Carol", "text": "We should also implement a dead letter queue for failed payment events.", "timestamp": "2026-01-01T10:01:40.000Z", "source": "text", "sequenceNumber": 6}
            ]
        },
        "expect_status": 200
    },
    "long_messages": {
        "description": "Messages with very long text content",
        "data": {
            "sessionId": "edge_long",
            "duration": 10,
            "participants": [
                {"userId": "u1", "name": "Verbose"},
                {"userId": "u2", "name": "Concise"}
            ],
            "messages": [
                {"userId": "u1", "userName": "Verbose", "text": "So I've been thinking about this problem for a while and I believe that the fundamental issue is not just about the technology stack we choose but rather about how we architect the entire system from the ground up. We need to consider scalability, maintainability, security, performance, and developer experience all at the same time. My proposal is to use a microservices architecture with an API gateway, service mesh, distributed tracing, centralized logging, and automated CI/CD pipelines.", "timestamp": "2026-01-01T10:00:00.000Z", "source": "text", "sequenceNumber": 1},
                {"userId": "u2", "userName": "Concise", "text": "Use Docker.", "timestamp": "2026-01-01T10:00:30.000Z", "source": "text", "sequenceNumber": 2},
                {"userId": "u1", "userName": "Verbose", "text": "That's a good start, but we also need to think about orchestration. Kubernetes would give us auto-scaling, rolling deployments, health checks, and resource management. But Kubernetes has a steep learning curve and significant operational overhead. Maybe we should start with Docker Compose for development and staging, then migrate to Kubernetes for production when we have the team expertise.", "timestamp": "2026-01-01T10:01:00.000Z", "source": "text", "sequenceNumber": 3},
                {"userId": "u2", "userName": "Concise", "text": "Agree. Start simple, scale later.", "timestamp": "2026-01-01T10:01:30.000Z", "source": "text", "sequenceNumber": 4}
            ]
        },
        "expect_status": 200
    },
    "too_few_messages": {
        "description": "Only 2 messages — should return 400 error",
        "data": {
            "sessionId": "edge_too_few",
            "duration": 5,
            "participants": [
                {"userId": "u1", "name": "Alice"},
                {"userId": "u2", "name": "Bob"}
            ],
            "messages": [
                {"userId": "u1", "userName": "Alice", "text": "Hello!", "timestamp": "2026-01-01T10:00:00.000Z", "source": "text", "sequenceNumber": 1},
                {"userId": "u2", "userName": "Bob", "text": "Hi there!", "timestamp": "2026-01-01T10:00:30.000Z", "source": "text", "sequenceNumber": 2}
            ]
        },
        "expect_status": 400
    }
}


def test_edge_case(name, case):
    """Run a single edge case test."""
    print(f"\n  {CYAN}▸ {name}{RESET}: {DIM}{case['description']}{RESET}")

    try:
        start = time.time()
        resp = requests.post(
            f'{ML_URL}/analyze',
            json=case['data'],
            timeout=120
        )
        elapsed = time.time() - start

        expected = case['expect_status']

        if resp.status_code != expected:
            print(f"    {RED}❌ Expected HTTP {expected}, got {resp.status_code}{RESET}")
            if resp.status_code != 200:
                try:
                    err = resp.json()
                    print(f"    {DIM}   Error: {err.get('error', err.get('detail', 'unknown'))}{RESET}")
                except Exception:
                    print(f"    {DIM}   Body: {resp.text[:150]}{RESET}")
            return False

        if expected == 400:
            # Expected error response
            err = resp.json()
            print(f"    {GREEN}✅ Correctly rejected ({elapsed:.1f}s): {err.get('error', '?')}{RESET}")
            return True

        report = resp.json()

        if 'error' in report:
            print(f"    {RED}❌ Unexpected ML error: {report['error']}{RESET}")
            return False

        # Quick validation
        errors, _ = validate_report(report, name)
        if errors:
            print(f"    {RED}❌ Validation errors: {', '.join(errors[:3])}{RESET}")
            return False

        score = report.get('summary', {}).get('overallScore', '?')
        equity = report.get('contributions', {}).get('equity', '?')
        msgs = len(report.get('messages', []))
        print(f"    {GREEN}✅ Passed ({elapsed:.1f}s) — score={score} equity={equity} msgs={msgs}{RESET}")
        return True

    except requests.Timeout:
        print(f"    {RED}❌ Timed out after 120s{RESET}")
        return False
    except requests.ConnectionError:
        print(f"    {RED}❌ Connection failed{RESET}")
        return False
    except Exception as e:
        print(f"    {RED}❌ Error: {e}{RESET}")
        return False


def run_edge_tests():
    """Run all edge case tests."""
    print(f"\n{'─' * 60}")
    print(f"{CYAN}{BOLD}  Edge Case Tests{RESET}")
    print(f"{'─' * 60}")

    results = {}
    for name, case in EDGE_CASES.items():
        results[name] = test_edge_case(name, case)

    return results


def run_quick_test():
    """Quick sanity check — 3 messages, no seed files needed."""
    print(f"\n{'═' * 60}")
    print(f"{BOLD}  CollabLens ML Pipeline — Quick Sanity Test{RESET}")
    print(f"{'═' * 60}")

    data = {
        "sessionId": "quick_test",
        "duration": 5,
        "participants": [
            {"userId": "u1", "name": "Tester1"},
            {"userId": "u2", "name": "Tester2"}
        ],
        "messages": [
            {"userId": "u1", "userName": "Tester1", "text": "What if we use a graph database for the social network feature? Neo4j could handle relationship queries efficiently.", "timestamp": "2026-01-01T10:00:00.000Z", "source": "text", "sequenceNumber": 1},
            {"userId": "u2", "userName": "Tester2", "text": "Good idea! But we should also consider the cost. Maybe start with PostgreSQL's JSONB for MVP and migrate later.", "timestamp": "2026-01-01T10:00:30.000Z", "source": "text", "sequenceNumber": 2},
            {"userId": "u1", "userName": "Tester1", "text": "That makes sense. PostgreSQL JSONB with proper indexing should handle our initial scale. We can benchmark and decide.", "timestamp": "2026-01-01T10:01:00.000Z", "source": "voice", "sequenceNumber": 3}
        ]
    }

    print(f"\n  Sending 3-message test payload to {ML_URL}/analyze...")

    try:
        start = time.time()
        resp = requests.post(f'{ML_URL}/analyze', json=data, timeout=120)
        elapsed = time.time() - start

        if resp.status_code != 200:
            print(f"\n  {RED}❌ HTTP {resp.status_code}{RESET}")
            print(f"  {resp.text[:300]}")
            return False

        report = resp.json()

        if 'error' in report:
            print(f"\n  {RED}❌ ML Error: {report['error']}{RESET}")
            return False

        print(f"\n  {GREEN}✅ Quick test passed in {elapsed:.1f}s{RESET}")
        print(f"  ├─ Overall Score:  {report['summary']['overallScore']}")
        print(f"  ├─ Equity:         {report['contributions']['equity']}")
        print(f"  ├─ Exploration:    {report['explorationScore']['score']}")
        print(f"  ├─ Clusters:       {report['ideaClusters']['n_clusters']}")
        print(f"  ├─ Network:        {report['communicationNetwork']['pattern']}")
        print(f"  ├─ Stuck Periods:  {len(report['stuckPeriods'])}")
        print(f"  ├─ Messages:       {len(report['messages'])} enriched")
        print(f"  └─ Device:         {report['meta']['device'].upper()}")

        # Validate structure
        errors, warnings = validate_report(report, 'quick')
        if errors:
            print(f"\n  {RED}❌ Validation errors:{RESET}")
            for e in errors:
                print(f"     {RED}• {e}{RESET}")
            return False

        print(f"\n  {GREEN}{BOLD}🎉 ML pipeline is functional!{RESET}\n")
        return True

    except requests.ConnectionError:
        print(f"\n  {RED}❌ Cannot connect to ML service at {ML_URL}{RESET}")
        print(f"     Start it with: cd ml-service && python app.py\n")
        return False
    except Exception as e:
        print(f"\n  {RED}❌ Error: {e}{RESET}")
        return False


def run_local_test():
    """Test modules directly without the Flask server."""
    print(f"\n{'═' * 60}")
    print(f"{BOLD}  CollabLens ML Pipeline — Local Module Test{RESET}")
    print(f"{'═' * 60}\n")

    print("Loading modules...")
    from modules.device import DEVICE_STR, get_device_info
    print(f"  Device: {DEVICE_STR.upper()}")
    print(f"  Info: {get_device_info()}")

    from modules.embeddings import get_embeddings
    print("  ✅ Embeddings module loaded")

    from modules.sentiment import get_sentiments_batch
    print("  ✅ Sentiment module loaded")

    from modules.classifier import classify_batch
    print("  ✅ Classifier module loaded")

    # Quick sanity test
    texts = [
        "What if we use Redis for caching?",
        "I agree, that's a great idea.",
        "But what about the memory overhead?"
    ]

    print("\nRunning quick sanity test...")
    embeddings = get_embeddings(texts)
    print(f"  Embeddings shape: {embeddings.shape}")

    sentiments = get_sentiments_batch(texts)
    print(f"  Sentiments: {[s['label'] for s in sentiments]}")

    classifications = classify_batch(texts)
    print(f"  Classifications: {[c['label'] for c in classifications]}")

    print(f"\n{GREEN}✅ All modules loaded and functional{RESET}\n")


def main():
    seeds = ['balanced_team', 'one_dominant', 'stuck_then_recovered', 'highly_exploratory']

    # Handle flags
    if '--local' in sys.argv:
        run_local_test()
        return

    if '--quick' in sys.argv:
        success = run_quick_test()
        sys.exit(0 if success else 1)

    if '--edge' in sys.argv:
        if not check_health():
            return
        results = run_edge_tests()
        passed = sum(1 for v in results.values() if v)
        total = len(results)
        print(f"\n  {passed}/{total} edge tests passed")
        sys.exit(0 if passed == total else 1)

    # Handle single seed argument
    run_seeds_only = False
    if len(sys.argv) > 1 and not sys.argv[1].startswith('--'):
        seed_name = sys.argv[1]
        if seed_name not in seeds:
            print(f"{RED}Unknown seed: {seed_name}{RESET}")
            print(f"Available: {', '.join(seeds)}")
            return
        seeds = [seed_name]
        run_seeds_only = True

    # Check health
    if not check_health():
        return

    # Run seed tests
    results = {}
    for seed_name in seeds:
        results[seed_name] = test_seed(seed_name)

    # Run edge tests too (unless single seed was requested)
    edge_results = {}
    if not run_seeds_only:
        edge_results = run_edge_tests()

    # Summary
    all_results = {**results, **edge_results}
    print(f"\n{'═' * 60}")
    print(f"{BOLD}  Test Summary{RESET}")
    print(f"{'═' * 60}")

    if results:
        print(f"\n  {BOLD}Seed Tests:{RESET}")
        for name, result in results.items():
            status = f"{GREEN}PASS{RESET}" if result else f"{RED}FAIL{RESET}"
            print(f"    {status}  {name}")

    if edge_results:
        print(f"\n  {BOLD}Edge Case Tests:{RESET}")
        for name, result in edge_results.items():
            status = f"{GREEN}PASS{RESET}" if result else f"{RED}FAIL{RESET}"
            print(f"    {status}  {name}")

    passed = sum(1 for v in all_results.values() if v)
    total = len(all_results)
    print(f"\n  {passed}/{total} total tests passed")

    if passed == total:
        print(f"  {GREEN}{BOLD}🎉 All tests passed!{RESET}\n")
    else:
        print(f"  {RED}{BOLD}⚠️  Some tests failed{RESET}\n")
        sys.exit(1)


if __name__ == '__main__':
    main()
