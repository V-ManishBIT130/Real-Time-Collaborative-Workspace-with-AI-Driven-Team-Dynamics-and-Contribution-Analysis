"""
CollabLens — Module 8: Contribution Analysis

Per-member analysis: quality score, equity measurement, message type breakdown,
and voice/text ratio. This is the "contribution report card" for each participant.

Quality Score Formula (from roadmap v2):
  quality = 0.40 * (new_ideas / total)
           + 0.30 * (building_on_idea / total)
           + 0.20 * (questions / total)
           + 0.10 * (1 - off_topic / total)

  Rationale: New ideas are the most valuable contribution, followed by
  building on others' ideas (collaboration), then questions (engagement).
  Off-topic messages decrease quality.

Equity Score:
  1 - Gini coefficient of message distribution.
  1.0 = perfectly equal contribution
  0.0 = one person sent everything
"""

import numpy as np
from collections import Counter


def compute_quality_score(member_classifications):
    """
    Compute contribution quality score for a single member.

    Args:
        member_classifications (list[str]): Message type labels for this member.

    Returns:
        float: Quality score (0-1).
    """
    total = len(member_classifications)
    if total == 0:
        return 0.0

    counts = Counter(member_classifications)

    score = (
        0.40 * (counts.get("new idea", 0) / total) +
        0.30 * (counts.get("building on idea", 0) / total) +
        0.20 * (counts.get("question", 0) / total) +
        0.10 * (1 - counts.get("off-topic", 0) / total)
    )

    return round(min(max(score, 0), 1), 3)  # Clamp to [0, 1]


def _gini_coefficient(values):
    """
    Compute the Gini coefficient of a distribution.

    0 = perfect equality, 1 = perfect inequality.
    """
    if not values or sum(values) == 0:
        return 0.0

    sorted_vals = sorted(values)
    n = len(sorted_vals)
    cumsum = np.cumsum(sorted_vals)
    total = cumsum[-1]

    if total == 0:
        return 0.0

    gini = (2 * sum((i + 1) * v for i, v in enumerate(sorted_vals))) / (n * total) - (n + 1) / n
    return max(0, min(gini, 1))  # Clamp


def analyze_contributions(messages, classifications, sentiments, participants):
    """
    Comprehensive contribution analysis for all participants.

    Args:
        messages (list[dict]): Session messages.
        classifications (list[dict]): Classification results per message.
        sentiments (list[dict]): Sentiment results per message.
        participants (list[dict]): Participant info with userId, name.

    Returns:
        dict: {
            "byMember": list[dict] — per-member breakdown,
            "equity": float (0-1),
            "equityLabel": str,
            "totalMessages": int
        }
    """
    if not messages or not participants:
        return {
            "byMember": [],
            "equity": 0.0,
            "equityLabel": "No Data",
            "totalMessages": 0
        }

    # Build participant lookup
    participant_map = {}
    for p in participants:
        uid = p.get('userId', p.get('id', 'unknown'))
        participant_map[uid] = p.get('name', p.get('userName', 'unknown'))

    # Per-member analysis
    member_data = {}
    for uid in participant_map:
        member_data[uid] = {
            "messages": [],
            "classifications": [],
            "sentiments": [],
            "sources": []
        }

    for i, msg in enumerate(messages):
        uid = msg.get('userId', 'unknown')
        if uid in member_data:
            member_data[uid]["messages"].append(msg)
            if i < len(classifications):
                member_data[uid]["classifications"].append(
                    classifications[i].get('label', 'off-topic')
                    if isinstance(classifications[i], dict)
                    else classifications[i]
                )
            if i < len(sentiments):
                member_data[uid]["sentiments"].append(
                    sentiments[i].get('score', 0.5)
                    if isinstance(sentiments[i], dict)
                    else sentiments[i]
                )
            member_data[uid]["sources"].append(
                msg.get('source', 'text')
            )

    # Build per-member results
    by_member = []
    message_counts = []

    for uid, data in member_data.items():
        class_list = data["classifications"]
        counts = Counter(class_list)
        source_counts = Counter(data["sources"])

        msg_count = len(data["messages"])
        message_counts.append(msg_count)

        avg_sentiment = (
            round(float(np.mean(data["sentiments"])), 3)
            if data["sentiments"] else 0.5
        )

        quality = compute_quality_score(class_list)

        by_member.append({
            "userId": uid,
            "name": participant_map.get(uid, 'unknown'),
            "messageCount": msg_count,
            "newIdeas": counts.get("new idea", 0),
            "buildingOnOthers": counts.get("building on idea", 0),
            "agreements": counts.get("agreement", 0),
            "disagreements": counts.get("disagreement", 0),
            "questions": counts.get("question", 0),
            "coordination": counts.get("coordination", 0),
            "offTopic": counts.get("off-topic", 0),
            "qualityScore": quality,
            "avgSentiment": avg_sentiment,
            "sentimentLabel": (
                "positive" if avg_sentiment > 0.6
                else "negative" if avg_sentiment < 0.4
                else "neutral"
            ),
            "voiceMessages": source_counts.get("voice", 0),
            "textMessages": source_counts.get("text", 0)
        })

    # Sort by message count descending
    by_member.sort(key=lambda x: x["messageCount"], reverse=True)

    # Equity score (1 - Gini)
    gini = _gini_coefficient(message_counts)
    equity = round(1 - gini, 3)

    if equity >= 0.8:
        equity_label = "Highly Equitable"
    elif equity >= 0.6:
        equity_label = "Moderately Equitable"
    elif equity >= 0.4:
        equity_label = "Somewhat Unequal"
    else:
        equity_label = "Highly Unequal"

    return {
        "byMember": by_member,
        "equity": equity,
        "equityLabel": equity_label,
        "totalMessages": len(messages)
    }
