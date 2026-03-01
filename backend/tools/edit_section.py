"""MCP Tool: edit_section — edit existing LaTeX section text."""

from config import PROJECTS_DIR

try:
    from pydantic import BaseModel
    class EditSectionInput(BaseModel):
        project_id: str
        section_name: str
        instruction: str
except ImportError:
    class EditSectionInput:
        def __init__(self, project_id, section_name, instruction):
            self.project_id = project_id
            self.section_name = section_name
            self.instruction = instruction


async def edit_section(inp) -> dict:
    tex_path = PROJECTS_DIR / inp.project_id / "main.tex"
    if not tex_path.exists():
        return {"error": f"Project '{inp.project_id}' not found"}

    from latex.section_manager import SectionManager
    mgr = SectionManager(str(tex_path))
    original = mgr.get(inp.section_name)
    if not original:
        return {"error": f"Section '{inp.section_name}' not found"}

    from services.generation_service import edit_latex_text
    edited = await edit_latex_text(original, inp.instruction)
    mgr.upsert(inp.section_name, edited)

    return {
        "status": "ok",
        "section": inp.section_name,
        "original": original,
        "edited": edited,
    }
