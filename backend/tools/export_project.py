"""MCP Tool: export_project — zip .tex + .bib for download."""

import zipfile
import io
from config import PROJECTS_DIR

try:
    from pydantic import BaseModel
    class ExportProjectInput(BaseModel):
        project_id: str
except ImportError:
    class ExportProjectInput:
        def __init__(self, project_id):
            self.project_id = project_id


def export_project(inp) -> dict:
    project_dir = PROJECTS_DIR / inp.project_id
    if not project_dir.exists():
        return {"error": f"Project '{inp.project_id}' not found"}

    buf = io.BytesIO()
    files_added = []
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(project_dir.iterdir()):
            if f.suffix in {".tex", ".bib", ".json"} and "export" not in f.name:
                zf.write(f, arcname=f.name)
                files_added.append(f.name)
    buf.seek(0)

    out_path = project_dir / f"{inp.project_id}_export.zip"
    out_path.write_bytes(buf.getvalue())

    return {
        "status": "ok",
        "zip_path": str(out_path),
        "files": files_added,
        "size_bytes": len(buf.getvalue()),
    }
