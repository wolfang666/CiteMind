from pathlib import Path
from typing import Dict

_HAS_BTP = False
try:
    import bibtexparser
    from bibtexparser.bwriter import BibTexWriter
    _HAS_BTP = True
except ImportError:
    pass


def parse_bib(path: str) -> Dict[str, dict]:
    """Return {cite_key: entry_dict}."""
    if not _HAS_BTP:
        # Basic manual parser fallback
        text = Path(path).read_text(encoding="utf-8") if Path(path).exists() else ""
        import re
        entries = {}
        for m in re.finditer(r"@\w+\{(\w+),", text):
            entries[m.group(1)] = {"ID": m.group(1)}
        return entries
    if not Path(path).exists():
        return {}
    text = Path(path).read_text(encoding="utf-8")
    db = bibtexparser.loads(text)
    return {e["ID"]: e for e in db.entries}


def bib_to_string(entries: Dict[str, dict]) -> str:
    if not _HAS_BTP:
        return "\n".join(str(e) for e in entries.values())
    import bibtexparser
    db = bibtexparser.bibdatabase.BibDatabase()
    db.entries = list(entries.values())
    writer = BibTexWriter()
    return writer.write(db)


def add_entry(bib_path: str, entry: dict) -> None:
    existing = parse_bib(bib_path) if Path(bib_path).exists() else {}
    existing[entry["ID"]] = entry
    Path(bib_path).write_text(bib_to_string(existing), encoding="utf-8")
