import os
from pathlib import Path

BASE_DIR = Path(__file__).parent

try:
    from dotenv import load_dotenv
    load_dotenv(BASE_DIR / ".env", override=False)
except ImportError:
    pass

DATA_DIR     = BASE_DIR / "data"
PROJECTS_DIR = DATA_DIR / "projects"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR}/citemind.db"

# ── LLM ────────────────────────────────────────────────────────
GROQ_API_KEY  = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL    = os.getenv("GROQ_MODEL",   "llama-3.3-70b-versatile")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OLLAMA_URL    = os.getenv("OLLAMA_BASE_URL",   "http://localhost:11434")
OLLAMA_MODEL  = os.getenv("OLLAMA_MODEL",      "llama3.2:3b")
LLM_BACKEND   = os.getenv("LLM_BACKEND",       "auto")

# ── Google OAuth2 ───────────────────────────────────────────────
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID",     "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI",  "http://localhost:8000/api/v3/integrations/google/callback")

# ── Notion ──────────────────────────────────────────────────────
NOTION_TOKEN         = os.getenv("NOTION_TOKEN", "")          # legacy / manual token
NOTION_CLIENT_ID     = os.getenv("NOTION_CLIENT_ID",     "")
NOTION_CLIENT_SECRET = os.getenv("NOTION_CLIENT_SECRET", "")
NOTION_REDIRECT_URI  = os.getenv("NOTION_REDIRECT_URI",  "http://localhost:8000/api/v3/integrations/notion/callback")
NOTION_TOKEN_FILE    = DATA_DIR / "notion_token.json"

# ── Embeddings ──────────────────────────────────────────────────
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM   = 384
FAISS_INDEX     = DATA_DIR / "faiss.index"
FAISS_META      = DATA_DIR / "faiss_meta.json"