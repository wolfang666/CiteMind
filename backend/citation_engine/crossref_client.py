import httpx
from utils.logger import get_logger
log = get_logger(__name__)

async def search_crossref(query: str, rows: int = 5) -> list:
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get("https://api.crossref.org/works",
                params={"query": query, "rows": rows,
                        "select": "title,author,published,DOI,abstract"},
                headers={"User-Agent": "CiteMind/3.0 (mailto:research@citemind.app)"})
            r.raise_for_status()
            items = r.json().get("message", {}).get("items", [])
            out = []
            for it in items:
                title = " ".join(it.get("title", [""]))
                authors_raw = it.get("author", [])
                authors = ", ".join(f"{a.get('family','')} {a.get('given','')}".strip() for a in authors_raw[:3])
                year = None
                pub = it.get("published", {}).get("date-parts", [[None]])
                if pub and pub[0] and pub[0][0]: year = pub[0][0]
                doi = it.get("DOI", "")
                if title:
                    out.append({"title": title, "authors": authors, "year": year, "doi": doi,
                                "abstract": it.get("abstract", "")[:400]})
            return out
    except Exception as e:
        log.warning(f"CrossRef: {e}")
        return []

async def verify_doi(doi: str) -> bool:
    if not doi: return False
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.head(f"https://doi.org/{doi}", follow_redirects=True)
            return r.status_code < 400
    except Exception:
        return False
