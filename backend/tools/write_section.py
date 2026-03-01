"""MCP Tool: write_section — generate and save a LaTeX section."""

from config import PROJECTS_DIR

try:
    from pydantic import BaseModel
    class WriteSectionInput(BaseModel):
        project_id: str
        section_name: str
        context: str
        instructions: str = ""
except ImportError:
    class WriteSectionInput:
        def __init__(self, project_id, section_name, context, instructions=""):
            self.project_id = project_id
            self.section_name = section_name
            self.context = context
            self.instructions = instructions


async def write_section(inp) -> dict:
    tex_path = PROJECTS_DIR / inp.project_id / "main.tex"
    if not tex_path.exists():
        return {"error": f"Project '{inp.project_id}' not found"}

    from services.generation_service import generate_latex_section
    content = await generate_latex_section(inp.section_name, inp.context, inp.instructions)

    from latex.section_manager import SectionManager
    mgr = SectionManager(str(tex_path))
    mgr.upsert(inp.section_name, content)

    return {
        "status": "ok",
        "section": inp.section_name,
        "content": content,
        "message": f"Section '{inp.section_name}' written and saved.",
    }
