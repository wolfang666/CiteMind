"""MCP Tool: verify_citations — cross-check .tex and .bib, verify DOIs."""

try:
    from pydantic import BaseModel
except ImportError:
    from dataclasses import dataclass as BaseModel

from config import PROJECTS_DIR


class VerifyCitationsInput:
    def __init__(self, project_id: str):
        self.project_id = project_id


try:
    from pydantic import BaseModel as PydanticBase
    class VerifyCitationsInput(PydanticBase):
        project_id: str
except ImportError:
    pass


async def verify_citations(inp, db=None) -> dict:
    project_dir = PROJECTS_DIR / inp.project_id
    tex_path = project_dir / "main.tex"
    bib_path = project_dir / "references.bib"

    if not tex_path.exists():
        return {"error": f"Project '{inp.project_id}' not found"}

    tex_content = tex_path.read_text()
    from services.citation_service import verify_all_citations
    result = await verify_all_citations(db, 0, tex_content, str(bib_path))
    return {"status": "ok", **result}
