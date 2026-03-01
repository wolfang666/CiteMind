# CiteMind v3 — Setup Guide

## Quick Start (2 terminals)

### Terminal 1 — Backend
```bat
cd CiteMind_v3\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```
Wait for: `Application startup complete`

### Terminal 2 — Frontend
```bat
cd CiteMind_v3\frontend
npm install
npm run dev
```
Open: **http://localhost:3000**

---

## What's in v3

### ✅ Fixed
- 500 errors on paper search — completely rewritten
- Papers library now searches 4 APIs simultaneously
- All tools wired up end-to-end

### 🆕 Features
| Feature | Details |
|---|---|
| 4-source paper search | CrossRef + Semantic Scholar + OpenAlex + arXiv — all free, no key |
| MCP Tool System | 15 tools callable by AI + directly from UI |
| Smart Notifications | Overdue tasks, upcoming meetings, tips |
| AI Copilot | Groq llama-3.3-70b — write, search, verify, chat |
| Calendar & Meet | View events, create with Meet link |
| Todo List | Priorities, due dates, per-project |
| Notion | Browse + create pages |
| LaTeX Editor | Monaco with syntax highlight |

---

## Environment Variables

```bat
set GROQ_API_KEY=gsk_...        # AI (already set in config.py)
set NOTION_TOKEN=secret_...      # Notion integration
set LLM_BACKEND=groq             # Force backend: groq|ollama|claude|mock
```

⚠️ Rotate your Groq key at https://console.groq.com — old key was shared.

---

## Troubleshooting

### "Request failed 500"
Delete the old database:
```bat
del CiteMind_v3\backend\data\citemind.db
```
Restart backend.

### Papers not loading
Check backend is running. The search goes to external APIs (CrossRef etc.) which need internet.

### KMP / OpenMP crash
```bat
set KMP_DUPLICATE_LIB_OK=TRUE
```

### pip conflicts
```bat
pip install fastapi uvicorn[standard] sqlalchemy aiosqlite pydantic httpx python-multipart sentence-transformers faiss-cpu bibtexparser numpy notion-client python-dateutil
```
