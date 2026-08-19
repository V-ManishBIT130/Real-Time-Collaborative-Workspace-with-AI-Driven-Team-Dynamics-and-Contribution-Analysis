"""
CollabLens — Module 1: Semantic Encoding (Sentence-BERT)

Converts every chat/voice message into a 384-dimensional vector using
the all-MiniLM-L6-v2 pre-trained model (~80MB).

These embeddings are the FOUNDATION — DBSCAN clustering, stuck detection,
network analysis, and exploration scoring all depend on them.

GPU: Model is loaded onto CUDA if available for faster batch encoding.
"""

import numpy as np
from sentence_transformers import SentenceTransformer
from .device import DEVICE, DEVICE_STR

# ─── Load model at import time (pre-warm) ─────────────────────
print("  📦 Loading Sentence-BERT (all-MiniLM-L6-v2)...")
model = SentenceTransformer('all-MiniLM-L6-v2', device=DEVICE_STR)
print(f"  ✅ Sentence-BERT loaded on {DEVICE_STR.upper()}")


def get_embeddings(texts):
    """
    Encode a list of text strings into semantic embeddings.

    Args:
        texts (list[str]): Messages to encode.

    Returns:
        np.ndarray: Shape (N, 384) — one 384-dim vector per message.
    """
    if not texts:
        return np.array([])

    # batch_size=32 is optimal for MiniLM on both CPU and GPU
    # show_progress_bar=False to keep logs clean in production
    embeddings = model.encode(
        texts,
        batch_size=32,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=True  # L2 normalize — cosine sim = dot product
    )

    return embeddings
