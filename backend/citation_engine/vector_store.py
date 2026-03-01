import json
import numpy as np
from pathlib import Path
from config import FAISS_INDEX_PATH, FAISS_META_PATH, EMBEDDING_DIM
from utils.logger import get_logger

log = get_logger(__name__)

_HAS_FAISS = False
try:
    import faiss
    _HAS_FAISS = True
except ImportError:
    pass


class VectorStore:
    """FAISS-backed vector store with graceful fallback when faiss not installed."""

    def __init__(self):
        self.meta: list = []
        self._vectors: list = []  # fallback storage
        self._use_faiss = _HAS_FAISS
        self.index = None
        self._load()

    def _load(self):
        if self._use_faiss:
            if FAISS_INDEX_PATH.exists() and FAISS_META_PATH.exists():
                try:
                    import faiss
                    self.index = faiss.read_index(str(FAISS_INDEX_PATH))
                    self.meta = json.loads(FAISS_META_PATH.read_text())
                    log.info(f"Loaded FAISS index: {self.index.ntotal} vectors")
                    return
                except Exception as e:
                    log.warning(f"Could not load FAISS index: {e}")
            import faiss
            self.index = faiss.IndexFlatIP(EMBEDDING_DIM)
            self.meta = []
        else:
            log.warning("faiss-cpu not installed — using in-memory vector store (slower)")
            self.meta = []
            self._vectors = []

    @property
    def ntotal(self) -> int:
        if self._use_faiss and self.index:
            return self.index.ntotal
        return len(self._vectors)

    def add(self, vectors: np.ndarray, metadata: list):
        norm = vectors / (np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-9)
        if self._use_faiss:
            self.index.add(norm.astype(np.float32))
        else:
            self._vectors.extend(norm.astype(np.float32).tolist())
        self.meta.extend(metadata)
        self._save()

    def search(self, query_vec: np.ndarray, top_k: int = 5) -> list:
        if self.ntotal == 0:
            return []
        q = query_vec / (np.linalg.norm(query_vec) + 1e-9)
        if self._use_faiss:
            scores, indices = self.index.search(q.astype(np.float32).reshape(1, -1), min(top_k, self.ntotal))
            return [
                {**self.meta[i], "score": float(s)}
                for s, i in zip(scores[0], indices[0]) if i != -1
            ]
        else:
            # Pure numpy cosine similarity
            mat = np.array(self._vectors, dtype=np.float32)
            sims = mat @ q.astype(np.float32)
            top = np.argsort(sims)[::-1][:top_k]
            return [{**self.meta[i], "score": float(sims[i])} for i in top]

    def _save(self):
        if self._use_faiss and self.index:
            import faiss
            faiss.write_index(self.index, str(FAISS_INDEX_PATH))
        FAISS_META_PATH.write_text(json.dumps(self.meta))


_store = None


def get_store() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore()
    return _store
