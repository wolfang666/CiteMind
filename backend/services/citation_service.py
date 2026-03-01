import re
from pathlib import Path
from utils.logger import get_logger

log = get_logger(__name__)


def _parse_bib_keys(bib_path: str) -> set:
    if not Path(bib_path).exists():
        return set()
    text = Path(bib_path).read_text(encoding="utf-8")
    return set(re.findall(r"@\w+\{(\w+),", text))


def _parse_tex_keys(tex_content: str) -> set:
    keys = set()
    for m in re.finditer(r"\\cite(?:\[.*?\])?\{([^}]+)\}", tex_content):
        for k in m.group(1).split(","):
            keys.add(k.strip())
    return keys


async def verify_all_citations(db, project_id: int, tex_content: str, bib_path: str) -> dict:
    used_keys = _parse_tex_keys(tex_content)
    bib_keys = _parse_bib_keys(bib_path)
    missing = used_keys - bib_keys
    unused = bib_keys - used_keys

    doi_verified = 0
    if db is not None:
        try:
            from sqlalchemy import select
            from db.models import Paper, Citation
            from citation_engine.crossref_client import verify_doi
            for key in bib_keys:
                paper_res = await db.execute(select(Paper).where(Paper.cite_key == key))
                paper = paper_res.scalar_one_or_none()
                if paper and paper.doi:
                    ok = await verify_doi(paper.doi)
                    if ok:
                        doi_verified += 1
        except Exception as e:
            log.warning(f"DB citation verify skipped: {e}")

    return {
        "total_used": len(used_keys),
        "total_bib": len(bib_keys),
        "missing_from_bib": list(missing),
        "unused_in_tex": list(unused),
        "doi_verified": doi_verified,
    }


async def get_stats(db, project_id: int, tex_content: str, bib_path: str) -> dict:
    used_keys = _parse_tex_keys(tex_content)
    bib_keys = _parse_bib_keys(bib_path)
    verified_count = 0
    if db is not None:
        try:
            from sqlalchemy import select
            from db.models import Citation
            res = await db.execute(
                select(Citation).where(
                    Citation.project_id == project_id,
                    Citation.verified == True,
                )
            )
            verified_count = len(res.scalars().all())
        except Exception:
            pass
    return {
        "total_citations": len(used_keys),
        "total_bib_entries": len(bib_keys),
        "verified": verified_count,
        "missing": len(used_keys - bib_keys),
        "unused": len(bib_keys - used_keys),
    }
