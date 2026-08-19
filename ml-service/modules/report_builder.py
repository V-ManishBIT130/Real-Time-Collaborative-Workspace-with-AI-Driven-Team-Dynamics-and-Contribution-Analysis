"""
CollabLens — Report Builder

Generates the structured insights, overall team score, and human-readable
summary that form the final Team Intelligence Report.

Overall Team Score:
  Weighted composite of 5 metrics:
  - Exploration score (25%)
  - Contribution equity (25%)
  - Network density (20%)
  - Stuck recovery rate (15%)
  - Average contribution quality (15%)

Insights:
  - Team strengths (what went well)
  - Areas for improvement (what could be better)
  - Key moments (pivotal messages)
"""

import numpy as np


def compute_overall_score(exploration_score, equity, network_density,
                          stuck_periods, member_quality_scores):
    """
    Compute the overall team intelligence score.

    Args:
        exploration_score (float): 0-1 exploration metric.
        equity (float): 0-1 contribution equity.
        network_density (float): 0-1 graph density.
        stuck_periods (list[dict]): Stuck periods detected.
        member_quality_scores (list[float]): Quality scores per member.

    Returns:
        float: Overall score (0-1).
    """
    # Stuck recovery rate: what fraction of stuck periods had recovery?
    if stuck_periods:
        recovered = sum(1 for sp in stuck_periods if sp.get('recovery'))
        recovery_rate = recovered / len(stuck_periods)
    else:
        recovery_rate = 1.0  # No stuck periods = good

    # Average member quality
    avg_quality = np.mean(member_quality_scores) if member_quality_scores else 0.0

    score = (
        0.25 * exploration_score +
        0.25 * equity +
        0.20 * min(network_density * 1.5, 1.0) +  # Boost density slightly
        0.15 * recovery_rate +
        0.15 * avg_quality
    )

    return round(min(max(score, 0), 1), 3)


def generate_insights(contributions, exploration_data, network_data,
                      stuck_periods, timeline):
    """
    Generate human-readable insights for the Team Intelligence Report.

    Args:
        contributions (dict): From contributions module.
        exploration_data (dict): From exploration module.
        network_data (dict): From network module.
        stuck_periods (list[dict]): From stuck detection.
        timeline (list[dict]): From timeline module.

    Returns:
        dict: {
            "strengths": list[str],
            "improvements": list[str],
            "keyMoments": list[dict]
        }
    """
    strengths = []
    improvements = []
    key_moments = []

    # ─── Contribution Insights ────────────────────────────────
    if contributions:
        equity = contributions.get('equity', 0)
        by_member = contributions.get('byMember', [])

        if equity >= 0.7:
            strengths.append(
                f"Excellent contribution equity ({equity:.0%}). "
                f"All team members participated meaningfully."
            )
        elif equity < 0.4:
            if by_member:
                top = by_member[0]
                improvements.append(
                    f"Contribution was heavily unequal ({equity:.0%} equity). "
                    f"{top['name']} sent {top['messageCount']} messages while "
                    f"others contributed significantly less. Encourage more "
                    f"balanced participation."
                )

        # Quality insights
        high_quality = [m for m in by_member if m.get('qualityScore', 0) >= 0.5]
        if high_quality:
            names = ', '.join(m['name'] for m in high_quality[:2])
            strengths.append(
                f"{names} contributed high-quality messages with substantial "
                f"new ideas and constructive building on others' ideas."
            )

        # Off-topic check
        high_offtopic = [m for m in by_member if m.get('offTopic', 0) > m.get('messageCount', 1) * 0.3]
        if high_offtopic:
            names = ', '.join(m['name'] for m in high_offtopic)
            improvements.append(
                f"{names} had a high proportion of off-topic messages. "
                f"Staying focused on the problem can improve team output."
            )

    # ─── Exploration Insights ─────────────────────────────────
    if exploration_data:
        exp_score = exploration_data.get('score', 0)
        n_clusters = exploration_data.get('n_clusters', 0)

        if exp_score >= 0.6:
            strengths.append(
                f"Team explored {n_clusters} distinct approaches "
                f"(exploration score: {exp_score:.2f}). Good divergent thinking "
                f"before convergence."
            )
        elif exp_score < 0.3 and n_clusters >= 2:
            improvements.append(
                f"Despite having {n_clusters} idea clusters, the team fixated "
                f"heavily on one approach (exploration score: {exp_score:.2f}). "
                f"Try allocating time for alternative approaches."
            )
        elif n_clusters <= 1:
            improvements.append(
                "Team discussed essentially one approach. Encourage brainstorming "
                "multiple solutions before diving deep into one."
            )

    # ─── Network Insights ─────────────────────────────────────
    if network_data:
        pattern = network_data.get('pattern', '')
        density = network_data.get('density', 0)
        isolated = network_data.get('isolatedMembers', [])

        if pattern == "Healthy Mesh":
            strengths.append(
                f"Communication network is a healthy mesh (density: {density:.2f}). "
                f"All members are well-connected and communicating freely."
            )
        elif pattern == "Hub-and-Spoke":
            hub = network_data.get('hubMember', {})
            improvements.append(
                f"Communication followed a hub-and-spoke pattern centered on "
                f"{hub.get('name', 'one person')}. Other members should "
                f"engage more directly with each other."
            )

        if isolated:
            improvements.append(
                f"{''.join(isolated)} {'were' if len(isolated) > 1 else 'was'} "
                f"isolated in the communication network. Make sure everyone "
                f"is included in the discussion."
            )

        strongest = network_data.get('strongestLink')
        if strongest:
            strengths.append(
                f"Strongest communication link: {strongest['from']} ↔ "
                f"{strongest['to']} ({strongest['weight']} interactions)."
            )

    # ─── Stuck Insights ───────────────────────────────────────
    if stuck_periods:
        total_stuck = len(stuck_periods)
        recovered = [sp for sp in stuck_periods if sp.get('recovery')]

        if total_stuck > 0 and len(recovered) == total_stuck:
            strengths.append(
                f"Team hit {total_stuck} stuck period(s) but recovered from "
                f"all of them. Strong resilience and problem-solving ability."
            )
            for sp in recovered:
                rec = sp['recovery']
                key_moments.append({
                    "type": "breakthrough",
                    "time": sp['endTime'],
                    "description": (
                        f"{rec['userName']} broke a stuck period with a "
                        f"\"{rec['type']}\" at {sp['endTime']:.0f}s"
                    ),
                    "userId": rec.get('userId'),
                    "userName": rec.get('userName')
                })
        elif total_stuck > 0:
            unrecovered = total_stuck - len(recovered)
            improvements.append(
                f"Team experienced {total_stuck} stuck period(s), "
                f"{unrecovered} without clear recovery. Practice techniques "
                f"like reframing, switching perspectives, or asking new questions."
            )
    else:
        strengths.append(
            "No stuck periods detected. Team maintained productive momentum "
            "throughout the session."
        )

    # ─── Timeline Insights ────────────────────────────────────
    if timeline:
        phases = [t['phase'] for t in timeline]
        phase_counts = {}
        for p in phases:
            phase_counts[p] = phase_counts.get(p, 0) + 1

        dominant = max(phase_counts.keys(), key=lambda k: phase_counts[k])
        if dominant == "Brainstorming":
            strengths.append(
                "Session was dominated by brainstorming — the team actively "
                "generated new ideas throughout."
            )
        elif dominant == "Debate":
            strengths.append(
                "Healthy debate was the dominant phase — team members "
                "constructively challenged each other's ideas."
            )

    # Ensure we always have at least one insight
    if not strengths:
        strengths.append("Team completed the session and generated discussion data.")
    if not improvements:
        improvements.append(
            "Continue practicing collaborative problem-solving to develop "
            "stronger team dynamics."
        )

    return {
        "strengths": strengths,
        "improvements": improvements,
        "keyMoments": key_moments
    }


def build_summary(messages, participants, exploration_data, stuck_periods,
                  network_data, contributions, timeline):
    """
    Build the complete summary section for the report.

    Args:
        All module outputs.

    Returns:
        dict: Complete summary for the Team Intelligence Report.
    """
    # Overall score
    member_qualities = [
        m.get('qualityScore', 0)
        for m in contributions.get('byMember', [])
    ]
    overall_score = compute_overall_score(
        exploration_data.get('score', 0),
        contributions.get('equity', 0),
        network_data.get('density', 0),
        stuck_periods,
        member_qualities
    )

    # Insights
    insights = generate_insights(
        contributions, exploration_data, network_data,
        stuck_periods, timeline
    )

    return {
        "overallScore": overall_score,
        "scoreLabel": (
            "Excellent" if overall_score >= 0.75 else
            "Good" if overall_score >= 0.55 else
            "Fair" if overall_score >= 0.35 else
            "Needs Improvement"
        ),
        "insights": insights,
        "collectiveIntelligenceIndicators": {
            "contributionEquity": contributions.get('equity', 0),
            "communicationDensity": network_data.get('density', 0),
            "explorationScore": exploration_data.get('score', 0),
            "stuckRecoveryRate": (
                sum(1 for sp in stuck_periods if sp.get('recovery')) / len(stuck_periods)
                if stuck_periods else 1.0
            ),
            "avgContributionQuality": (
                round(np.mean(member_qualities), 3) if member_qualities else 0.0
            )
        }
    }
