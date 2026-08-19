"""
CollabLens — Module 4: Idea Clustering (DBSCAN)

Groups semantically similar messages into distinct "idea clusters" using
Density-Based Spatial Clustering (DBSCAN) on Sentence-BERT embeddings.

Why DBSCAN over K-Means:
  - No need to specify K (number of clusters) in advance
  - Automatically discovers cluster count based on density
  - Handles noise (off-topic messages become label -1)
  - Works naturally with cosine distance

Parameters:
  - eps=0.5 (~75% similarity threshold — tuned from roadmap correction)
  - min_samples=2 (at least 2 messages to form a cluster)
"""

import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import cosine_distances
from collections import Counter


def cluster_messages(embeddings, messages=None, eps=0.5, min_samples=2):
    """
    Cluster messages into idea groups using DBSCAN on semantic embeddings.

    Args:
        embeddings (np.ndarray): Shape (N, 384) message embeddings.
        messages (list[dict], optional): Original messages for cluster summaries.
        eps (float): Max distance for two points to be neighbors.
            0.5 ≈ 75% cosine similarity threshold.
        min_samples (int): Minimum points to form a cluster.

    Returns:
        dict: {
            "labels": list[int] — cluster label per message (-1 = noise),
            "n_clusters": int — number of distinct clusters found,
            "clusters": list[dict] — per-cluster summary with metadata
        }
    """
    if len(embeddings) < min_samples:
        labels = [-1] * len(embeddings)
        return {
            "labels": labels,
            "n_clusters": 0,
            "clusters": []
        }

    # Compute pairwise cosine distances (0 = identical, 2 = opposite)
    distances = cosine_distances(embeddings)

    # Run DBSCAN with precomputed distance matrix
    db = DBSCAN(eps=eps, min_samples=min_samples, metric='precomputed')
    labels = db.fit_predict(distances).tolist()

    # Count clusters (exclude noise label -1)
    unique_labels = set(labels)
    n_clusters = len(unique_labels) - (1 if -1 in unique_labels else 0)

    # Build cluster summaries
    clusters = []
    if messages and n_clusters > 0:
        for cluster_id in sorted(unique_labels):
            if cluster_id == -1:
                continue  # Skip noise

            # Get indices of messages in this cluster
            indices = [i for i, l in enumerate(labels) if l == cluster_id]
            cluster_messages_list = [messages[i] for i in indices]

            # Find the earliest message in this cluster (originator)
            earliest = min(cluster_messages_list, key=lambda m: m.get('timestamp', ''))

            # Compute centroid of cluster embeddings for representative selection
            cluster_embeddings = embeddings[indices]
            centroid = cluster_embeddings.mean(axis=0)

            # Find message closest to centroid (most representative)
            centroid_distances = cosine_distances(
                centroid.reshape(1, -1),
                cluster_embeddings
            )[0]
            representative_idx = indices[np.argmin(centroid_distances)]
            representative_text = messages[representative_idx].get('text', '')

            # Per-user contribution to this cluster
            user_counts = Counter(m.get('userId', 'unknown') for m in cluster_messages_list)

            clusters.append({
                "clusterId": int(cluster_id),
                "messageCount": len(indices),
                "percentage": round(len(indices) / len(labels) * 100, 1),
                "representativeText": representative_text,
                "originatorUserId": earliest.get('userId', 'unknown'),
                "originatorName": earliest.get('userName', 'unknown'),
                "firstMentionTime": earliest.get('timestamp', ''),
                "messageIndices": indices,
                "contributorCounts": dict(user_counts)
            })

    # Noise summary
    noise_count = labels.count(-1)

    return {
        "labels": labels,
        "n_clusters": n_clusters,
        "clusters": clusters,
        "noise_count": noise_count,
        "noise_percentage": round(noise_count / len(labels) * 100, 1) if labels else 0.0
    }
