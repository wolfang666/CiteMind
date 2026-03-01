import numpy as np


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    a_norm = a / (np.linalg.norm(a) + 1e-9)
    b_norm = b / (np.linalg.norm(b) + 1e-9)
    return float(np.dot(a_norm, b_norm))


def rank_by_similarity(query_vec: np.ndarray, candidates: list[tuple[str, np.ndarray]]) -> list[tuple[str, float]]:
    scored = [(name, cosine_similarity(query_vec, vec)) for name, vec in candidates]
    return sorted(scored, key=lambda x: x[1], reverse=True)
