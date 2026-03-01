from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from db.database import init_db
from api.routes import router
from utils.logger import get_logger

log = get_logger("citemind-v3")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    from services.generation_service import get_llm_status
    from services.mcp_tools import list_tools
    s = get_llm_status()
    log.info(f"LLM: {s['backend'].upper()} | {s.get('groq_model','')}")
    log.info(f"Tools registered: {len(list_tools())}")
    log.info("Paper search: CrossRef + SemanticScholar + OpenAlex + arXiv")
    yield

app = FastAPI(title="CiteMind v3", version="3.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router, prefix="/api/v3")

@app.get("/")
async def root(): return {"service": "CiteMind v3", "docs": "/docs", "version": "3.0.0"}

@app.get("/health")
async def health():
    from services.generation_service import get_llm_status
    from services.integrations_service import get_integration_status
    from services.mcp_tools import list_tools
    return {"status": "ok", "llm": get_llm_status(),
            "integrations": get_integration_status(), "tools": len(list_tools())}
