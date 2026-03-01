import os
import numpy as np


os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

_model = None
_HAS_ST = False

try:
    from sentence_transformers import SentenceTransformer
    _HAS_ST = True
except ImportError:
    pass

from config import EMBEDDING_MODEL, EMBEDDING_DIM


def get_model():
    global _model
    if not _HAS_ST:
        return None
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def embed(texts: list) -> np.ndarray:
    model = get_model()
    if model is None:
        return np.random.rand(len(texts), EMBEDDING_DIM).astype(np.float32)
    return model.encode(texts, convert_to_numpy=True, show_progress_bar=False)


def embed_one(text: str) -> np.ndarray:
    return embed([text])[0]
