"""
mcp_tools.py  — CiteMind Tool Registry
────────────────────────────────────────
Every capability is a registered "tool" callable by name.
The AI Copilot (and external MCP clients) call tools by name + params.
Tools return structured JSON results + human-readable summaries.
"""

import json
import asyncio
from typing import Any
from utils.logger import get_logger

log = get_logger(__name__)

# ── Tool Registry ─────────────────────────────────────
_TOOLS: dict[str, dict] = {}


def tool(name: str, description: str, params: dict):
    """Decorator to register a function as a CiteMind tool."""
    def decorator(fn):
        _TOOLS[name] = {
            "name": name,
            "description": description,
            "params": params,
            "fn": fn,
        }
        return fn
    return decorator


def list_tools() -> list:
    return [
        {"name": v["name"], "description": v["description"], "params": v["params"]}
        for v in _TOOLS.values()
    ]


async def call_tool(name: str, params: dict, db=None) -> dict:
    if name not in _TOOLS:
        return {"error": f"Unknown tool: '{name}'", "available": list(list_tools())}
    try:
        fn = _TOOLS[name]["fn"]
        if asyncio.iscoroutinefunction(fn):
            return await fn(db=db, **params)
        return fn(db=db, **params)
    except Exception as e:
        log.error(f"Tool {name} error: {e}")
        return {"error": str(e), "tool": name}


# ══════════════════════════════════════════════════════
# PAPER SEARCH TOOLS
# ══════════════════════════════════════════════════════

@tool("search_papers", "Search academic papers across CrossRef, Semantic Scholar, OpenAlex, and arXiv simultaneously",
      {"query": "string — search query", "sources": "list[str] — optional filter", "limit": "int — results per source (default 4)"})
async def _search_papers(query: str, sources: list = None, limit: int = 4, db=None) -> dict:
    from services.paper_search_service import search_all_sources
    results = await search_all_sources(query, per_source=limit)
    # Optionally store in DB
    if db:
        for p in results["all"][:5]:
            from services.paper_search_service import store_paper
            await store_paper(db, p)
    summary = f"Found {results['total']} unique papers across 4 sources for '{query}'"
    return {"results": results, "summary": summary, "tool": "search_papers"}


@tool("get_paper_details", "Get detailed info about a specific paper by DOI or title",
      {"doi": "string — paper DOI (optional)", "title": "string — paper title (optional)"})
async def _get_paper_details(doi: str = "", title: str = "", db=None) -> dict:
    from services.paper_search_service import search_semantic
    query = doi or title
    results = await search_semantic(query, limit=1)
    if results:
        return {"paper": results[0], "summary": f"Found: {results[0]['title']}"}
    return {"paper": None, "summary": "Paper not found"}


@tool("save_paper_to_project", "Save a paper to project .bib file",
      {"project_id": "string", "title": "string", "authors": "string", "year": "int|str", "doi": "string"})
async def _save_paper(project_id: str, title: str, authors: str = "", year: str = "", doi: str = "", db=None) -> dict:
    from config import PROJECTS_DIR
    from services.paper_search_service import store_paper, _make_key
    paper = {"title": title, "authors": authors, "year": year, "doi": doi,
             "abstract": "", "cite_key": _make_key(title, year, authors)}
    stored = await store_paper(db, paper)
    bib_path = PROJECTS_DIR / str(project_id) / "references.bib"
    if bib_path.exists():
        existing = bib_path.read_text()
        if stored["cite_key"] not in existing:
            with open(bib_path, "a") as f:
                f.write("\n" + stored["bibtex"])
    return {"cite_key": stored["cite_key"], "bibtex": stored["bibtex"],
            "summary": f"Saved \\cite{{{stored['cite_key']}}} to references.bib"}


# ══════════════════════════════════════════════════════
# LATEX WRITING TOOLS
# ══════════════════════════════════════════════════════

@tool("write_section", "Write a LaTeX section using AI",
      {"project_id": "string", "section_name": "string", "context": "string", "instructions": "string (optional)"})
async def _write_section(project_id: str, section_name: str, context: str, instructions: str = "", db=None) -> dict:
    from config import PROJECTS_DIR
    from services.generation_service import generate_latex_section
    from latex.section_manager import SectionManager
    content = await generate_latex_section(section_name, context, instructions)
    tex_path = PROJECTS_DIR / str(project_id) / "main.tex"
    if tex_path.exists():
        SectionManager(str(tex_path)).upsert(section_name, content)
    return {"section": section_name, "content": content,
            "summary": f"Wrote {section_name} ({len(content)} chars)"}


@tool("edit_section", "Edit an existing section with an instruction",
      {"project_id": "string", "section_name": "string", "instruction": "string"})
async def _edit_section(project_id: str, section_name: str, instruction: str, db=None) -> dict:
    from config import PROJECTS_DIR
    from services.generation_service import edit_latex_text
    from latex.section_manager import SectionManager
    tex_path = PROJECTS_DIR / str(project_id) / "main.tex"
    if not tex_path.exists():
        return {"error": "Project not found"}
    mgr = SectionManager(str(tex_path))
    original = mgr.get(section_name)
    if not original:
        return {"error": f"Section '{section_name}' not found"}
    edited = await edit_latex_text(original, instruction)
    mgr.upsert(section_name, edited)
    return {"section": section_name, "edited": edited,
            "summary": f"Edited {section_name}: {instruction}"}


@tool("get_tex_content", "Get the current .tex file content",
      {"project_id": "string"})
async def _get_tex(project_id: str, db=None) -> dict:
    from config import PROJECTS_DIR
    p = PROJECTS_DIR / str(project_id) / "main.tex"
    content = p.read_text() if p.exists() else ""
    return {"content": content, "summary": f"{len(content)} chars in main.tex"}


@tool("get_sections", "List all sections in the current paper",
      {"project_id": "string"})
async def _get_sections(project_id: str, db=None) -> dict:
    from config import PROJECTS_DIR
    from latex.section_manager import SectionManager
    p = PROJECTS_DIR / str(project_id) / "main.tex"
    if not p.exists():
        return {"sections": [], "summary": "No sections found"}
    sections = SectionManager(str(p)).list_sections()
    return {"sections": sections, "summary": f"{len(sections)} sections: {', '.join(sections)}"}


# ══════════════════════════════════════════════════════
# CITATION TOOLS
# ══════════════════════════════════════════════════════

@tool("verify_citations", "Verify all citations in the paper against .bib file",
      {"project_id": "string"})
async def _verify_citations(project_id: str, db=None) -> dict:
    from config import PROJECTS_DIR
    from services.citation_service import verify_all_citations
    tex = PROJECTS_DIR / str(project_id) / "main.tex"
    bib = PROJECTS_DIR / str(project_id) / "references.bib"
    if not tex.exists():
        return {"error": "Project not found"}
    result = await verify_all_citations(db, 0, tex.read_text(), str(bib))
    missing = result.get("missing_from_bib", [])
    unused = result.get("unused_in_tex", [])
    summary = f"✓ {result.get('doi_verified', 0)} verified. Missing: {missing or 'none'}. Unused: {unused or 'none'}"
    return {**result, "summary": summary}


@tool("generate_bibtex", "Generate a BibTeX entry for a paper",
      {"title": "string", "authors": "string", "year": "string", "doi": "string (optional)"})
async def _generate_bibtex(title: str, authors: str, year: str, doi: str = "", db=None) -> dict:
    from services.generation_service import generate_bibtex
    bibtex = await generate_bibtex(title, authors, year, doi)
    return {"bibtex": bibtex, "summary": f"Generated BibTeX entry for '{title}'"}


# ══════════════════════════════════════════════════════
# TODO / CALENDAR TOOLS
# ══════════════════════════════════════════════════════

@tool("list_todos", "List all todo tasks",
      {"project_id": "int (optional)"})
async def _list_todos(project_id: int = None, db=None) -> dict:
    from services.integrations_service import get_todos
    todos = await get_todos(db, project_id)
    pending = [t for t in todos if not t["done"]]
    return {"todos": todos, "pending_count": len(pending),
            "summary": f"{len(pending)} pending tasks"}


@tool("add_todo", "Add a new todo task",
      {"title": "string", "priority": "high|medium|low", "due_date": "YYYY-MM-DD (optional)"})
async def _add_todo(title: str, priority: str = "medium", due_date: str = None, db=None) -> dict:
    from services.integrations_service import create_todo
    from datetime import date
    due = None
    if due_date:
        try:
            due = date.fromisoformat(due_date)
        except Exception:
            pass
    todo = await create_todo(db, title, priority, due)
    return {"todo": todo, "summary": f"Added task: '{title}' [{priority}]"}


@tool("get_calendar_events", "Get upcoming calendar events",
      {"days": "int — how many days ahead (default 7)"})
async def _get_calendar(days: int = 7, db=None) -> dict:
    from services.integrations_service import get_calendar_events
    events = await get_calendar_events(days)
    return {"events": events, "count": len(events),
            "summary": f"{len(events)} upcoming events in next {days} days"}


@tool("create_meeting", "Create a calendar event with optional Google Meet link",
      {"title": "string", "start": "ISO datetime", "end": "ISO datetime", "with_meet": "bool"})
async def _create_meeting(title: str, start: str, end: str, with_meet: bool = True, db=None) -> dict:
    from services.integrations_service import create_calendar_event
    result = await create_calendar_event(title, start, end, "", with_meet)
    meet = result.get("meet_link")
    summary = f"Created '{title}'" + (f" — Meet: {meet}" if meet else "")
    return {**result, "summary": summary}


# ══════════════════════════════════════════════════════
# NOTION TOOLS
# ══════════════════════════════════════════════════════

@tool("search_notion", "Search Notion pages",
      {"query": "string"})
async def _search_notion(query: str = "", db=None) -> dict:
    from services.integrations_service import get_notion_pages
    pages = await get_notion_pages(query)
    return {"pages": pages, "count": len(pages),
            "summary": f"Found {len(pages)} Notion pages"}


@tool("create_notion_note", "Create a new Notion page with content",
      {"title": "string", "content": "string"})
async def _create_notion(title: str, content: str, db=None) -> dict:
    from services.integrations_service import create_notion_page
    result = await create_notion_page(title, content)
    return {**result, "summary": f"Created Notion page: '{title}'"}


# ══════════════════════════════════════════════════════
# PROJECT TOOLS
# ══════════════════════════════════════════════════════

@tool("export_project", "Export project as a ZIP (tex + bib + pdf-ready)",
      {"project_id": "string"})
async def _export(project_id: str, db=None) -> dict:
    from tools.export_project import export_project, ExportProjectInput
    result = export_project(ExportProjectInput(project_id=project_id))
    return {**result, "summary": f"Project exported to {result.get('zip_path', 'unknown')}"}


@tool("get_project_stats", "Get citation stats for a project",
      {"project_id": "string"})
async def _get_stats(project_id: str, db=None) -> dict:
    from config import PROJECTS_DIR
    from services.citation_service import get_stats
    tex = PROJECTS_DIR / str(project_id) / "main.tex"
    bib = PROJECTS_DIR / str(project_id) / "references.bib"
    if not tex.exists():
        return {"error": "Project not found"}
    pid = int(project_id) if project_id.isdigit() else 0
    stats = await get_stats(db, pid, tex.read_text(), str(bib))
    return {**stats, "summary": f"{stats.get('total_citations', 0)} citations, {stats.get('verified', 0)} verified"}
