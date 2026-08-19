"""
CollabLens — Module 2: Sentiment Analysis

Detects emotional tone of each message (positive / neutral / negative).
Uses TextBlob as the primary analyzer with an abstracted normalization
function so switching to RoBERTa later won't break downstream modules
(stuck detection assumes 0.5 = neutral).

Sentiment feeds into:
  - Stuck detection (sentiment drop = possible stuck signal)
  - Timeline (mood trajectory per window)
  - Per-member sentiment tracking
"""

from textblob import TextBlob


def normalize_sentiment(raw_score, source='textblob'):
    """
    Normalize sentiment to a 0-1 scale regardless of source model.

    This abstraction is CRITICAL — stuck detection relies on 0.5 = neutral.
    If you swap to RoBERTa (which outputs 0-1 probabilities directly),
    only this function needs to change.

    Args:
        raw_score (float): Raw sentiment score from the model.
        source (str): Which model produced the score.

    Returns:
        float: Normalized score in [0, 1] where 0.5 = neutral.
    """
    if source == 'textblob':
        # TextBlob polarity: [-1, 1] → [0, 1]
        return (raw_score + 1) / 2
    elif source == 'roberta':
        # RoBERTa already outputs 0-1
        return raw_score
    return 0.5


def get_sentiment(text):
    """
    Analyze sentiment of a single message.

    Args:
        text (str): The message text.

    Returns:
        dict: {
            "score": float (0-1, where 0.5 = neutral),
            "label": str ("positive" | "neutral" | "negative"),
            "subjectivity": float (0-1, how opinion-based vs factual)
        }
    """
    if not text or not text.strip():
        return {"score": 0.5, "label": "neutral", "subjectivity": 0.0}

    blob = TextBlob(text)
    sentiment_res = blob.sentiment
    try:
        polarity = float(getattr(sentiment_res, 'polarity', 0.0))
        subjectivity = float(getattr(sentiment_res, 'subjectivity', 0.0))
    except (TypeError, ValueError, AttributeError):
        polarity = float(sentiment_res[0]) if isinstance(sentiment_res, (list, tuple)) and len(sentiment_res) > 0 else 0.0
        subjectivity = float(sentiment_res[1]) if isinstance(sentiment_res, (list, tuple)) and len(sentiment_res) > 1 else 0.0

    score = normalize_sentiment(polarity, 'textblob')

    if score > 0.6:
        label = "positive"
    elif score < 0.4:
        label = "negative"
    else:
        label = "neutral"

    return {
        "score": round(score, 4),
        "label": label,
        "subjectivity": round(subjectivity, 4)
    }


def get_sentiments_batch(texts):
    """
    Analyze sentiment for a list of messages.

    Args:
        texts (list[str]): Messages to analyze.

    Returns:
        list[dict]: Sentiment result per message.
    """
    return [get_sentiment(t) for t in texts]
