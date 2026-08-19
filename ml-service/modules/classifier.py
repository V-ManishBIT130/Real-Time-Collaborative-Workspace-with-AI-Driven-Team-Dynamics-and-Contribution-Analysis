"""
CollabLens — Module 3: Zero-Shot Message Classification

Classifies each message into one of 7 collaboration-relevant categories
using a pre-trained zero-shot NLI model. No training data needed —
categories can be changed without retraining.

Model: facebook/bart-large-mnli (~1.6GB, safetensors format)
  - Gold standard for zero-shot classification
  - Ships safetensors weights (bypasses torch.load CVE-2025-32434 check)
  - ~0.3-0.5 sec/message on GPU, ~1-2 sec on CPU
  - Accuracy: ~85-90% for our categories

Categories:
  - new idea: proposing something the team hasn't discussed
  - building on idea: extending or refining someone else's idea
  - agreement: supporting what someone said
  - disagreement: challenging an idea
  - question: asking for clarification or input
  - coordination: logistics ("let me draw it", "I'll type the code")
  - off-topic: not related to the problem

GPU: Pipeline is loaded onto CUDA if available for batch inference speedup.
"""

from transformers import pipeline
from .device import DEVICE_STR

# ─── Load model at import time (pre-warm) ─────────────────────
# device=0 means first GPU, device=-1 means CPU
_device_id = 0 if DEVICE_STR == 'cuda' else -1

print("  📦 Loading Zero-Shot Classifier (bart-large-mnli)...")
classifier = pipeline(
    "zero-shot-classification",
    model="facebook/bart-large-mnli",
    device=_device_id
)
print(f"  ✅ Zero-Shot Classifier loaded on {DEVICE_STR.upper()}")

# ─── Category labels ──────────────────────────────────────────
CATEGORIES = [
    "new idea",
    "building on idea",
    "agreement",
    "disagreement",
    "question",
    "coordination",
    "off-topic"
]


def classify_message(text):
    """
    Classify a single message into one of the collaboration categories.

    Args:
        text (str): The message text.

    Returns:
        dict: {
            "label": str (top category),
            "confidence": float (0-1),
            "all_scores": dict[str, float] (all category scores)
        }
    """
    if not text or not text.strip():
        return {
            "label": "off-topic",
            "confidence": 0.0,
            "all_scores": {c: 0.0 for c in CATEGORIES}
        }

    result = classifier(text, CATEGORIES)

    return {
        "label": result['labels'][0],
        "confidence": round(result['scores'][0], 4),
        "all_scores": {
            label: round(score, 4)
            for label, score in zip(result['labels'], result['scores'])
        }
    }


def classify_batch(texts):
    """
    Classify a batch of messages. Significantly faster than one-by-one
    due to model batching.

    Args:
        texts (list[str]): Messages to classify.

    Returns:
        list[dict]: Classification result per message.
    """
    if not texts:
        return []

    # Filter out empty strings but keep track of indices
    results = []
    non_empty_indices = []
    non_empty_texts = []

    for i, text in enumerate(texts):
        if text and text.strip():
            non_empty_indices.append(i)
            non_empty_texts.append(text)

    # Batch classify non-empty messages
    raw_results = []
    if non_empty_texts:
        classified = classifier(non_empty_texts, CATEGORIES)
        # Handle single result (not wrapped in list)
        if isinstance(classified, dict):
            raw_results = [classified]
        elif isinstance(classified, list):
            raw_results = classified

    # Build full results list preserving original order
    raw_idx = 0
    for i in range(len(texts)):
        if i in non_empty_indices and raw_idx < len(raw_results):
            r = raw_results[raw_idx]
            results.append({
                "label": r['labels'][0],
                "confidence": round(r['scores'][0], 4),
                "all_scores": {
                    label: round(score, 4)
                    for label, score in zip(r['labels'], r['scores'])
                }
            })
            raw_idx += 1
        else:
            results.append({
                "label": "off-topic",
                "confidence": 0.0,
                "all_scores": {c: 0.0 for c in CATEGORIES}
            })

    return results
