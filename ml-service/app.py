"""
CollabLens — ML Service (Flask Application)

Main entry point for the Python ML analysis engine.
Orchestrates all 8 analysis modules into a unified pipeline.

Endpoints:
  POST /analyze  — Full session analysis (10-30s on CPU, faster on GPU)
  GET  /health   — Service health + device info + model status

Architecture:
  Node.js Backend -> POST /analyze -> This Flask service -> Report JSON
  Models are pre-loaded at startup (one-time ~600MB download on first run).

Device Priority: CUDA GPU -> CPU (auto-detected at startup)
"""

import sys
import os

# ─── Force UTF-8 output on Windows (fixes cp1252 emoji crash) ─
if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

import copy
import time
import traceback
from datetime import datetime

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np

# ─── Pre-warm models at import time ───────────────────────────
# This happens ONCE when the server starts. All models loaded into
# GPU memory (if available) or CPU RAM.
print("=" * 60)
print("  CollabLens ML Service — Loading Models...")
print("=" * 60)

load_start = time.time()

from modules.device import DEVICE_STR, get_device_info
from modules.embeddings import get_embeddings
from modules.sentiment import get_sentiments_batch
from modules.classifier import classify_batch
from modules.clustering import cluster_messages
from modules.network import build_network
from modules.stuck_detection import detect_stuck_periods
from modules.exploration import compute_exploration_score
from modules.contributions import analyze_contributions
from modules.timeline import generate_timeline
from modules.report_builder import build_summary

load_time = time.time() - load_start

print("=" * 60)
print(f"  ✅ All models loaded in {load_time:.1f}s on {DEVICE_STR.upper()}")
print("=" * 60)

# ─── Flask App ────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)  # type: ignore[arg-type]  — Pyrefly Flask version alias mismatch


def to_serializable(val):
    """Recursively convert numpy types, tuples, sets to JSON-serializable Python natives."""
    if isinstance(val, (np.floating, float)):
        return float(val)
    elif isinstance(val, (np.integer, int)):
        return int(val)
    elif isinstance(val, (np.bool_, bool)):
        return bool(val)
    elif isinstance(val, np.ndarray):
        return [to_serializable(x) for x in val.tolist()]
    elif isinstance(val, dict):
        return {str(k): to_serializable(v) for k, v in val.items()}
    elif isinstance(val, (list, tuple, set)):
        return [to_serializable(x) for x in val]
    return val


# Track model load status
MODELS_LOADED = True


@app.route('/health', methods=['GET'])
def health():
    """
    Health check endpoint.
    Backend calls this to verify ML service is up and models are loaded.
    """
    device_info = get_device_info()
    return jsonify({
        "status": "ok",
        "models_loaded": MODELS_LOADED,
        "device": device_info,
        "load_time_seconds": round(load_time, 1)
    })


@app.route('/analyze', methods=['POST'])
def analyze():
    """
    Full session analysis pipeline.

    Input JSON:
    {
        "messages": [
            { "userId", "userName", "text", "timestamp", "source", "sequenceNumber" }
        ],
        "participants": [
            { "userId"/"id", "name"/"userName" }
        ],
        "duration": int (optional, timer duration in minutes),
        "sessionId": str (optional, for logging)
    }

    Output JSON:
    {
        "messages": [...enriched with sentiment, classification, cluster],
        "contributions": { byMember, equity, equityLabel },
        "ideaClusters": { labels, n_clusters, clusters },
        "explorationScore": { score, label, interpretation },
        "communicationNetwork": { density, reciprocity, pattern, nodes, edges },
        "stuckPeriods": [...],
        "timeline": [...],
        "summary": { overallScore, insights, collectiveIntelligenceIndicators }
    }
    """
    analysis_start = time.time()

    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No JSON data provided"}), 400

        # Deep copy to avoid mutating input (CORRECTION from roadmap)
        messages = copy.deepcopy(data.get('messages', []))
        participants = data.get('participants', [])
        session_id = data.get('sessionId', 'unknown')

        print(f"\n{'─' * 50}")
        print(f"📊 Analysis started for session: {session_id}")
        print(f"   Messages: {len(messages)} | Participants: {len(participants)}")

        # ── Guard clause: insufficient data ───────────────────
        if len(messages) < 3:
            return jsonify({
                "error": "Insufficient data for analysis",
                "detail": f"Need at least 3 messages, got {len(messages)}",
                "min_messages": 3
            }), 400

        # ── Parse timestamps ──────────────────────────────────
        for m in messages:
            ts = m.get('timestamp', '')
            if isinstance(ts, str):
                ts = ts.replace('Z', '+00:00')
                try:
                    m['_parsed_ts'] = datetime.fromisoformat(ts)
                except ValueError:
                    m['_parsed_ts'] = datetime.now()
            elif isinstance(ts, datetime):
                m['_parsed_ts'] = ts
            else:
                m['_parsed_ts'] = datetime.now()

        # Sort messages by timestamp
        messages.sort(key=lambda m: m['_parsed_ts'])

        # ── Extract texts ─────────────────────────────────────
        texts = [m.get('text', '') for m in messages]

        # ══════════════════════════════════════════════════════
        # STEP 1: Semantic Encoding (Foundation)
        # ══════════════════════════════════════════════════════
        step_start = time.time()
        embeddings = get_embeddings(texts)
        print(f"   ✓ Embeddings: {time.time() - step_start:.2f}s")

        # ══════════════════════════════════════════════════════
        # STEP 2: Sentiment Analysis
        # ══════════════════════════════════════════════════════
        step_start = time.time()
        sentiments = get_sentiments_batch(texts)
        sentiment_scores = [s['score'] for s in sentiments]
        print(f"   ✓ Sentiment: {time.time() - step_start:.2f}s")

        # ══════════════════════════════════════════════════════
        # STEP 3: Zero-Shot Classification (Batch — faster)
        # ══════════════════════════════════════════════════════
        step_start = time.time()
        classifications = classify_batch(texts)
        print(f"   ✓ Classification: {time.time() - step_start:.2f}s ({len(texts)} msgs)")

        # ══════════════════════════════════════════════════════
        # STEP 4: Idea Clustering (DBSCAN)
        # ══════════════════════════════════════════════════════
        step_start = time.time()
        cluster_result = cluster_messages(embeddings, messages)
        cluster_labels: list[int] = cluster_result['labels']  # type: ignore[assignment]
        print(f"   ✓ Clustering: {time.time() - step_start:.2f}s → {cluster_result['n_clusters']} clusters")

        # ══════════════════════════════════════════════════════
        # STEP 5: Communication Network Analysis
        # ══════════════════════════════════════════════════════
        step_start = time.time()
        network_data = build_network(messages, embeddings)
        print(f"   ✓ Network: {time.time() - step_start:.2f}s → {network_data['pattern']}")

        # ══════════════════════════════════════════════════════
        # STEP 6: Stuck Detection
        # ══════════════════════════════════════════════════════
        step_start = time.time()
        stuck_periods = detect_stuck_periods(
            messages, embeddings, sentiment_scores,
            cluster_labels, classifications
        )
        print(f"   ✓ Stuck Detection: {time.time() - step_start:.2f}s → {len(stuck_periods)} periods")

        # ══════════════════════════════════════════════════════
        # STEP 7: Exploration Score
        # ══════════════════════════════════════════════════════
        step_start = time.time()
        exploration_data = compute_exploration_score(cluster_labels)
        print(f"   ✓ Exploration: {time.time() - step_start:.2f}s → {exploration_data['score']}")

        # ══════════════════════════════════════════════════════
        # STEP 8: Contribution Analysis
        # ══════════════════════════════════════════════════════
        step_start = time.time()
        contribution_data = analyze_contributions(
            messages, classifications, sentiments, participants
        )
        print(f"   ✓ Contributions: {time.time() - step_start:.2f}s → equity: {contribution_data['equity']}")

        # ══════════════════════════════════════════════════════
        # STEP 9: Timeline Generation
        # ══════════════════════════════════════════════════════
        step_start = time.time()
        timeline = generate_timeline(
            messages, classifications, sentiments,
            cluster_labels, stuck_periods
        )
        print(f"   ✓ Timeline: {time.time() - step_start:.2f}s → {len(timeline)} windows")

        # ══════════════════════════════════════════════════════
        # STEP 10: Summary & Insights
        # ══════════════════════════════════════════════════════
        step_start = time.time()
        summary = build_summary(
            messages, participants, exploration_data,
            stuck_periods, network_data, contribution_data, timeline
        )
        print(f"   ✓ Summary: {time.time() - step_start:.2f}s → score: {summary['overallScore']}")

        # ══════════════════════════════════════════════════════
        # BUILD ENRICHED MESSAGES (for detailed report view)
        # ══════════════════════════════════════════════════════
        enriched_messages = []
        for i, m in enumerate(messages):
            enriched = {
                "userId": m.get('userId', ''),
                "userName": m.get('userName', ''),
                "text": m.get('text', ''),
                "timestamp": m.get('timestamp', ''),
                "sequenceNumber": m.get('sequenceNumber', i + 1),
                "source": m.get('source', 'text'),
                "sentimentScore": sentiments[i]['score'] if i < len(sentiments) else 0.5,
                "sentimentLabel": sentiments[i]['label'] if i < len(sentiments) else 'neutral',
                "messageType": (
                    classifications[i]['label'] if i < len(classifications) and isinstance(classifications[i], dict)
                    else classifications[i] if i < len(classifications)
                    else 'unknown'
                ),
                "messageTypeConfidence": (
                    classifications[i].get('confidence', 0) if i < len(classifications) and isinstance(classifications[i], dict)
                    else 0
                ),
                "clusterLabel": cluster_labels[i] if i < len(cluster_labels) else -1
            }
            enriched_messages.append(enriched)

        # ══════════════════════════════════════════════════════
        # FINAL RESPONSE
        # ══════════════════════════════════════════════════════
        total_time = time.time() - analysis_start

        print(f"{'─' * 50}")
        print(f"✅ Analysis complete in {total_time:.1f}s")
        print(f"   Overall Score: {summary['overallScore']}")
        print(f"{'─' * 50}\n")

        report = {
            "messages": enriched_messages,
            "contributions": contribution_data,
            "ideaClusters": {
                "clusters": cluster_result.get('clusters', []),
                "n_clusters": cluster_result['n_clusters'],
                "noise_count": cluster_result.get('noise_count', 0)
            },
            "explorationScore": exploration_data,
            "communicationNetwork": network_data,
            "stuckPeriods": stuck_periods,
            "timeline": timeline,
            "summary": summary,
            "meta": {
                "analysisTimeSeconds": round(total_time, 2),
                "messageCount": len(messages),
                "participantCount": len(participants),
                "device": DEVICE_STR
            }
        }

        return jsonify(to_serializable(report))

    except Exception as e:
        total_time = time.time() - analysis_start
        error_trace = traceback.format_exc()
        print(f"\n❌ Analysis failed after {total_time:.1f}s")
        print(f"   Error: {str(e)}")
        print(error_trace)

        return jsonify({
            "error": "Analysis pipeline failed",
            "detail": str(e),
            "traceback": error_trace
        }), 500


# ─── Entry Point ──────────────────────────────────────────────
if __name__ == '__main__':
    import os
    import socket as _socket

    base_port = int(os.environ.get('PORT', 5000))
    MAX_PORT_RETRIES = 3

    for attempt in range(MAX_PORT_RETRIES):
        port = base_port + attempt
        try:
            # Pre-check if port is available (avoids cryptic Windows errors)
            test_sock = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
            test_sock.settimeout(1)
            result = test_sock.connect_ex(('127.0.0.1', port))
            test_sock.close()

            if result == 0:
                # Port is in use
                print(f"⚠️  Port {port} is already in use — trying {port + 1}...")
                continue

            print(f"\n🚀 CollabLens ML Service starting on port {port}")
            print(f"   Device: {DEVICE_STR.upper()}")
            print(f"   Health: http://localhost:{port}/health")
            print(f"   Analyze: POST http://localhost:{port}/analyze\n")
            app.run(host='0.0.0.0', port=port, debug=False)
            break

        except OSError as e:
            if 'address already in use' in str(e).lower() or 'access' in str(e).lower():
                print(f"⚠️  Port {port} blocked ({e}) — trying {port + 1}...")
                continue
            else:
                print(f"❌ Failed to start server: {e}")
                sys.exit(1)
    else:
        print(f"\n❌ Could not find an available port in range {base_port}-{base_port + MAX_PORT_RETRIES - 1}")
        print(f"   Try killing the process using port {base_port}:")
        print(f"   Windows: netstat -ano | findstr :{base_port}")
        print(f"            taskkill /PID <PID> /F")
        sys.exit(1)

