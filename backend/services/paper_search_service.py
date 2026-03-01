"""
paper_search_service.py
────────────────────────
Searches 4 free academic APIs simultaneously:
  1. CrossRef        — DOI metadata, 100M+ papers
  2. Semantic Scholar — AI/CS focused, abstracts, citations
  3. OpenAlex        — Open metadata, 250M+ works
  4. arXiv           — Preprints (free, no key)

Returns unified Paper objects, deduped by title similarity.
"""

import asyncio
import httpx
import re
from utils.logger import get_logger

log = get_logger(__name__)

HEADERS = {"User-Agent": "CiteMind/3.0 (research tool; mailto:research@citemind.app)"}


# ─────────────────────────────────────────────────────
# Normalizers
# ─────────────────────────────────────────────────────

def _make_key(title: str, year, authors: str) -> str:
    from utils.helpers import slugify
    last = (authors.split(",")[0].strip().split()[-1]
            if authors and authors.strip() else "anon")
    word = re.sub(r"[^\w]", "", title.split()[0]) if title.split() else "paper"
    return slugify(f"{last}{year or 'nd'}_{word}")[:30]


def _clean(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.strip())


# ─────────────────────────────────────────────────────
# CrossRef
# ─────────────────────────────────────────────────────

async def search_crossref(query: str, rows: int = 5) -> list:
    try:
        async with httpx.AsyncClient(timeout=10, headers=HEADERS) as c:
            r = await c.get(
                "https://api.crossref.org/works",
                params={"query": query, "rows": rows,
                        "select": "title,author,published,DOI,abstract,type"}
            )
            r.raise_for_status()
            items = r.json().get("message", {}).get("items", [])
            out = []
            for it in items:
                title = _clean(" ".join(it.get("title", [""])))
                if not title:
                    continue
                authors_raw = it.get("author", [])
                authors = ", ".join(
                    f"{a.get('family', '')} {a.get('given', '')}".strip()
                    for a in authors_raw[:3]
                )
                year = None
                pub = it.get("published", {}).get("date-parts", [[None]])
                if pub and pub[0] and pub[0][0]:
                    year = pub[0][0]
                doi = it.get("DOI", "")
                abstract = _clean(it.get("abstract", ""))
                cite_key = _make_key(title, year, authors)
                out.append({
                    "source": "crossref",
                    "title": title, "authors": authors, "year": year,
                    "doi": doi, "abstract": abstract[:500],
                    "cite_key": cite_key,
                    "url": f"https://doi.org/{doi}" if doi else "",
                })
            return out
    except Exception as e:
        log.warning(f"CrossRef error: {e}")
        return []


# ─────────────────────────────────────────────────────
# Semantic Scholar
# ─────────────────────────────────────────────────────

async def search_semantic(query: str, limit: int = 5) -> list:
    try:
        async with httpx.AsyncClient(timeout=12, headers=HEADERS) as c:
            r = await c.get(
                "https://api.semanticscholar.org/graph/v1/paper/search",
                params={
                    "query": query, "limit": limit,
                    "fields": "title,authors,year,externalIds,abstract,citationCount,url"
                }
            )
            r.raise_for_status()
            items = r.json().get("data", [])
            out = []
            for it in items:
                title = _clean(it.get("title", ""))
                if not title:
                    continue
                authors = ", ".join(
                    a.get("name", "") for a in it.get("authors", [])[:3]
                )
                year = it.get("year")
                doi = it.get("externalIds", {}).get("DOI", "")
                arxiv = it.get("externalIds", {}).get("ArXiv", "")
                cite_key = _make_key(title, year, authors)
                out.append({
                    "source": "semantic_scholar",
                    "title": title, "authors": authors, "year": year,
                    "doi": doi, "abstract": _clean(it.get("abstract", ""))[:500],
                    "cite_key": cite_key,
                    "citations": it.get("citationCount", 0),
                    "url": it.get("url", "") or (f"https://arxiv.org/abs/{arxiv}" if arxiv else ""),
                })
            return out
    except Exception as e:
        log.warning(f"Semantic Scholar error: {e}")
        return []


# ─────────────────────────────────────────────────────
# OpenAlex
# ─────────────────────────────────────────────────────

async def search_openalex(query: str, per_page: int = 5) -> list:
    try:
        async with httpx.AsyncClient(timeout=10, headers=HEADERS) as c:
            r = await c.get(
                "https://api.openalex.org/works",
                params={
                    "search": query, "per-page": per_page,
                    "select": "title,authorships,publication_year,doi,abstract_inverted_index,cited_by_count,primary_location"
                }
            )
            r.raise_for_status()
            items = r.json().get("results", [])
            out = []
            for it in items:
                title = _clean(it.get("title", ""))
                if not title:
                    continue
                authors = ", ".join(
                    a.get("author", {}).get("display_name", "")
                    for a in it.get("authorships", [])[:3]
                )
                year = it.get("publication_year")
                doi_raw = it.get("doi", "") or ""
                doi = doi_raw.replace("https://doi.org/", "")
                # Reconstruct abstract from inverted index
                inv = it.get("abstract_inverted_index") or {}
                abstract = ""
                if inv:
                    words = {pos: w for w, positions in inv.items() for pos in positions}
                    abstract = " ".join(words[i] for i in sorted(words))[:500]
                cite_key = _make_key(title, year, authors)
                out.append({
                    "source": "openalex",
                    "title": title, "authors": authors, "year": year,
                    "doi": doi, "abstract": abstract,
                    "cite_key": cite_key,
                    "citations": it.get("cited_by_count", 0),
                    "url": doi_raw or "",
                })
            return out
    except Exception as e:
        log.warning(f"OpenAlex error: {e}")
        return []


# ─────────────────────────────────────────────────────
# arXiv
# ─────────────────────────────────────────────────────

async def search_arxiv(query: str, max_results: int = 5) -> list:
    try:
        async with httpx.AsyncClient(timeout=12, headers=HEADERS) as c:
            r = await c.get(
                "https://export.arxiv.org/api/query",
                params={
                    "search_query": f"all:{query}",
                    "start": 0, "max_results": max_results,
                    "sortBy": "relevance"
                }
            )
            r.raise_for_status()
            # Parse Atom XML
            text = r.text
            entries = re.findall(r"<entry>(.*?)</entry>", text, re.DOTALL)
            out = []
            for entry in entries:
                def tag(t):
                    m = re.search(rf"<{t}[^>]*>(.*?)</{t}>", entry, re.DOTALL)
                    return _clean(m.group(1)) if m else ""
                title = tag("title")
                if not title:
                    continue
                summary = tag("summary")[:500]
                published = tag("published")[:4]
                year = int(published) if published.isdigit() else None
                authors_raw = re.findall(r"<name>(.*?)</name>", entry)
                authors = ", ".join(authors_raw[:3])
                arxiv_id_m = re.search(r"<id>(.*?)</id>", entry)
                arxiv_url = _clean(arxiv_id_m.group(1)) if arxiv_id_m else ""
                arxiv_id = arxiv_url.split("/abs/")[-1] if "/abs/" in arxiv_url else ""
                cite_key = _make_key(title, year, authors)
                out.append({
                    "source": "arxiv",
                    "title": title, "authors": authors, "year": year,
                    "doi": "", "abstract": summary,
                    "cite_key": cite_key,
                    "url": arxiv_url,
                    "arxiv_id": arxiv_id,
                })
            return out
    except Exception as e:
        log.warning(f"arXiv error: {e}")
        return []


# ─────────────────────────────────────────────────────
# Combined search — all 4 sources in parallel
# ─────────────────────────────────────────────────────

def _dedup(papers: list) -> list:
    seen = set()
    out = []
    for p in papers:
        key = re.sub(r"[^\w]", "", p["title"].lower())[:40]
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


async def search_all_sources(query: str, per_source: int = 4) -> dict:
    """Search all 4 APIs simultaneously, return grouped + merged results."""
    cr, ss, oa, ax = await asyncio.gather(
        search_crossref(query, per_source),
        search_semantic(query, per_source),
        search_openalex(query, per_source),
        search_arxiv(query, per_source),
        return_exceptions=True
    )
    def safe(r):
        return r if isinstance(r, list) else []

    all_papers = safe(cr) + safe(ss) + safe(oa) + safe(ax)
    merged = _dedup(all_papers)

    return {
        "crossref": safe(cr),
        "semantic_scholar": safe(ss),
        "openalex": safe(oa),
        "arxiv": safe(ax),
        "all": merged,
        "total": len(merged),
    }


async def store_paper(db, paper: dict) -> dict:
    """Store a paper in DB + vector index. Returns paper with id."""
    from utils.helpers import slugify
    cite_key = paper.get("cite_key") or _make_key(
        paper["title"], paper.get("year"), paper.get("authors", ""))

    bibtex = (
        f"@article{{{cite_key},\n"
        f"  title={{{paper['title']}}},\n"
        f"  author={{{paper.get('authors', '')}}},\n"
        f"  year={{{paper.get('year', 'n.d.')}}},\n"
        f"  doi={{{paper.get('doi', '')}}}\n"
        f"}}\n"
    )
    paper["cite_key"] = cite_key
    paper["bibtex"] = bibtex

    if db is not None:
        try:
            from sqlalchemy import select
            from db.models import Paper
            existing = await db.execute(select(Paper).where(Paper.cite_key == cite_key))
            row = existing.scalar_one_or_none()
            if not row:
                row = Paper(
                    title=paper["title"], authors=paper.get("authors", ""),
                    year=paper.get("year"), doi=paper.get("doi", ""),
                    abstract=paper.get("abstract", ""),
                    cite_key=cite_key, bibtex=bibtex,
                    source=paper.get("source", "local"),
                    url=paper.get("url", ""),
                    citation_count=paper.get("citations", 0),
                )
                db.add(row)
                await db.commit()
                await db.refresh(row)
                try:
                    from citation_engine.retriever import index_paper
                    index_paper(row.id, row.title, row.abstract or "", row.cite_key, row.doi or "")
                except Exception:
                    pass
            paper["id"] = row.id
        except Exception as e:
            log.warning(f"DB store: {e}")
    return paper


async def get_all_papers(db) -> list:
    if db is None:
        return []
    try:
        from sqlalchemy import select
        from db.models import Paper
        result = await db.execute(select(Paper).order_by(Paper.created_at.desc()))
        rows = result.scalars().all()
        return [{"id": p.id, "title": p.title, "authors": p.authors,
                 "year": p.year, "doi": p.doi, "cite_key": p.cite_key,
                 "abstract": p.abstract, "bibtex": p.bibtex,
                 "source": getattr(p, "source", "local"),
                 "url": getattr(p, "url", ""),
                 "citations": getattr(p, "citation_count", 0)} for p in rows]
    except Exception as e:
        log.warning(f"get_all_papers: {e}")
        return []
