from .embedder import embed_one, embed
from .vector_store import get_store
import numpy as np


def retrieve_papers(query: str, top_k: int = 5) -> list:
    vec = embed_one(query)
    return get_store().search(vec, top_k=top_k)


def index_paper(paper_id: int, title: str, abstract: str, cite_key: str, doi: str = ""):
    text = f"{title}. {abstract}"
    vec = embed([text])
    meta = {"paper_id": paper_id, "title": title, "cite_key": cite_key, "doi": doi}
    get_store().add(vec, [meta])
