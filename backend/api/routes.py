import json
import json as _json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List

from db.database import get_db
from config import PROJECTS_DIR
from services.generation_service import (
    generate_latex_section, edit_latex_text, generate_bibtex,
    chat_response, get_llm_status,
)
from services.paper_search_service import search_all_sources, store_paper, get_all_papers
from services.integrations_service import (
    # Google
    get_calendar_events, create_calendar_event,
    save_google_token, get_oauth_url, exchange_code_for_tokens, google_connected,
    # Notion
    get_notion_pages, create_notion_page,
    exchange_notion_code, notion_connected, disconnect_notion,
    get_notion_workspace_info,
    # Todos
    get_todos, create_todo, toggle_todo, delete_todo,
    # Status
    get_integration_status,
)
from services.citation_service import verify_all_citations, get_stats
from services.mcp_tools import list_tools, call_tool
from latex.section_manager import SectionManager
from tools.export_project import export_project, ExportProjectInput

router = APIRouter()

class ProjectCreate(BaseModel):   name: str
class TexUpdate(BaseModel):       content: str
class SectionWrite(BaseModel):    section_name: str; context: str; instructions: str = ""
class SectionEdit(BaseModel):     section_name: str; instruction: str
class PaperSearch(BaseModel):     query: str; sources: Optional[List[str]] = None; limit: int = 4
class PaperSave(BaseModel):       title: str; authors: str = ""; year: str = ""; doi: str = ""; abstract: str = ""; cite_key: str = ""
class BibGenerate(BaseModel):     title: str; authors: str; year: str; doi: str = ""
class ChatMsg(BaseModel):         message: str; context: str = ""; project_id: Optional[str] = None
class ToolCall(BaseModel):        tool: str; params: dict = {}
class TodoCreate(BaseModel):      title: str; priority: str = "medium"; due_date: Optional[str] = None; project_id: Optional[int] = None
class CalEventCreate(BaseModel):  title: str; start: str; end: str; description: str = ""; with_meet: bool = False
class NotionCreate(BaseModel):    title: str; content: str; database_id: str = ""
class GoogleToken(BaseModel):     access_token: str; refresh_token: str = ""



@router.get("/projects")
async def list_projects():
    if not PROJECTS_DIR.exists():
        return []
    out = []
    for d in sorted(PROJECTS_DIR.iterdir()):
        if d.is_dir():
            meta = d / "metadata.json"
            name = json.loads(meta.read_text())["name"] if meta.exists() else d.name
            out.append({"id": d.name, "name": name})
    return out


@router.post("/projects")
async def create_project(body: ProjectCreate, db=Depends(get_db)):
    proj_id = None
    if db is not None:
        try:
            from db.models import Project
            p = Project(name=body.name)
            db.add(p)
            await db.commit()
            await db.refresh(p)
            proj_id = str(p.id)
        except Exception:
            pass
    if not proj_id:
        existing = [d.name for d in PROJECTS_DIR.iterdir() if d.is_dir()] if PROJECTS_DIR.exists() else []
        nums = [int(x) for x in existing if x.isdigit()]
        proj_id = str(max(nums) + 1 if nums else 1)
    d = PROJECTS_DIR / proj_id
    d.mkdir(parents=True, exist_ok=True)
    (d / "main.tex").write_text(
        f"\\documentclass{{article}}\n"
        f"\\usepackage{{hyperref}}\n"
        f"\\title{{{body.name}}}\n"
        f"\\author{{Author}}\n"
        f"\\date{{\\today}}\n\n"
        f"\\begin{{document}}\n"
        f"\\maketitle\n\n"
        f"\\begin{{abstract}}\n% Write your abstract here\n\\end{{abstract}}\n\n"
        f"\\section{{Introduction}}\n\n"
        f"\\section{{Related Work}}\n\n"
        f"\\section{{Methodology}}\n\n"
        f"\\section{{Experiments}}\n\n"
        f"\\section{{Conclusion}}\n\n"
        f"\\bibliographystyle{{plain}}\n"
        f"\\bibliography{{references}}\n\n"
        f"\\end{{document}}\n"
    )
    (d / "references.bib").write_text("")
    (d / "metadata.json").write_text(json.dumps({"id": proj_id, "name": body.name}))
    return {"id": proj_id, "name": body.name}


@router.delete("/projects/{pid}")
async def delete_project(pid: str):
    import shutil
    d = PROJECTS_DIR / pid
    if d.exists():
        shutil.rmtree(d)
    return {"deleted": pid}


@router.get("/projects/{pid}/tex")
async def get_tex(pid: str):
    p = PROJECTS_DIR / pid / "main.tex"
    if not p.exists():
        raise HTTPException(404, "Project not found")
    return {"content": p.read_text()}


@router.put("/projects/{pid}/tex")
async def update_tex(pid: str, body: TexUpdate):
    p = PROJECTS_DIR / pid / "main.tex"
    if not p.exists():
        raise HTTPException(404)
    p.write_text(body.content)
    return {"status": "saved"}


@router.get("/projects/{pid}/bib")
async def get_bib(pid: str):
    p = PROJECTS_DIR / pid / "references.bib"
    return {"content": p.read_text() if p.exists() else ""}


@router.get("/projects/{pid}/sections")
async def get_sections(pid: str):
    p = PROJECTS_DIR / pid / "main.tex"
    if not p.exists():
        raise HTTPException(404)
    return {"sections": SectionManager(str(p)).list_sections()}


@router.get("/projects/{pid}/stats")
async def get_project_stats(pid: str, db=Depends(get_db)):
    tex = PROJECTS_DIR / pid / "main.tex"
    bib = PROJECTS_DIR / pid / "references.bib"
    if not tex.exists():
        raise HTTPException(404)
    n = int(pid) if pid.isdigit() else 0
    return await get_stats(db, n, tex.read_text(), str(bib))


@router.get("/projects/{pid}/export")
async def export_api(pid: str):
    r = export_project(ExportProjectInput(project_id=pid))
    if "error" in r:
        raise HTTPException(404, r["error"])
    return FileResponse(r["zip_path"], media_type="application/zip", filename=f"project_{pid}.zip")

@router.post("/projects/{pid}/write-section")
async def write_section_api(pid: str, body: SectionWrite):
    tex_path = PROJECTS_DIR / pid / "main.tex"
    if not tex_path.exists():
        raise HTTPException(404)
    content = await generate_latex_section(body.section_name, body.context, body.instructions)
    SectionManager(str(tex_path)).upsert(body.section_name, content)
    return {"status": "ok", "section": body.section_name, "content": content}


@router.post("/projects/{pid}/edit-section")
async def edit_section_api(pid: str, body: SectionEdit):
    tex_path = PROJECTS_DIR / pid / "main.tex"
    if not tex_path.exists():
        raise HTTPException(404)
    mgr      = SectionManager(str(tex_path))
    original = mgr.get(body.section_name)
    if not original:
        raise HTTPException(404, f"Section '{body.section_name}' not found")
    edited = await edit_latex_text(original, body.instruction)
    mgr.upsert(body.section_name, edited)
    return {"status": "ok", "section": body.section_name, "edited": edited}


@router.post("/projects/{pid}/verify-citations")
async def verify_api(pid: str, db=Depends(get_db)):
    tex = PROJECTS_DIR / pid / "main.tex"
    bib = PROJECTS_DIR / pid / "references.bib"
    if not tex.exists():
        raise HTTPException(404)
    return await verify_all_citations(db, 0, tex.read_text(), str(bib))


@router.post("/projects/{pid}/generate-bib")
async def gen_bib_api(pid: str, body: BibGenerate):
    bibtex   = await generate_bibtex(body.title, body.authors, body.year, body.doi)
    bib_path = PROJECTS_DIR / pid / "references.bib"
    with open(bib_path, "a") as f:
        f.write("\n" + bibtex)
    return {"status": "ok", "bibtex": bibtex}



@router.post("/papers/search")
async def search_papers(body: PaperSearch, db=Depends(get_db)):
    results = await search_all_sources(body.query, per_source=body.limit)
    for p in results["all"][:3]:
        try:
            await store_paper(db, p)
        except Exception:
            pass
    return results


@router.post("/papers/save")
async def save_paper(body: PaperSave, db=Depends(get_db)):
    paper  = body.dict()
    stored = await store_paper(db, paper)
    return stored


@router.delete("/papers/{pid}")
async def delete_paper(pid: int, db=Depends(get_db)):
    try:
        from sqlalchemy import select
        from db.models import Paper
        result = await db.execute(select(Paper).where(Paper.id == pid))
        paper  = result.scalar_one_or_none()
        if paper:
            await db.delete(paper)
            await db.commit()
        return {"deleted": pid}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/papers")
async def list_papers(db=Depends(get_db)):
    return await get_all_papers(db)

@router.post("/chat")
async def chat_api(body: ChatMsg, db=Depends(get_db)):
    tools      = [t["name"] for t in list_tools()]
    ctx        = f"Project: {body.project_id}" if body.project_id else ""
    tools_ctx  = f"Tools available: {', '.join(tools)}"
    calendar_items, notion_items = [], []
    try:
        calendar_items = await get_calendar_events(days_ahead=7)
    except Exception:
        pass
    try:
        if body.message:
            notion_items = await get_notion_pages(
                body.message.split()[0] if body.message else ""
            )
    except Exception:
        pass
    resp = await chat_response(body.message, ctx, tools_ctx, calendar_items, notion_items)
    return {"response": resp}


@router.post("/tools/call")
async def call_tool_api(body: ToolCall, db=Depends(get_db)):
    return await call_tool(body.tool, body.params, db=db)


@router.get("/tools")
async def get_tools():
    return list_tools()



@router.get("/integrations/calendar")
async def cal_list(days: int = 7):
    return await get_calendar_events(days)


@router.post("/integrations/calendar")
async def cal_create(body: CalEventCreate):
    return await create_calendar_event(
        body.title, body.start, body.end, body.description, body.with_meet
    )


@router.post("/integrations/google/token")
async def google_token(body: GoogleToken):
    save_google_token(body.access_token, body.refresh_token)
    return {"status": "ok"}


from fastapi.responses import RedirectResponse, HTMLResponse


@router.get("/integrations/google/auth-url")
async def google_auth_url():
    return {"url": get_oauth_url(), "connected": google_connected()}


@router.get("/integrations/google/callback")
async def google_callback(code: str = "", error: str = ""):
    """OAuth2 callback — exchange code, then close popup."""
    if error:
        return HTMLResponse(
            f"""<html><body style="font-family:sans-serif;padding:24px;background:#0d0f14;color:#f56565">
            <h3>Auth Error</h3><p>{error}</p>
            <script>window.opener&&window.opener.postMessage({{type:'oauth_error',error:'{error}'}},'*');window.close()</script>
            </body></html>"""
        )
    if not code:
        return HTMLResponse("<html><body>No code received</body></html>")
    try:
        await exchange_code_for_tokens(code)
        return HTMLResponse(
            """<html><body style="font-family:sans-serif;padding:24px;background:#0d0f14;color:#56d4a0">
            <h3> Google Calendar Connected!</h3><p>You can close this window.</p>
            <script>window.opener&&window.opener.postMessage({type:'oauth_success'},'*');setTimeout(()=>window.close(),1500)</script>
            </body></html>"""
        )
    except Exception as e:
        return HTMLResponse(
            f"""<html><body style="font-family:sans-serif;padding:24px;background:#0d0f14;color:#f56565">
            <h3> Error</h3><p>{e}</p>
            <script>window.opener&&window.opener.postMessage({{type:'oauth_error',error:'{e}'}},'*');window.close()</script>
            </body></html>"""
        )


@router.get("/integrations/google/status")
async def google_status():
    return {"connected": google_connected()}


@router.delete("/integrations/google/disconnect")
async def google_disconnect():
    from services.integrations_service import GOOGLE_TOKEN_FILE
    if GOOGLE_TOKEN_FILE.exists():
        GOOGLE_TOKEN_FILE.unlink()
    return {"disconnected": True}



from config import NOTION_CLIENT_ID, NOTION_REDIRECT_URI


@router.get("/integrations/notion/auth-url")
async def notion_auth_url():
    if not NOTION_CLIENT_ID:
        raise HTTPException(
            400,
            "NOTION_CLIENT_ID not configured. Set it in .env to enable OAuth2.",
        )
    from urllib.parse import urlencode
    params = {
        "client_id":     NOTION_CLIENT_ID,
        "response_type": "code",
        "owner":         "user",
        "redirect_uri":  NOTION_REDIRECT_URI,
    }
    url = "https://api.notion.com/v1/oauth/authorize?" + urlencode(params)
    return {"url": url, "connected": notion_connected()}


@router.get("/integrations/notion/callback")
async def notion_callback(code: str = "", error: str = ""):
    """Notion OAuth2 callback — exchange code, then close popup."""
    if error:
        return HTMLResponse(
            f"""<html><body style="font-family:sans-serif;padding:24px;background:#0d0f14;color:#f56565">
            <h3> Notion Auth Error</h3><p>{error}</p>
            <script>window.opener&&window.opener.postMessage({{type:'oauth_error',error:'{error}'}},'*');window.close()</script>
            </body></html>"""
        )
    if not code:
        return HTMLResponse("<html><body>No code received</body></html>")
    try:
        data = await exchange_notion_code(code)
        workspace = data.get("workspace_name", "Notion")
        return HTMLResponse(
            f"""<html><body style="font-family:sans-serif;padding:24px;background:#0d0f14;color:#56d4a0">
            <h3> Notion Connected!</h3>
            <p>Workspace: <strong>{workspace}</strong></p>
            <p>You can close this window.</p>
            <script>window.opener&&window.opener.postMessage({{type:'oauth_success',workspace:'{workspace}'}},'*');setTimeout(()=>window.close(),1500)</script>
            </body></html>"""
        )
    except Exception as e:
        return HTMLResponse(
            f"""<html><body style="font-family:sans-serif;padding:24px;background:#0d0f14;color:#f56565">
            <h3> Error</h3><p>{e}</p>
            <script>window.opener&&window.opener.postMessage({{type:'oauth_error',error:'{e}'}},'*');window.close()</script>
            </body></html>"""
        )


@router.get("/integrations/notion/status")
async def notion_status():
    info = get_notion_workspace_info()
    return {
        "connected":      notion_connected(),
        "workspace_name": info.get("workspace_name", ""),
        "workspace_id":   info.get("workspace_id", ""),
    }


@router.delete("/integrations/notion/disconnect")
async def notion_disconnect():
    disconnect_notion()
    return {"disconnected": True}




@router.get("/integrations/notion")
async def notion_list(q: str = ""):
    return await get_notion_pages(q)


@router.post("/integrations/notion")
async def notion_create(body: NotionCreate):
    return await create_notion_page(body.title, body.content, body.database_id)



@router.get("/todos")
async def todos_list(project_id: Optional[int] = None, db=Depends(get_db)):
    return await get_todos(db, project_id)


@router.post("/todos")
async def todo_create(body: TodoCreate, db=Depends(get_db)):
    from datetime import date
    due = date.fromisoformat(body.due_date) if body.due_date else None
    return await create_todo(db, body.title, body.priority, due, body.project_id)


@router.patch("/todos/{tid}/toggle")
async def todo_toggle(tid: int, db=Depends(get_db)):
    return await toggle_todo(db, tid)


@router.delete("/todos/{tid}")
async def todo_delete(tid: int, db=Depends(get_db)):
    return await delete_todo(db, tid)



@router.get("/status")
async def status_api():
    return {
        "llm":          get_llm_status(),
        "integrations": get_integration_status(),
        "tools":        len(list_tools()),
    }


@router.get("/notifications")
async def get_notifications(db=Depends(get_db)):
    """Generate smart notifications from todos, calendar, citation health."""
    notifs = []
    try:
        todos = await get_todos(db)
        from datetime import date
        today = date.today().isoformat()
        for t in todos:
            if t.get("due_date") and not t["done"] and t["due_date"] <= today:
                notifs.append({
                    "type":    "warning",
                    "title":   "Overdue Task",
                    "message": f"'{t['title']}' was due {t['due_date']}",
                    "action":  "todos",
                })
    except Exception:
        pass
    try:
        events = await get_calendar_events(days_ahead=1)
        for e in events[:2]:
            if e.get("meet_link"):
                notifs.append({
                    "type":      "info",
                    "title":     "Meeting Soon",
                    "message":   e["title"],
                    "meet_link": e["meet_link"],
                    "action":    "calendar",
                })
    except Exception:
        pass
    notifs.append({
        "type":    "tip",
        "title":   "AI Tip",
        "message": "Try: 'search papers about attention mechanisms' in the Copilot",
        "action":  "copilot",
    })
    return notifs

@router.post("/projects/{pid}/stream-section")
async def stream_section(pid: str, body: SectionWrite):
    """Stream LLM tokens to frontend; saves to .tex when complete."""
    tex_path = PROJECTS_DIR / pid / "main.tex"
    if not tex_path.exists():
        raise HTTPException(404)

    async def event_stream():
        from config import GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL
        import httpx
        full = ""
        try:
            messages = [
                {
                    "role":    "system",
                    "content": (
                        "You are an expert academic LaTeX writer. Return ONLY valid LaTeX body — "
                        "no \\documentclass, no \\begin{document}. "
                        "Use equations $...$, \\begin{itemize}, \\cite{key}."
                    ),
                },
                {
                    "role":    "user",
                    "content": (
                        f"Write the '{body.section_name}' section.\n"
                        f"Topic: {body.context}\n"
                        f"{'Instructions: ' + body.instructions if body.instructions else ''}\n"
                        "Return LaTeX body:"
                    ),
                },
            ]
            async with httpx.AsyncClient(timeout=60) as c:
                async with c.stream(
                    "POST",
                    f"{GROQ_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {GROQ_API_KEY}",
                        "Content-Type":  "application/json",
                    },
                    json={
                        "model":       GROQ_MODEL,
                        "messages":    messages,
                        "max_tokens":  1500,
                        "temperature": 0.7,
                        "stream":      True,
                    },
                ) as r:
                    async for line in r.aiter_lines():
                        if line.startswith("data: ") and line != "data: [DONE]":
                            try:
                                chunk = _json.loads(line[6:])
                                token = chunk["choices"][0]["delta"].get("content", "")
                                if token:
                                    full += token
                                    yield f"data: {_json.dumps({'token': token, 'done': False})}\n\n"
                            except Exception:
                                pass
            from latex.section_manager import SectionManager
            SectionManager(str(tex_path)).upsert(body.section_name, full)
            yield f"data: {_json.dumps({'token': '', 'done': True, 'section': body.section_name, 'full_content': full})}\n\n"
        except Exception:
            from services.generation_service import generate_latex_section
            content = await generate_latex_section(
                body.section_name, body.context, body.instructions
            )
            from latex.section_manager import SectionManager
            SectionManager(str(tex_path)).upsert(body.section_name, content)
            yield f"data: {_json.dumps({'token': content, 'done': True, 'section': body.section_name, 'full_content': content})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/projects/{pid}/compile")
async def compile_latex(pid: str):
    """Run pdflatex on main.tex, return logs + PDF URL."""
    import asyncio
    tex_path = PROJECTS_DIR / pid / "main.tex"
    if not tex_path.exists():
        raise HTTPException(404, "Project not found")
    proj_dir = PROJECTS_DIR / pid
    try:
        proc = await asyncio.create_subprocess_exec(
            "pdflatex",
            "-interaction=nonstopmode",
            "-output-directory", str(proj_dir),
            str(tex_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(proj_dir),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        stdout_text = stdout.decode("utf-8", errors="replace")
        stderr_text = stderr.decode("utf-8", errors="replace")
        log_file = proj_dir / "main.log"
        full_log = (
            log_file.read_text(errors="replace")
            if log_file.exists()
            else (stdout_text + stderr_text)
        )
        pdf_path = proj_dir / "main.pdf"
        success  = pdf_path.exists() and proc.returncode == 0
        errors, warnings = _parse_latex_log(full_log)
        return {
            "success":    success,
            "returncode": proc.returncode,
            "log":        full_log[-8000:],
            "errors":     errors,
            "warnings":   warnings,
            "pdf_url":    f"/api/v3/projects/{pid}/pdf" if success else None,
        }
    except asyncio.TimeoutError:
        return {
            "success":  False,
            "log":      "Compilation timed out (60s)",
            "errors":   ["Timeout"],
            "warnings": [],
        }
    except Exception as e:
        return {"success": False, "log": str(e), "errors": [str(e)], "warnings": []}


def _parse_latex_log(log: str) -> tuple[list, list]:
    import re
    errors   = re.findall(r"^! .+",              log, re.MULTILINE)[:20]
    warnings = re.findall(r"^LaTeX Warning:.+",  log, re.MULTILINE)[:20]
    return errors, warnings


@router.get("/projects/{pid}/pdf")
async def serve_pdf(pid: str):
    pdf = PROJECTS_DIR / pid / "main.pdf"
    if not pdf.exists():
        raise HTTPException(404, "PDF not compiled yet")
    return FileResponse(str(pdf), media_type="application/pdf", filename=f"{pid}.pdf")
