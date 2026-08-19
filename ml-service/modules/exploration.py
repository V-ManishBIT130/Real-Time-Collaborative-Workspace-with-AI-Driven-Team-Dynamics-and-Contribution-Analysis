"""
CollabLens — Module 7: Exploration vs Fixation Score

Measures how broadly the team explored different approaches using
Shannon entropy over the DBSCAN cluster distribution.

Formula:
  exploration_score = entropy(cluster_distribution) / log(N_clusters)
  Normalized to 0-1 range.

Interpretation:
  0.0 - 0.3: HIGH FIXATION ⚠️  — locked onto one approach too early
  0.3 - 0.6: MODERATE EXPLORATION — discussed a few approaches
  0.6 - 0.8: GOOD EXPLORATION ✅ — healthy divergent-then-convergent thinking
  0.8 - 1.0: HIGH EXPLORATION ✅ — thorough exploration of many approaches
"""

import numpy as np
from scipy.stats import entropy as scipy_entropy
from collections import Counter


def compute_exploration_score(cluster_labels):
    """
    Compute the exploration vs fixation score.

    Args:
        cluster_labels (list[int]): DBSCAN cluster label per message.
            -1 = noise (excluded from calculation).

    Returns:
        dict: {
            "score": float (0-1),
            "label": str (interpretation),
            "n_clusters": int,
            "distribution": dict (cluster → message count),
            "interpretation": str (human-readable explanation)
        }
    """
    # Filter out noise labels
    valid = [l for l in cluster_labels if l != -1]

    if len(valid) == 0:
        return {
            "score": 0.0,
            "label": "No Clusters Detected",
            "n_clusters": 0,
            "distribution": {},
            "interpretation": "Not enough topical messages to assess exploration breadth."
        }

    unique = list(set(valid))
    n_clusters = len(unique)

    if n_clusters <= 1:
        return {
            "score": 0.0,
            "label": "High Fixation",
            "n_clusters": n_clusters,
            "distribution": dict(Counter(valid)),
            "interpretation": "Team focused on only one approach. Consider exploring alternatives."
        }

    # Compute distribution
    counts = Counter(valid)
    distribution = np.array([counts[c] for c in sorted(counts.keys())], dtype=float)
    distribution = distribution / distribution.sum()

    # Filter zero entries to prevent entropy returning inf
    # (CORRECTION from roadmap)
    distribution = distribution[distribution > 0]

    # Shannon entropy
    raw_entropy = scipy_entropy(distribution)
    max_entropy = np.log(n_clusters)

    score = round(float(raw_entropy / max_entropy), 3) if max_entropy > 0 else 0.0

    # Interpretation
    if score >= 0.8:
        label = "High Exploration"
        interpretation = (
            f"Team thoroughly explored {n_clusters} distinct approaches with "
            f"well-balanced discussion across all clusters."
        )
    elif score >= 0.6:
        label = "Good Exploration"
        interpretation = (
            f"Team explored {n_clusters} approaches with healthy divergent-then-convergent "
            f"thinking. Good balance of breadth and depth."
        )
    elif score >= 0.3:
        label = "Moderate Exploration"
        interpretation = (
            f"Team discussed {n_clusters} approaches but spent disproportionate time on "
            f"some. Consider more balanced exploration."
        )
    else:
        label = "High Fixation"
        interpretation = (
            f"Despite {n_clusters} clusters being detected, discussion was heavily "
            f"concentrated on one approach. Team may have converged too early."
        )

    return {
        "score": score,
        "label": label,
        "n_clusters": n_clusters,
        "distribution": {str(k): v for k, v in Counter(valid).items()},
        "interpretation": interpretation
    }
