"""
CollabLens — Module 5: Communication Network Analysis

Builds and analyzes the team's communication graph using NetworkX.
Uses DUAL filtering (per roadmap correction):
  - Temporal proximity: messages within 60s window
  - Semantic relevance: cosine similarity > 0.3 OR direct reply (adjacent messages)

This prevents the "density ≈ 1.0 for every session" problem that
pure temporal proximity causes in fast group chats.

Outputs:
  - Degree centrality (who talks to the most people)
  - Betweenness centrality (who bridges communication)
  - Graph density (overall connectedness)
  - Reciprocity (bidirectional communication)
  - Isolated nodes (members being ignored)
  - Network pattern classification
  - Node positions from spring_layout (for frontend rendering)
"""

import networkx as nx
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from datetime import datetime


def _parse_timestamp(ts):
    """Parse ISO timestamp string to datetime object."""
    if isinstance(ts, datetime):
        return ts
    if isinstance(ts, str):
        # Handle both formats: with and without timezone
        ts = ts.replace('Z', '+00:00')
        try:
            return datetime.fromisoformat(ts)
        except ValueError:
            return datetime.now()
    return datetime.now()


def _classify_network_pattern(density, centrality_values, isolated_count, n_nodes):
    """
    Classify the communication network into a named pattern.

    Patterns (from Context Doc Section 10, Module 5):
      - Healthy Mesh: everyone connected, high density ✅
      - Hub-and-Spoke: one person mediates all communication ⚠️
      - Fragmented: sub-groups don't communicate ❌
      - Broadcast: one person talks, others listen ❌
      - Isolated Member: someone cut off ❌
    """
    if n_nodes <= 1:
        return "Insufficient Data"

    if isolated_count > 0:
        return "Isolated Member"

    if density >= 0.7:
        return "Healthy Mesh"

    # Check for hub-and-spoke: one node has much higher centrality than others
    if centrality_values:
        max_centrality = max(centrality_values)
        avg_centrality = np.mean(centrality_values)
        if max_centrality > 0 and max_centrality > 2.5 * avg_centrality:
            return "Hub-and-Spoke"

    if density < 0.3:
        return "Fragmented"

    # Check for broadcast: high out-degree for one, low for others
    return "Moderately Connected"


def build_network(messages, embeddings, response_window_seconds=60):
    """
    Build and analyze the team's communication network.

    Uses dual filtering: temporal proximity AND semantic relevance
    to create meaningful edges (not just "anyone who spoke near in time").

    Args:
        messages (list[dict]): Session messages with userId, timestamp.
        embeddings (np.ndarray): Shape (N, 384) message embeddings.
        response_window_seconds (int): Max seconds between messages for edge.

    Returns:
        dict: Complete network analysis results for the report.
    """
    if not messages or len(messages) < 2:
        return _empty_network_result(messages)

    G = nx.DiGraph()

    # Add all participants as nodes
    participants = list(set(m.get('userId', 'unknown') for m in messages))
    participant_names = {}
    for m in messages:
        uid = m.get('userId', 'unknown')
        if uid not in participant_names:
            participant_names[uid] = m.get('userName', 'unknown')

    for uid in participants:
        G.add_node(uid, name=participant_names.get(uid, 'unknown'))

    # Build edges with dual filtering
    for i, msg in enumerate(messages):
        msg_time = _parse_timestamp(msg.get('timestamp', ''))

        for j in range(i + 1, len(messages)):
            next_msg = messages[j]
            next_time = _parse_timestamp(next_msg.get('timestamp', ''))

            time_diff = (next_time - msg_time).total_seconds()

            # Stop looking if we're past the response window
            if time_diff > response_window_seconds:
                break

            # Skip same-user messages (self-reply)
            if next_msg.get('userId') == msg.get('userId'):
                continue

            # Semantic relevance check (per roadmap correction)
            sim = cosine_similarity(
                embeddings[i].reshape(1, -1),
                embeddings[j].reshape(1, -1)
            )[0][0]

            # Edge condition: topically related (sim > 0.3) OR direct reply (j == i+1)
            if sim > 0.3 or j == i + 1:
                from_uid = msg.get('userId')
                to_uid = next_msg.get('userId')

                if G.has_edge(from_uid, to_uid):
                    G[from_uid][to_uid]['weight'] += 1
                else:
                    G.add_edge(from_uid, to_uid, weight=1)

    # ─── Compute metrics ──────────────────────────────────────
    degree_centrality = nx.degree_centrality(G)
    betweenness_centrality = nx.betweenness_centrality(G)

    density = nx.density(G)
    reciprocity = nx.reciprocity(G) if G.number_of_edges() > 0 else 0.0

    isolated_nodes = [n for n in G.nodes if G.degree(n) == 0]

    # Network pattern classification
    centrality_vals = list(betweenness_centrality.values())
    pattern = _classify_network_pattern(
        density, centrality_vals, len(isolated_nodes), len(participants)
    )

    # Spring layout positions for frontend graph rendering
    try:
        positions = nx.spring_layout(G, seed=42)  # seed for reproducibility
        node_positions = {
            str(k): [round(float(v[0]), 4), round(float(v[1]), 4)]
            for k, v in positions.items()
        }
    except Exception:
        node_positions = {}

    # Build node list with metrics
    nodes = []
    for uid in participants:
        nodes.append({
            "userId": uid,
            "name": participant_names.get(uid, 'unknown'),
            "degreeCentrality": round(degree_centrality.get(uid, 0), 4),
            "betweennessCentrality": round(betweenness_centrality.get(uid, 0), 4),
            "messageCount": sum(1 for m in messages if m.get('userId') == uid),
            "isIsolated": uid in isolated_nodes,
            "position": node_positions.get(str(uid), [0, 0])
        })

    # Build edge list
    edges = [
        {
            "from": u,
            "to": v,
            "weight": d['weight'],
            "fromName": participant_names.get(u, 'unknown'),
            "toName": participant_names.get(v, 'unknown')
        }
        for u, v, d in G.edges(data=True)
    ]

    # Find strongest link
    strongest_link = None
    if edges:
        strongest = max(edges, key=lambda e: e['weight'])
        strongest_link = {
            "from": strongest['fromName'],
            "to": strongest['toName'],
            "weight": strongest['weight']
        }

    # Find highest betweenness centrality member
    hub_member = None
    if betweenness_centrality:
        hub_uid = max(betweenness_centrality.keys(), key=lambda k: betweenness_centrality[k])
        hub_member = {
            "userId": str(hub_uid),
            "name": participant_names.get(hub_uid, 'unknown'),
            "betweennessCentrality": round(betweenness_centrality[hub_uid], 4)
        }

    reciprocity_val = float(reciprocity) if isinstance(reciprocity, (int, float)) else 0.0

    return {
        "density": round(density, 4),
        "reciprocity": round(reciprocity_val, 4),
        "pattern": pattern,
        "nodes": nodes,
        "edges": edges,
        "isolatedMembers": [
            participant_names.get(uid, 'unknown') for uid in isolated_nodes
        ],
        "strongestLink": strongest_link,
        "hubMember": hub_member,
        "nodePositions": node_positions
    }


def _empty_network_result(messages=None):
    """Return a valid but empty network result for edge cases."""
    participants = []
    if messages:
        seen = set()
        for m in messages:
            uid = m.get('userId', 'unknown')
            if uid not in seen:
                seen.add(uid)
                participants.append({
                    "userId": uid,
                    "name": m.get('userName', 'unknown'),
                    "degreeCentrality": 0,
                    "betweennessCentrality": 0,
                    "messageCount": sum(1 for msg in messages if msg.get('userId') == uid),
                    "isIsolated": True,
                    "position": [0, 0]
                })

    return {
        "density": 0,
        "reciprocity": 0,
        "pattern": "Insufficient Data",
        "nodes": participants,
        "edges": [],
        "isolatedMembers": [],
        "strongestLink": None,
        "hubMember": None,
        "nodePositions": {}
    }
