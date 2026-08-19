"""
CollabLens — Timeline Generator

Divides the session into 30-second windows and detects the dominant phase
for each window. Creates a minute-by-minute narrative of how the session
unfolded — critical for the Team Intelligence Report's Session Timeline.

Phases Detected (from Context Doc Section 10, Module 8):
  - Brainstorming: many new ideas, high activity, high exploration
  - Debate: disagreements, competing ideas
  - Convergence: agreements increasing, discussion narrowing
  - Stuck: detected by stuck detection module (overlaid)
  - Breakthrough: new idea after stuck period, sentiment spike
  - Building: coordination messages, editor/whiteboard active
  - Wrapping Up: summary messages, agreements at end of session
  - Quiet: low activity period
"""

import numpy as np
from collections import Counter
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


def _detect_phase(class_counts, msg_count, avg_sentiment, prev_sentiment,
                  has_new_clusters, is_near_end, stuck_windows):
    """
    Determine the dominant phase for a time window.

    Uses message classification distribution and contextual signals.
    """
    total = msg_count
    if total == 0:
        return "Quiet"

    # Check if this window is in a stuck period
    if stuck_windows:
        return "Stuck"

    new_ideas = class_counts.get("new idea", 0)
    building = class_counts.get("building on idea", 0)
    agreements = class_counts.get("agreement", 0)
    disagreements = class_counts.get("disagreement", 0)
    questions = class_counts.get("question", 0)
    coordination = class_counts.get("coordination", 0)

    # Breakthrough: sentiment spikes up after being low + new ideas present
    if prev_sentiment is not None and avg_sentiment - prev_sentiment > 0.15 and new_ideas > 0:
        return "Breakthrough"

    # Near end of session + agreements dominating
    if is_near_end and agreements > total * 0.3:
        return "Wrapping Up"

    # Building: coordination dominates (whiteboard/editor activity)
    if coordination > total * 0.4:
        return "Building"

    # Debate: disagreements + questions prominent
    if disagreements > 0 and (disagreements + questions) > total * 0.35:
        return "Debate"

    # Convergence: agreements dominating, building on ideas
    if agreements > total * 0.3 and building > new_ideas:
        return "Convergence"

    # Brainstorming: new ideas prominent
    if new_ideas > total * 0.25 or (new_ideas > 0 and total <= 3):
        return "Brainstorming"

    # Default: moderate discussion
    if building > 0 or questions > 0:
        return "Discussion"

    return "Discussion"


def generate_timeline(messages, classifications, sentiments, cluster_labels,
                      stuck_periods=None, window_seconds=30):
    """
    Generate a session timeline divided into time windows.

    Args:
        messages (list[dict]): Session messages.
        classifications (list[dict]): Classification results per message.
        sentiments (list[dict]): Sentiment results per message.
        cluster_labels (list[int]): DBSCAN cluster labels per message.
        stuck_periods (list[dict], optional): From stuck detection module.
        window_seconds (int): Window size for timeline segmentation.

    Returns:
        list[dict]: Timeline entries, one per window.
    """
    if not messages:
        return []

    timestamps = [_parse_timestamp(m.get('timestamp', '')) for m in messages]
    start_time = timestamps[0]
    session_duration = (timestamps[-1] - start_time).total_seconds()

    if session_duration <= 0:
        return []

    timeline = []
    prev_sentiment = None
    total_windows = int(np.ceil(session_duration / window_seconds))

    for w_idx in range(total_windows):
        t_start = w_idx * window_seconds
        t_end = t_start + window_seconds

        # Get messages in this window
        window_indices = [
            i for i, ts in enumerate(timestamps)
            if t_start <= (ts - start_time).total_seconds() < t_end
        ]

        msg_count = len(window_indices)

        # Classification counts for this window
        class_counts = Counter()
        for i in window_indices:
            if i < len(classifications):
                label = (
                    classifications[i].get('label', 'off-topic')
                    if isinstance(classifications[i], dict)
                    else classifications[i]
                )
                class_counts[label] += 1

        # Average sentiment for this window
        w_sentiments = []
        for i in window_indices:
            if i < len(sentiments):
                s = (
                    sentiments[i].get('score', 0.5)
                    if isinstance(sentiments[i], dict)
                    else sentiments[i]
                )
                w_sentiments.append(s)
        avg_sentiment = round(float(np.mean(w_sentiments)), 3) if w_sentiments else 0.5

        # New clusters in this window
        window_clusters = set()
        for i in window_indices:
            if i < len(cluster_labels) and cluster_labels[i] != -1:
                window_clusters.add(cluster_labels[i])

        # Check if this window overlaps with a stuck period
        is_stuck = False
        if stuck_periods:
            for sp in stuck_periods:
                if (sp['startTime'] < t_end and sp['endTime'] > t_start):
                    is_stuck = True
                    break

        # Active participants in this window
        active_users = set()
        for i in window_indices:
            active_users.add(messages[i].get('userId', 'unknown'))

        # Near end of session?
        is_near_end = t_end >= session_duration * 0.85

        # Detect phase
        phase = _detect_phase(
            class_counts, msg_count, avg_sentiment, prev_sentiment,
            len(window_clusters) > 0, is_near_end,
            is_stuck
        )

        timeline.append({
            "windowIndex": w_idx,
            "startTime": round(t_start, 1),
            "endTime": round(t_end, 1),
            "phase": phase,
            "messageCount": msg_count,
            "sentiment": avg_sentiment,
            "newClusters": len(window_clusters),
            "clusterIds": list(window_clusters),
            "activeParticipants": len(active_users),
            "activeUserIds": list(active_users),
            "classificationBreakdown": dict(class_counts)
        })

        prev_sentiment = avg_sentiment

    return timeline
