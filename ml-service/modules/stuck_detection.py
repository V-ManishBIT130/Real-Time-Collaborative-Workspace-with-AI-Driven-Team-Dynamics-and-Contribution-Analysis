"""
CollabLens — Module 6: Stuck Detection

Detects periods where the team's thinking stalls using a multi-signal
temporal analysis algorithm (our own design — not a pre-trained model).

Algorithm:
  60-second sliding window with 30-second step.
  4 signals combined with weighted scoring:

  Signal 1 (0.35): Semantic Similarity Spike
    → Messages in window are very similar → repeating ideas
  Signal 2 (0.25): Sentiment Drop
    → Average sentiment below neutral → frustration
  Signal 3 (0.25): No New Clusters
    → No message introduces a previously unseen DBSCAN cluster
    → CORRECTION: tracks ALL clusters seen across full history (not just current window)
  Signal 4 (0.15): Message Gap
    → Large average gap between messages → team going quiet

  Combined: stuck_score = 0.35*S1 + 0.25*S2 + 0.25*S3 + 0.15*S4
  Threshold: > 0.6 → flagged as STUCK

  Recovery Analysis:
    → First message after stuck period that introduces a new idea or question
    → Tracks WHO broke the deadlock and HOW
"""

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from datetime import datetime


def _parse_timestamp(ts):
    """Parse ISO timestamp string to datetime object."""
    if isinstance(ts, datetime):
        return ts
    if isinstance(ts, str):
        ts = ts.replace('Z', '+00:00')
        try:
            return datetime.fromisoformat(ts)
        except ValueError:
            return datetime.now()
    return datetime.now()


def detect_stuck_periods(messages, embeddings, sentiments, cluster_labels,
                         classifications=None, window_seconds=60):
    """
    Detect periods where team thinking stalls.

    Args:
        messages (list[dict]): Session messages with timestamps.
        embeddings (np.ndarray): Shape (N, 384) message embeddings.
        sentiments (list[float]): Normalized sentiment scores (0-1) per message.
        cluster_labels (list[int]): DBSCAN cluster label per message.
        classifications (list[dict], optional): Classification results per message.
        window_seconds (int): Sliding window size in seconds.

    Returns:
        list[dict]: Detected stuck periods with metadata and recovery info.
    """
    stuck_periods = []

    # Guard clause — need at least 3 messages (per roadmap)
    if len(messages) < 3:
        return stuck_periods

    # Parse all timestamps
    timestamps = [_parse_timestamp(m.get('timestamp', '')) for m in messages]
    start_time = timestamps[0]
    session_duration = (timestamps[-1] - start_time).total_seconds()

    if session_duration <= 0:
        return stuck_periods

    # Track ALL clusters seen across the entire session history
    # (CORRECTION from roadmap: Draft 1 only tracked within current window)
    seen_clusters = set()

    t = 0
    while t < session_duration:
        window_end = t + window_seconds

        # Get indices of messages within this window
        window_indices = [
            i for i, ts in enumerate(timestamps)
            if t <= (ts - start_time).total_seconds() < window_end
        ]

        # Update seen clusters from messages BEFORE this window
        pre_window = [
            i for i, ts in enumerate(timestamps)
            if (ts - start_time).total_seconds() < t
        ]
        for idx in pre_window:
            if cluster_labels[idx] != -1:
                seen_clusters.add(cluster_labels[idx])

        # Need at least 2 messages in window for meaningful analysis
        if len(window_indices) < 2:
            t += 30  # Step by 30 seconds
            continue

        # ─── Signal 1: Semantic Similarity Spike (weight: 0.35) ───
        w_embeddings = np.vstack([embeddings[i] for i in window_indices])
        sim_matrix = cosine_similarity(w_embeddings)  # type: ignore[arg-type]
        np.fill_diagonal(sim_matrix, 0.0)  # type: ignore[arg-type]
        n = len(window_indices)
        avg_sim = float(sim_matrix.sum() / (n * (n - 1))) if n > 1 else 0.0
        similarity_score = min(avg_sim / 0.75, 1.0)

        # ─── Signal 2: Sentiment Drop (weight: 0.25) ─────────────
        w_sentiments = [sentiments[i] for i in window_indices]
        avg_sentiment = np.mean(w_sentiments)
        # Below 0.5 = negative territory. Score how far below neutral.
        sentiment_score = max(0, (0.5 - avg_sentiment) * 2)

        # ─── Signal 3: No New Clusters (weight: 0.25) ─────────────
        window_cluster_set = {
            cluster_labels[i] for i in window_indices
            if cluster_labels[i] != -1
        }
        has_new = bool(window_cluster_set - seen_clusters)
        no_new_cluster_score = 0.0 if has_new else 1.0

        # ─── Signal 4: Message Gap (weight: 0.15) ─────────────────
        times = [
            (timestamps[i] - start_time).total_seconds()
            for i in window_indices
        ]
        if len(times) > 1:
            gaps = np.diff(sorted(times))
            avg_gap = np.mean(gaps)
        else:
            avg_gap = 30  # Default to high gap if only 1 message
        gap_score = min(avg_gap / 30, 1.0)

        # ─── Combined Stuck Score ─────────────────────────────────
        stuck_score = (
            0.35 * similarity_score +
            0.25 * sentiment_score +
            0.25 * no_new_cluster_score +
            0.15 * gap_score
        )

        if stuck_score > 0.6:
            stuck_period = {
                "startTime": round(t, 1),
                "endTime": round(window_end, 1),
                "duration": window_seconds,
                "stuckScore": round(float(stuck_score), 3),
                "signals": {
                    "semanticSimilarity": round(similarity_score, 3),
                    "sentimentDrop": round(sentiment_score, 3),
                    "noNewClusters": round(no_new_cluster_score, 3),
                    "messageGap": round(gap_score, 3)
                },
                "avgSentiment": round(float(avg_sentiment), 3),
                "messageCount": len(window_indices)
            }
            stuck_periods.append(stuck_period)

        # Update seen clusters from this window
        for idx in window_indices:
            if cluster_labels[idx] != -1:
                seen_clusters.add(cluster_labels[idx])

        t += 30  # 30-second step

    # ─── Merge overlapping stuck periods ──────────────────────
    stuck_periods = _merge_overlapping(stuck_periods)

    # ─── Recovery Analysis ────────────────────────────────────
    for period in stuck_periods:
        recovery = _find_recovery_message(
            period, messages, timestamps, start_time,
            classifications, cluster_labels
        )
        if recovery:
            period['recovery'] = recovery

    return stuck_periods


def _merge_overlapping(periods):
    """Merge overlapping stuck periods into contiguous blocks."""
    if len(periods) <= 1:
        return periods

    merged = [periods[0]]
    for current in periods[1:]:
        prev = merged[-1]
        if current['startTime'] <= prev['endTime']:
            # Overlapping — extend the previous period
            prev['endTime'] = max(prev['endTime'], current['endTime'])
            prev['duration'] = prev['endTime'] - prev['startTime']
            prev['stuckScore'] = max(prev['stuckScore'], current['stuckScore'])
            # Keep the higher signal values
            for key in prev['signals']:
                prev['signals'][key] = max(
                    prev['signals'][key],
                    current['signals'].get(key, 0)
                )
        else:
            merged.append(current)

    return merged


def _find_recovery_message(period, messages, timestamps, start_time,
                           classifications, cluster_labels):
    """
    Find the first message after a stuck period that breaks the deadlock.

    A recovery message is the first message after the stuck window ends
    that is a 'new idea' or 'question' — types that introduce new thinking.
    """
    recovery_types = {'new idea', 'question', 'building on idea', 'disagreement'}

    for i, ts in enumerate(timestamps):
        msg_time = (ts - start_time).total_seconds()

        # Look for messages right after the stuck period ends
        if msg_time >= period['endTime']:
            msg_type = 'unknown'
            if classifications and i < len(classifications):
                msg_type = classifications[i].get('label', 'unknown')

            # Accept the first message that introduces new thinking
            if msg_type in recovery_types or not classifications:
                return {
                    "userId": messages[i].get('userId', 'unknown'),
                    "userName": messages[i].get('userName', 'unknown'),
                    "text": messages[i].get('text', ''),
                    "type": msg_type,
                    "timestamp": messages[i].get('timestamp', ''),
                    "timeAfterStuck": round(msg_time - period['endTime'], 1)
                }

    return None
