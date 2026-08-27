# CollabLens — Corrected Roadmap v2 (Part 2: Phases 4-9 + Deployment)

> Continuation of Part 1. All corrections marked with `[CORRECTION]`.

---

## PHASE 4 — ML Pipeline (Week 4-6)

> Can be developed **in parallel** with Phase 3 by a different team member.
> Test every module against seed data BEFORE integration.

**Step 1: Flask server** — same as Draft 1 but correct port:
```python
if __name__ == '__main__':
    app.run(port=5000, debug=True)  # [CORRECTION] Port 5000, not 8000
```

**Step 2: Build modules one at a time**

**Module 1 — Embeddings:** unchanged from Draft 1. `all-MiniLM-L6-v2`, ~80MB.

**Module 2 — Sentiment:**

```python
# modules/sentiment.py
from textblob import TextBlob

def normalize_sentiment(raw_score, source='textblob'):
    """
    [CORRECTION] Abstracted normalization function.
    Draft 1 hardcoded TextBlob normalization. If you later switch to
    RoBERTa sentiment (probability distribution output), this function
    is the ONLY place you change. Without this, switching models breaks
    stuck detection silently because it assumes 0.5 = neutral.
    """
    if source == 'textblob':
        return (raw_score + 1) / 2  # [-1,1] → [0,1]
    elif source == 'roberta':
        return raw_score  # already 0-1
    return 0.5

def get_sentiment(text):
    blob = TextBlob(text)
    score = normalize_sentiment(blob.sentiment.polarity, 'textblob')
    return {
        "score": score,
        "label": "positive" if score > 0.6 else "negative" if score < 0.4 else "neutral"
    }
```

**Module 3 — Zero-shot Classification:**

```python
# modules/classifier.py
from transformers import pipeline

# [CORRECTION] Use distilbart, NOT bart-large-mnli.
# Draft 1 used facebook/bart-large-mnli (1.6GB, ~1-3 sec/message).
# Context Doc Section 18 specifies valhalla/distilbart-mnli-12-3 (~500MB, ~0.5-1 sec/message).
# For 50 messages: distilbart ≈ 25-50s vs bart-large ≈ 50-150s.
classifier = pipeline("zero-shot-classification", model="valhalla/distilbart-mnli-12-3")

CATEGORIES = ["new idea", "building on idea", "agreement",
              "disagreement", "question", "coordination", "off-topic"]

def classify_message(text):
    result = classifier(text, CATEGORIES)
    return result['labels'][0]

def classify_batch(texts):
    """[ADDED] Batch classification — significantly faster than one-by-one."""
    results = classifier(texts, CATEGORIES)
    if isinstance(results, dict):
        results = [results]
    return [r['labels'][0] for r in results]
```

**Module 4 — DBSCAN Clustering:**

```python
# modules/clustering.py
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import cosine_distances

def cluster_messages(embeddings, eps=0.5, min_samples=2):
    """
    [CORRECTION] eps changed from 0.3 to 0.5.
    Cosine distances range 0-2. eps=0.3 means messages must be >85% similar
    to cluster — too tight, almost everything becomes noise.
    eps=0.5 (~75% similarity threshold) is a better starting point.
    Tune empirically with seed data.
    """
    distances = cosine_distances(embeddings)
    db = DBSCAN(eps=eps, min_samples=min_samples, metric='precomputed')
    labels = db.fit_predict(distances)
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    return labels, n_clusters
```

**Module 5 — Communication Network:**

```python
# modules/network.py
import networkx as nx
from sklearn.metrics.pairwise import cosine_similarity

def build_network(messages, embeddings, response_window_seconds=60):
    """
    [CORRECTION] Draft 1 used ONLY temporal proximity (60s window).
    In fast group chat, this connects everyone to everyone → density ≈ 1.0
    for every session → network analysis becomes useless.
    
    Fix: Require BOTH temporal proximity AND semantic relevance.
    Person B's message must be within 60s of Person A's AND have
    cosine similarity > 0.3, indicating topical relevance.
    """
    G = nx.DiGraph()
    participants = list(set(m['userId'] for m in messages))
    G.add_nodes_from(participants)
    
    for i, msg in enumerate(messages):
        for j in range(i+1, len(messages)):
            next_msg = messages[j]
            time_diff = (next_msg['timestamp'] - msg['timestamp']).total_seconds()
            if time_diff > response_window_seconds:
                break
            if next_msg['userId'] != msg['userId']:
                # [ADDED] Semantic relevance check
                sim = cosine_similarity(
                    embeddings[i].reshape(1, -1),
                    embeddings[j].reshape(1, -1)
                )[0][0]
                
                if sim > 0.3 or j == i + 1:  # topically related OR direct reply
                    if G.has_edge(msg['userId'], next_msg['userId']):
                        G[msg['userId']][next_msg['userId']]['weight'] += 1
                    else:
                        G.add_edge(msg['userId'], next_msg['userId'], weight=1)
    
    return {
        "degree_centrality": nx.degree_centrality(G),
        "betweenness_centrality": nx.betweenness_centrality(G),
        "density": nx.density(G),
        "reciprocity": nx.reciprocity(G) if G.number_of_edges() > 0 else 0,
        "isolated_nodes": [n for n in G.nodes if G.degree(n) == 0],
        "edges": [{"from": u, "to": v, "weight": d['weight']}
                  for u, v, d in G.edges(data=True)],
        "node_positions": {str(k): [float(v[0]), float(v[1])]
                          for k, v in nx.spring_layout(G).items()}
    }
```

**Module 6 — Stuck Detection:**

```python
# modules/stuck_detection.py
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

def detect_stuck_periods(messages, embeddings, sentiments, cluster_labels,
                         window_seconds=60):
    """
    [CORRECTION] Draft 1 had a logic bug in "no new clusters" signal.
    It compared clusters within the CURRENT window only.
    A cluster from 3 minutes ago reappearing would be counted as "new".
    Fix: Track ALL clusters seen across the entire session history.
    
    Also: sentiments and cluster_labels are now passed as parameters
    instead of being read from mutated message dicts.
    """
    stuck_periods = []
    if len(messages) < 3:  # [ADDED] Guard clause — Draft 1 would crash
        return stuck_periods
    
    start_time = messages[0]['timestamp']
    session_duration = (messages[-1]['timestamp'] - start_time).total_seconds()
    
    seen_clusters = set()  # [CORRECTION] Track ALL clusters seen so far
    t = 0
    
    while t < session_duration:
        window_end = t + window_seconds
        window_indices = [
            i for i, m in enumerate(messages)
            if t <= (m['timestamp'] - start_time).total_seconds() < window_end
        ]
        
        # Update seen clusters from messages BEFORE this window
        pre_window = [
            i for i, m in enumerate(messages)
            if (m['timestamp'] - start_time).total_seconds() < t
        ]
        for idx in pre_window:
            if cluster_labels[idx] != -1:
                seen_clusters.add(cluster_labels[idx])
        
        if len(window_indices) < 2:
            t += 30
            continue
        
        w_embeddings = embeddings[window_indices]
        
        # Signal 1: Semantic similarity spike
        sim_matrix = cosine_similarity(w_embeddings)
        np.fill_diagonal(sim_matrix, 0)
        n = len(window_indices)
        avg_sim = sim_matrix.sum() / (n * (n - 1)) if n > 1 else 0
        similarity_score = min(avg_sim / 0.75, 1.0)
        
        # Signal 2: Sentiment drop
        w_sentiments = [sentiments[i] for i in window_indices]
        sentiment_score = max(0, (0.5 - np.mean(w_sentiments)) * 2)
        
        # Signal 3: No new clusters — [FIXED]
        window_cluster_set = {cluster_labels[i] for i in window_indices
                              if cluster_labels[i] != -1}
        has_new = bool(window_cluster_set - seen_clusters)
        no_new_cluster_score = 0 if has_new else 1
        
        # Signal 4: Message gap
        times = [(messages[i]['timestamp'] - start_time).total_seconds()
                 for i in window_indices]
        avg_gap = np.mean(np.diff(times)) if len(times) > 1 else 30
        gap_score = min(avg_gap / 30, 1.0)
        
        stuck_score = (0.35 * similarity_score +
                      0.25 * sentiment_score +
                      0.25 * no_new_cluster_score +
                      0.15 * gap_score)
        
        if stuck_score > 0.6:
            stuck_periods.append({
                "start_time": t,
                "end_time": window_end,
                "stuck_score": round(stuck_score, 3),
                "signals": {
                    "similarity": round(similarity_score, 3),
                    "sentiment": round(sentiment_score, 3),
                    "no_new_clusters": no_new_cluster_score,
                    "message_gap": round(gap_score, 3)
                }
            })
        
        t += 30
    
    return stuck_periods
```

**Module 7 — Exploration Score:**

```python
# modules/exploration.py
import numpy as np
from scipy.stats import entropy

def compute_exploration_score(cluster_labels):
    valid = [l for l in cluster_labels if l != -1]
    if len(valid) == 0:
        return 0.0
    
    unique = list(set(valid))
    n_clusters = len(unique)
    if n_clusters <= 1:
        return 0.0
    
    counts = [valid.count(c) for c in unique]
    dist = np.array(counts, dtype=float) / sum(counts)
    
    # [CORRECTION] Filter zero entries to prevent entropy returning inf
    dist = dist[dist > 0]
    
    raw = entropy(dist)
    max_ent = np.log(n_clusters)
    
    return round(raw / max_ent, 3) if max_ent > 0 else 0.0
```

**Module 8 — Contribution Quality Score:** `[ADDED]`

> `[CORRECTION]` Draft 1 never defined how qualityScore per member is computed.
> The Context Doc mentions it in the report structure but no formula existed.

```python
def compute_quality_score(member_classifications):
    """
    member_classifications: list of message types for one member
    """
    total = len(member_classifications)
    if total == 0:
        return 0.0
    
    counts = {t: member_classifications.count(t) for t in
              ["new idea", "building on idea", "question",
               "agreement", "disagreement", "off-topic", "coordination"]}
    
    score = (0.40 * (counts.get("new idea", 0) / total) +
             0.30 * (counts.get("building on idea", 0) / total) +
             0.20 * (counts.get("question", 0) / total) +
             0.10 * (1 - counts.get("off-topic", 0) / total))
    
    return round(score, 3)
```

**Step 3: Wire together in `app.py`**

```python
import copy
from datetime import datetime

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.get_json()
    # [CORRECTION] Deep copy to avoid mutating input — Draft 1 mutated in place
    messages = copy.deepcopy(data['messages'])
    participants = data['participants']
    
    for m in messages:
        m['timestamp'] = datetime.fromisoformat(m['timestamp'])
    
    # Guard clause — [ADDED]
    if len(messages) < 3:
        return jsonify({"error": "Insufficient data", "min_messages": 3}), 400
    
    texts = [m['text'] for m in messages]
    embeddings = get_embeddings(texts)
    
    # Batch classification — [CORRECTION] much faster than per-message
    classifications = classify_batch(texts)
    sentiments_list = [get_sentiment(t)['score'] for t in texts]
    
    cluster_labels, n_clusters = cluster_messages(embeddings)
    
    # [CORRECTION] Pass embeddings to network builder for semantic filtering
    network_data = build_network(messages, embeddings)
    
    stuck_periods = detect_stuck_periods(
        messages, embeddings, sentiments_list, cluster_labels
    )
    exploration_score = compute_exploration_score(cluster_labels)
    
    # Per-member quality scores — [ADDED]
    member_scores = {}
    for p in participants:
        uid = p['userId']
        member_types = [classifications[i] for i, m in enumerate(messages)
                       if m['userId'] == uid]
        member_scores[uid] = compute_quality_score(member_types)
    
    # Recovery analysis
    for period in stuck_periods:
        recovery = next(
            (m for m in messages
             if (m['timestamp'] - messages[0]['timestamp']).total_seconds()
             >= period['end_time']),
            None
        )
        if recovery:
            idx = messages.index(recovery)
            period['recovery_message'] = {
                'userId': recovery['userId'],
                'text': recovery['text'],
                'type': classifications[idx]
            }
    
    # Build enriched message list for report
    enriched = []
    for i, m in enumerate(messages):
        enriched.append({
            **{k: v for k, v in m.items() if k != 'timestamp'},
            'timestamp': m['timestamp'].isoformat(),
            'sentiment_score': sentiments_list[i],
            'message_type': classifications[i],
            'cluster_label': int(cluster_labels[i])
        })
    
    return jsonify({
        "messages": enriched,
        "exploration_score": exploration_score,
        "n_clusters": n_clusters,
        "stuck_periods": stuck_periods,
        "network": network_data,
        "member_quality_scores": member_scores,
        "summary": build_summary(messages, participants, exploration_score,
                                stuck_periods, network_data)
    })
```

**Pre-warm models at startup:**
```python
print("Loading models...")
from modules.embeddings import model as embedder
from modules.classifier import classifier
print("Models ready.")
```

---

## PHASE 5 — Voice Input (Week 6)

> `[CORRECTION]` Moved from Phase 2 to Phase 5. Draft 1 built voice too early.
> Voice depends on a working chat pipeline, can't be automated-tested, and the
> ML pipeline processes voice transcripts identically to text. Building voice
> early adds zero value to the critical path.

**useVoice hook — corrected:**

```javascript
import { useState, useRef, useEffect } from 'react';

export function useVoice({ onTranscript }) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // [CORRECTION] Cleanup on unmount — Draft 1 had a memory leak.
  // If component unmounts while recording, the recognition object
  // keeps firing events into a dead component.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Voice requires Chrome or Edge.");
      return;
    }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      onTranscript(transcript);
    };

    // [ADDED] Graceful degradation on error
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        alert('Microphone access denied.');
      }
      setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  return { isListening, startListening, stopListening };
}
```

---

## PHASE 6 — Report Page (Week 6-7)

Same structure as Draft 1 (contribution chart, network graph, exploration gauge, cluster bubbles, timeline, insight cards) with this correction:

> `[CORRECTION]` Network graph positions should come from Python (NetworkX `spring_layout`),
> not be computed on the frontend. The corrected `network.py` already returns `node_positions`.
> Frontend just renders SVG circles at those coordinates.

**Insight builder (`report_builder.py`):** Same logic as Draft 1.

---

## PHASE 7 — Integration + Error Handling (Week 7-8)

> `[CORRECTION]` Draft 1 had zero error handling. This phase is DEDICATED to it.

**Node.js → Python connection with retry:**

```javascript
async function analyzeSession(session, messages) {
  const MAX_RETRIES = 3;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      io.to(session.roomCode).emit('analyzing', {
        message: `Analyzing your session... (attempt ${attempt})`
      });
      
      const response = await fetch(`${process.env.ML_SERVICE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages,
          participants: session.participants,
          duration: session.settings.timerDuration
        }),
        signal: AbortSignal.timeout(120000) // 2 min timeout
      });
      
      if (!response.ok) throw new Error(`ML service returned ${response.status}`);
      
      const report = await response.json();
      await Report.create({ sessionId: session._id, ...report, generatedAt: new Date() });
      io.to(session.roomCode).emit('report_ready', { sessionId: session._id });
      return;
      
    } catch (err) {
      console.error(`Analysis attempt ${attempt} failed:`, err.message);
      if (attempt === MAX_RETRIES) {
        // [ADDED] Save as pending for manual retry
        session.status = 'analysis_pending';
        await session.save();
        io.to(session.roomCode).emit('analysis_error', {
          message: 'Analysis failed. You can retry from session history.',
          sessionId: session._id
        });
      } else {
        await new Promise(r => setTimeout(r, 2000 * attempt)); // backoff
      }
    }
  }
}
```

**Room cleanup — zombie room prevention:** `[ADDED]`

```javascript
// Run every 5 minutes
setInterval(async () => {
  const staleRooms = await Session.find({
    status: 'waiting',
    createdAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) } // 30 min old
  });
  for (const room of staleRooms) {
    room.status = 'cancelled';
    await room.save();
    io.to(room.roomCode).emit('room_closed', { reason: 'Room expired' });
  }
}, 300000);
```

---

## PHASE 8 — Problems Bank (Week 8)

Same as Draft 1. Build 5-8 problems. Store in MongoDB `problems` collection.

---

## PHASE 9 — Polish + Testing (Week 9-10)

**Testing checklist** (expanded from Draft 1):
- 4 people join same room with auth
- Timer auto-ends session
- Empty session (1-2 messages) → ML returns graceful error
- Heavy session (80+ messages) → completes within 2 minutes
- Voice in Chrome
- User disconnects and reconnects mid-session
- Host disconnects → room cleanup triggers
- ML service down when session ends → retry + pending state
- Report renders correctly for all session types

**Edge case guards to add everywhere:**
```python
# In every ML module, add at the top:
if not messages or len(messages) < 3:
    return default_empty_result()
```

---

## DEPLOYMENT (Demo Day)

| Service | Platform | Cost |
|---|---|---|
| React frontend | Vercel | Free |
| Node.js backend | Render (starter) | $7/mo recommended |
| Python ML service | **Local laptop + ngrok** | Free |
| MongoDB | Atlas | Free tier |

> `[CORRECTION]` Draft 1 suggested Render free tier for ML service.
> The 1.1GB model download will timeout on free tier's first deploy.
> Running ML locally via ngrok is more reliable for demos.

---

## REALISTIC TIMELINE (11 Weeks — With Buffer)

| Week | Phase | What to Build |
|---|---|---|
| 1 | 0 + 1 | Setup, contracts.md, seed data, auth, DB schemas |
| 2 | 1 + 2 | Auth complete, Socket.IO rooms, join/create flow |
| 3 | 2 | Real-time chat, server timer, lobby, session lifecycle |
| 4 | 3 | Excalidraw, Monaco editor, workspace layout |
| 5 | 4 | Flask setup, embeddings, sentiment, classifier |
| 6 | 4 + 5 | DBSCAN, NetworkX, stuck detection, voice input |
| 7 | 6 | Report page UI — all visualizations |
| 8 | 7 | Integration, error handling, retry logic |
| 9 | 8 | Problems bank, UI polish |
| 10 | 9 | Testing, edge cases, deployment |
| **11** | **Buffer** | **Contingency. Something WILL go wrong.** |

> `[CORRECTION]` Draft 1 had 10 weeks with zero buffer.
> In professional engineering, no project finishes without surprises.
> Week 11 is non-negotiable insurance.

---

## MISTAKES TO AVOID (Updated)

All 7 from Draft 1 remain valid, PLUS:

8. **Not writing `contracts.md` first.** Define every JSON shape before coding. Integration bugs are 3x harder to debug than logic bugs.

9. **Not creating seed data.** You cannot test ML modules without realistic chat data. Build it in Phase 0.

10. **Hardcoding model-specific assumptions.** Use abstraction functions (like `normalize_sentiment`) so you can swap models without breaking downstream logic.

11. **Ignoring disconnection handling.** Socket drops are a certainty. Plan for reconnection and state recovery from day one.

12. **Not pinning Excalidraw version.** One auto-upgrade can break your entire whiteboard integration overnight.

---

## VIVA PREPARATION

Same as Draft 1 — those answers were well-targeted. Add one more:

- **"What happens if the ML service fails?"** → "We have a 3-retry mechanism with exponential backoff. If all retries fail, the session is saved with 'analysis_pending' status and the user can retry from session history. The collaboration data is never lost."

---

> **This corrected roadmap should be read alongside `roadmap_review.md`
> for the full reasoning behind each change.**

---

## APPENDIX — Implementation Status (Updated 2026-08-27)

> This section was added post-implementation to track actual build status against the roadmap plan.

| Phase | Status | Deviations from Plan |
|---|---|---|
| Phase 0 — Foundation | ✅ Complete | `contracts.md` was not created as a standalone file; data contracts are implicitly defined in the codebase. Seed data exists in `seed/` with 4 test scenarios. |
| Phase 1 — Auth + DB | ✅ Complete | Implemented exactly as planned. 6 separate MongoDB collections. JWT + bcrypt. |
| Phase 2 — Real-Time Core | ✅ Complete | Exceeded plan — added 15s reconnection grace period, host transfer, zombie room cleanup, knock-to-rejoin system. |
| Phase 3 — Workspace Tools | ✅ Complete | Excalidraw pinned, Monaco multi-language, CSS layout. Added: host kick, tab closure warning. |
| Phase 4 — ML Pipeline | ✅ Complete | Expanded from 7 to 9 modules. Added `timeline.py`, `contributions.py`, `exploration.py`. `device.py` added for GPU/CPU auto-detection. |
| Phase 5 — Voice Input | ⚠️ Partial | Works on localhost Chrome. Fails on remote tunnel clients due to Chrome Speech API requiring Google Cloud connectivity. Implemented as `useVoiceRecognition.ts` (not `useVoice` as planned). |
| Phase 6 — Report Page | ✅ Complete | `Report.tsx` with all planned visualizations (Recharts, force-graph, contribution charts). |
| Phase 7 — Integration | ✅ Complete | 3-retry backoff, `analysis_pending` status, zombie cleanup every 5 min. |
| **Phase 8 — Problems Bank** | **❌ Not Implemented** | No `Problem` MongoDB model. `problemText` is a free-text field at room creation, not a curated bank. This is the only unimplemented roadmap phase. |
| Phase 9 — Polish + Testing | ✅ Mostly Complete | Multi-device WebRTC testing done (2 and 3 devices). ML guard clauses present. Edge cases handled. |

### Additional Features Built (Not in Original Roadmap)

- **WebRTC Full-Mesh Video/Audio** (`useWebRTC.ts`): W3C Perfect Negotiation, multi-STUN/TURN fallback, ICE auto-restart, hardware camera release, muted mic without SDP renegotiation storm.
- **Professional Video Overlay UI** (`VideoOverlay.tsx`, `VideoOverlay.css`): Glassmorphism tiles, draggable layout, avatar fallback, mute/camera state indicators.
- **Cloudflare Tunnel Deployment**: Full production build served by backend with CORS auto-detection for `*.trycloudflare.com` origins.
- **TURN Credential System** (`/api/webrtc/ice-servers`): Supports shared-secret HMAC credentials, static credentials, or OpenRelay fallback.

