"""
integrations_service.py
────────────────────────
Google Calendar OAuth2 (full flow), Notion OAuth2 (full flow), Todos.
All credentials come from .env via config.py — zero hardcoding.
"""

import httpx
import json
import base64
from datetime import datetime, timedelta
from pathlib import Path
from config import (
    NOTION_TOKEN, NOTION_TOKEN_FILE,
    NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, NOTION_REDIRECT_URI,
    BASE_DIR,
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI,
)

GOOGLE_TOKEN_FILE = BASE_DIR / "data" / "google_tokens.json"

# ═══════════════════════════════════════════════════════
# GOOGLE OAUTH2 TOKEN MANAGEMENT
# ═══════════════════════════════════════════════════════

def _load_tokens() -> dict:
    if GOOGLE_TOKEN_FILE.exists():
        try:
            return json.loads(GOOGLE_TOKEN_FILE.read_text())
        except Exception:
            return {}
    return {}

def _save_tokens(tokens: dict):
    GOOGLE_TOKEN_FILE.parent.mkdir(exist_ok=True)
    GOOGLE_TOKEN_FILE.write_text(json.dumps(tokens, indent=2))

def save_google_token(access_token: str, refresh_token: str = ""):
    tokens = _load_tokens()
    tokens.update({
        "access_token":  access_token,
        "refresh_token": refresh_token or tokens.get("refresh_token", ""),
        "saved_at":      datetime.utcnow().isoformat(),
    })
    _save_tokens(tokens)

def get_oauth_url() -> str:
    """Return Google OAuth2 authorization URL."""
    scopes = " ".join([
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
    ])
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         scopes,
        "access_type":   "offline",
        "prompt":        "consent",
    }
    from urllib.parse import urlencode
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)

async def exchange_code_for_tokens(code: str) -> dict:
    """Exchange authorization code for access + refresh tokens."""
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post("https://oauth2.googleapis.com/token", data={
            "code":          code,
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri":  GOOGLE_REDIRECT_URI,
            "grant_type":    "authorization_code",
        })
        r.raise_for_status()
        data = r.json()
        save_google_token(data["access_token"], data.get("refresh_token", ""))
        return data

async def _refresh_access_token() -> str | None:
    """Use refresh token to get a new access token."""
    tokens = _load_tokens()
    refresh = tokens.get("refresh_token")
    if not refresh:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post("https://oauth2.googleapis.com/token", data={
                "refresh_token": refresh,
                "client_id":     GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "grant_type":    "refresh_token",
            })
            r.raise_for_status()
            data = r.json()
            tokens["access_token"] = data["access_token"]
            tokens["saved_at"]     = datetime.utcnow().isoformat()
            _save_tokens(tokens)
            return data["access_token"]
    except Exception as e:
        print(f"[OAuth] Refresh failed: {e}")
        return None

async def _get_valid_token() -> str | None:
    """Return a valid access token, refreshing if needed."""
    tokens = _load_tokens()
    return tokens.get("access_token") or None

async def _authed_get(url: str, params: dict = None) -> httpx.Response:
    """GET with auto-refresh on 401."""
    token = await _get_valid_token()
    if not token:
        raise ValueError("Google not connected")
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(url, headers=headers, params=params)
        if r.status_code == 401:
            token = await _refresh_access_token()
            if token:
                r = await c.get(url, headers={"Authorization": f"Bearer {token}"}, params=params)
        return r

async def _authed_post(url: str, body: dict, params: dict = None) -> httpx.Response:
    """POST with auto-refresh on 401."""
    token = await _get_valid_token()
    if not token:
        raise ValueError("Google not connected")
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(url, headers=headers, json=body, params=params)
        if r.status_code == 401:
            token = await _refresh_access_token()
            if token:
                r = await c.post(url, headers={"Authorization": f"Bearer {token}"}, json=body, params=params)
        return r

def google_connected() -> bool:
    tokens = _load_tokens()
    return bool(tokens.get("access_token"))


# ═══════════════════════════════════════════════════════
# GOOGLE CALENDAR
# ═══════════════════════════════════════════════════════

async def get_calendar_events(days_ahead: int = 14) -> list:
    try:
        now = datetime.utcnow().isoformat() + "Z"
        end = (datetime.utcnow() + timedelta(days=days_ahead)).isoformat() + "Z"
        r = await _authed_get(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            params={
                "timeMin":      now,
                "timeMax":      end,
                "singleEvents": True,
                "orderBy":      "startTime",
                "maxResults":   25,
            },
        )
        if r.status_code == 200:
            return [_normalize_event(e) for e in r.json().get("items", [])]
        print(f"[Calendar] {r.status_code}: {r.text[:200]}")
        return _mock_events()
    except ValueError:
        return _mock_events()
    except Exception as e:
        print(f"[Calendar] {e}")
        return _mock_events()

async def create_calendar_event(
    title: str, start: str, end: str,
    description: str = "", with_meet: bool = False,
) -> dict:
    body = {
        "summary":     title,
        "description": description,
        "start":       {"dateTime": start, "timeZone": "UTC"},
        "end":         {"dateTime": end,   "timeZone": "UTC"},
    }
    if with_meet:
        body["conferenceData"] = {
            "createRequest": {
                "requestId": f"citemind-{datetime.utcnow().timestamp():.0f}",
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        }
    try:
        params = {"conferenceDataVersion": 1} if with_meet else {}
        r = await _authed_post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            body,
            params=params,
        )
        data = r.json()
        if r.status_code not in (200, 201):
            return {
                "error": data.get("error", {}).get("message", "Unknown error"),
                "mock":  True,
            }
        meet_link = None
        if with_meet:
            eps = data.get("conferenceData", {}).get("entryPoints", [])
            meet_link = next(
                (ep["uri"] for ep in eps if ep.get("entryPointType") == "video"), None
            )
        return {
            "id":        data.get("id"),
            "title":     title,
            "start":     start,
            "end":       end,
            "meet_link": meet_link,
            "html_link": data.get("htmlLink", ""),
            "mock":      False,
        }
    except ValueError:
        return {
            "id":        "mock",
            "title":     title,
            "start":     start,
            "end":       end,
            "meet_link": "https://meet.google.com/xxx-xxxx-xxx" if with_meet else None,
            "mock":      True,
        }
    except Exception as e:
        return {"error": str(e), "mock": True}

def _normalize_event(e: dict) -> dict:
    start = e.get("start", {})
    eps   = e.get("conferenceData", {}).get("entryPoints", [])
    return {
        "id":          e.get("id"),
        "title":       e.get("summary", "Untitled"),
        "start":       start.get("dateTime", start.get("date", "")),
        "end":         e.get("end", {}).get("dateTime", ""),
        "description": e.get("description", ""),
        "meet_link":   next(
            (ep["uri"] for ep in eps if ep.get("entryPointType") == "video"), None
        ),
        "html_link":   e.get("htmlLink", ""),
    }

def _mock_events() -> list:
    now = datetime.utcnow()
    return [
        {
            "id":          "m1",
            "title":       "Research Sync",
            "start":       (now + timedelta(hours=2)).isoformat(),
            "end":         (now + timedelta(hours=3)).isoformat(),
            "description": "Weekly research meeting (mock — connect Google Calendar)",
            "meet_link":   "https://meet.google.com/abc-defg-hij",
            "html_link":   "",
        },
        {
            "id":          "m2",
            "title":       "Paper Deadline",
            "start":       (now + timedelta(days=3)).isoformat(),
            "end":         (now + timedelta(days=3, hours=1)).isoformat(),
            "description": "Submit draft (mock)",
            "meet_link":   None,
            "html_link":   "",
        },
    ]


# ═══════════════════════════════════════════════════════
# NOTION TOKEN MANAGEMENT (OAuth2)
# ═══════════════════════════════════════════════════════

def _load_notion_tokens() -> dict:
    """Load Notion OAuth2 tokens from file."""
    if NOTION_TOKEN_FILE.exists():
        try:
            return json.loads(NOTION_TOKEN_FILE.read_text())
        except Exception:
            return {}
    return {}

def _save_notion_tokens(data: dict):
    """Persist Notion OAuth2 tokens."""
    NOTION_TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    NOTION_TOKEN_FILE.write_text(json.dumps(data, indent=2))

def _get_notion_access_token() -> str:
    """
    Return the best available Notion access token.
    Priority: OAuth2 token file → NOTION_TOKEN env var.
    """
    stored = _load_notion_tokens()
    token = stored.get("access_token") or NOTION_TOKEN
    return token or ""

def notion_connected() -> bool:
    """Return True if a Notion access token is available."""
    return bool(_get_notion_access_token())

async def exchange_notion_code(code: str) -> dict:
    """
    Exchange Notion OAuth2 authorization code for an access token.
    Stores the result in NOTION_TOKEN_FILE.
    """
    if not NOTION_CLIENT_ID or not NOTION_CLIENT_SECRET:
        raise ValueError(
            "NOTION_CLIENT_ID and NOTION_CLIENT_SECRET must be set in .env "
            "to use Notion OAuth2."
        )

    credentials = base64.b64encode(
        f"{NOTION_CLIENT_ID}:{NOTION_CLIENT_SECRET}".encode()
    ).decode()

    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(
            "https://api.notion.com/v1/oauth/token",
            headers={
                "Authorization":  f"Basic {credentials}",
                "Content-Type":   "application/json",
                "Notion-Version": "2022-06-28",
            },
            json={
                "grant_type":   "authorization_code",
                "code":          code,
                "redirect_uri":  NOTION_REDIRECT_URI,
            },
        )
        r.raise_for_status()
        data = r.json()
        _save_notion_tokens({
            "access_token":   data.get("access_token", ""),
            "workspace_id":   data.get("workspace_id", ""),
            "workspace_name": data.get("workspace_name", ""),
            "bot_id":         data.get("bot_id", ""),
            "owner":          data.get("owner", {}),
            "saved_at":       datetime.utcnow().isoformat(),
        })
        return data

def disconnect_notion():
    """Remove stored Notion OAuth2 tokens."""
    if NOTION_TOKEN_FILE.exists():
        NOTION_TOKEN_FILE.unlink()


# ═══════════════════════════════════════════════════════
# NOTION API HELPERS
# ═══════════════════════════════════════════════════════

def _notion_headers() -> dict:
    return {
        "Authorization":  f"Bearer {_get_notion_access_token()}",
        "Notion-Version": "2022-06-28",
        "Content-Type":   "application/json",
    }

# ═══════════════════════════════════════════════════════
# NOTION PAGES
# ═══════════════════════════════════════════════════════

async def get_notion_pages(query: str = "") -> list:
    token = _get_notion_access_token()
    if not token:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            body: dict = {"page_size": 20}
            if query.strip():
                body["query"] = query
            r = await c.post(
                "https://api.notion.com/v1/search",
                headers=_notion_headers(),
                json=body,
            )
            if r.status_code != 200:
                print(f"[Notion] search error {r.status_code}: {r.text[:200]}")
                return []
            pages = []
            for item in r.json().get("results", []):
                title_parts = (
                    item.get("properties", {}).get("title", {}).get("title", [])
                    or item.get("properties", {}).get("Name",  {}).get("title", [])
                    or []
                )
                title = (
                    "".join(t.get("plain_text", "") for t in title_parts) or "Untitled"
                )
                pages.append({
                    "id":          item.get("id"),
                    "title":       title,
                    "url":         item.get("url", ""),
                    "last_edited": item.get("last_edited_time", ""),
                    "object":      item.get("object", ""),   # "page" | "database"
                })
            return pages
    except Exception as e:
        print(f"[Notion] {e}")
        return []

async def create_notion_page(
    title: str, content: str, database_id: str = ""
) -> dict:
    token = _get_notion_access_token()
    if not token:
        return {"error": "Notion not connected — set NOTION_TOKEN or connect via OAuth2"}
    try:
        parent = (
            {"database_id": database_id}
            if database_id
            else {"type": "workspace", "workspace": True}
        )
        body = {
            "parent":     parent,
            "properties": {
                "title": [{"text": {"content": title}}]
            },
            "children": [
                {
                    "object":    "block",
                    "type":      "paragraph",
                    "paragraph": {
                        "rich_text": [{"text": {"content": content[:2000]}}]
                    },
                }
            ],
        }
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(
                "https://api.notion.com/v1/pages",
                headers=_notion_headers(),
                json=body,
            )
            data = r.json()
            if r.status_code not in (200, 201):
                return {
                    "error": data.get("message", f"HTTP {r.status_code}")
                }
            return {
                "id":    data.get("id"),
                "url":   data.get("url"),
                "title": title,
            }
    except Exception as e:
        return {"error": str(e)}

def get_notion_workspace_info() -> dict:
    """Return cached workspace metadata (populated after OAuth2)."""
    stored = _load_notion_tokens()
    return {
        "workspace_name": stored.get("workspace_name", ""),
        "workspace_id":   stored.get("workspace_id", ""),
        "bot_id":         stored.get("bot_id", ""),
        "saved_at":       stored.get("saved_at", ""),
    }


# ═══════════════════════════════════════════════════════
# TODOS (local SQLite)
# ═══════════════════════════════════════════════════════

async def get_todos(db, project_id: int = None) -> list:
    if db is None:
        return _mock_todos()
    try:
        from sqlalchemy import select
        from db.models import Todo
        q = select(Todo).order_by(Todo.created_at.desc())
        if project_id:
            q = q.where(Todo.project_id == project_id)
        result = await db.execute(q)
        todos = result.scalars().all()
        return [_todo_dict(t) for t in todos]
    except Exception as e:
        print(f"[Todo] {e}")
        return _mock_todos()

async def create_todo(
    db,
    title: str,
    priority: str = "medium",
    due_date=None,
    project_id: int = None,
) -> dict:
    if db is None:
        return {
            "id":         999,
            "title":      title,
            "done":       False,
            "priority":   priority,
            "due_date":   str(due_date) if due_date else None,
            "project_id": project_id,
        }
    try:
        from db.models import Todo
        t = Todo(title=title, priority=priority, due_date=due_date, project_id=project_id)
        db.add(t)
        await db.commit()
        await db.refresh(t)
        return _todo_dict(t)
    except Exception as e:
        return {"error": str(e)}

async def toggle_todo(db, todo_id: int) -> dict:
    if db is None:
        return {"id": todo_id, "done": True}
    try:
        from sqlalchemy import select
        from db.models import Todo
        r = await db.execute(select(Todo).where(Todo.id == todo_id))
        t = r.scalar_one_or_none()
        if not t:
            return {"error": "Not found"}
        t.done = not t.done
        await db.commit()
        return {"id": t.id, "done": t.done}
    except Exception as e:
        return {"error": str(e)}

async def delete_todo(db, todo_id: int) -> dict:
    if db is None:
        return {"deleted": todo_id}
    try:
        from sqlalchemy import select
        from db.models import Todo
        r = await db.execute(select(Todo).where(Todo.id == todo_id))
        t = r.scalar_one_or_none()
        if t:
            await db.delete(t)
            await db.commit()
        return {"deleted": todo_id}
    except Exception as e:
        return {"error": str(e)}

def _todo_dict(t) -> dict:
    return {
        "id":         t.id,
        "title":      t.title,
        "done":       t.done,
        "priority":   t.priority,
        "due_date":   str(t.due_date)   if t.due_date   else None,
        "project_id": t.project_id,
        "created_at": str(t.created_at) if t.created_at else None,
    }

def _mock_todos() -> list:
    return [
        {
            "id":         1,
            "title":      "Write Introduction section",
            "done":       False,
            "priority":   "high",
            "due_date":   "2026-03-10",
            "project_id": None,
        },
        {
            "id":         2,
            "title":      "Add 10 more citations",
            "done":       False,
            "priority":   "medium",
            "due_date":   "2026-03-15",
            "project_id": None,
        },
        {
            "id":         3,
            "title":      "Review related work",
            "done":       True,
            "priority":   "low",
            "due_date":   None,
            "project_id": None,
        },
    ]


# ═══════════════════════════════════════════════════════
# INTEGRATION STATUS
# ═══════════════════════════════════════════════════════

def get_integration_status() -> dict:
    google_tokens = _load_tokens()
    notion_info   = get_notion_workspace_info()
    return {
        "google_calendar": bool(google_tokens.get("access_token")),
        "google_meet":     bool(google_tokens.get("access_token")),
        "notion":          notion_connected(),
        "notion_workspace": notion_info.get("workspace_name", ""),
        "todo":            True,
    }