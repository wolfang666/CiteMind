
import httpx
from config import (GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL,
                    ANTHROPIC_KEY, OLLAMA_URL, OLLAMA_MODEL, LLM_BACKEND)

def _backend() -> str:
    if LLM_BACKEND != "auto": return LLM_BACKEND
    if GROQ_API_KEY: return "groq"
    if ANTHROPIC_KEY: return "claude"
    return "mock"

async def _groq(messages: list, max_tokens: int = 1500) -> str:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{GROQ_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={"model": GROQ_MODEL, "messages": messages, "max_tokens": max_tokens, "temperature": 0.7})
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()

async def _call(prompt: str, system: str = "", context_items: list = None) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    # Inject calendar/notion context if provided
    if context_items:
        ctx_str = "\n".join(f"- {item}" for item in context_items[:8])
        messages.append({"role": "system", "content": f"User context:\n{ctx_str}"})
    messages.append({"role": "user", "content": prompt})
    b = _backend()
    if b == "groq" and GROQ_API_KEY:
        try: return await _groq(messages)
        except Exception as e: print(f"[Groq] {e}")
    if b == "claude" and ANTHROPIC_KEY:
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.post("https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": "claude-3-5-haiku-20241022", "max_tokens": 1500,
                          "system": system or "You are a helpful assistant.",
                          "messages": [{"role": "user", "content": prompt}]})
                r.raise_for_status()
                return r.json()["content"][0]["text"]
        except Exception as e: print(f"[Claude] {e}")
    return _mock(prompt)

LATEX_SYS = ("You are an expert academic LaTeX writer. Return ONLY valid LaTeX body — "
             "no \\documentclass, no \\begin{document}, no \\section wrapper. "
             "Use proper LaTeX: equations $...$, \\begin{itemize}, \\cite{key}.")

MOCK = {
    "abstract": r"This paper presents a comprehensive investigation. We demonstrate effectiveness through rigorous evaluation, achieving significant improvements over baselines.",
    "introduction": r"Recent advances have created new opportunities \cite{related2023}.\n\n\\begin{itemize}\n  \\item Novel framework improving performance\n  \\item Efficient $\\mathcal{O}(n\\log n)$ algorithm\n\\end{itemize}",
    "methodology": r"\\subsection{Formulation}\nGiven $\\mathcal{D}=\\{(x_i,y_i)\\}$, we minimize:\n\\begin{equation}\\mathcal{L}(\\theta)=\\mathbb{E}[\\ell(f_\\theta(x),y)]\\end{equation}",
    "conclusion": r"We presented a novel approach advancing state of the art while remaining computationally efficient.",
}
def _mock(p: str) -> str:
    pl = p.lower()
    for k, v in MOCK.items():
        if k in pl: return v
    return "This section presents key research findings.\n\n% [Mock mode — set GROQ_API_KEY in .env]"

async def generate_latex_section(section_name: str, context: str, instructions: str = "",
                                  calendar_ctx: list = None, notion_ctx: list = None) -> str:
    ctx_items = []
    if calendar_ctx: ctx_items += [f"Calendar: {e}" for e in calendar_ctx[:3]]
    if notion_ctx:   ctx_items += [f"Notion: {p}" for p in notion_ctx[:3]]
    return await _call(
        f"Write the '{section_name}' section for a research paper.\n"
        f"Topic/context: {context}\n"
        f"{'Instructions: '+instructions if instructions else ''}\n"
        f"Return only the LaTeX body:",
        LATEX_SYS, ctx_items or None
    )

async def edit_latex_text(original: str, instruction: str) -> str:
    r = await _call(f"Edit this LaTeX per the instruction. Return ONLY the edited LaTeX.\n\nOriginal:\n{original}\n\nInstruction: {instruction}",
                    "You are a LaTeX editor. Return only the edited LaTeX.")
    return r if r and len(r) > 10 else original

async def generate_bibtex(title: str, authors: str, year: str, doi: str = "") -> str:
    from utils.helpers import slugify
    last = (authors.split(",")[0].strip().split()[-1] if authors.strip() else "Author")
    key = slugify(f"{last}{year}_{(title.split()[0] if title.split() else 'paper')}")[:25]
    r = await _call(f"Generate BibTeX @article entry.\nTitle: {title}\nAuthors: {authors}\nYear: {year}\nDOI: {doi}\nCite key: {key}\nReturn ONLY the BibTeX:")
    return r if ("@article" in r or "@inproceedings" in r) else (
        f"@article{{{key},\n  title={{{title}}},\n  author={{{authors}}},\n  year={{{year}}},\n  doi={{{doi}}}\n}}\n"
    )

async def chat_response(message: str, context: str = "", tools_context: str = "",
                         calendar_items: list = None, notion_items: list = None) -> str:
    ctx_items = []
    if calendar_items: ctx_items += [f"Upcoming: {e['title']} on {e.get('start','')[:10]}" for e in calendar_items[:3]]
    if notion_items:   ctx_items += [f"Notion page: {p['title']}" for p in notion_items[:3]]
    system = (
        "You are CiteMind AI Copilot — expert academic writing assistant. "
        "You help write LaTeX papers, manage citations, find papers, organize research. "
        "Be concise and precise. When you suggest LaTeX, format it properly."
    )
    prompt = ""
    if context: prompt += f"Project: {context}\n"
    if tools_context: prompt += f"Available tools: {tools_context}\n"
    prompt += f"\nUser: {message}"
    return await _call(prompt, system, ctx_items or None)

def get_llm_status() -> dict:
    return {"backend": _backend(), "groq_key_set": bool(GROQ_API_KEY),
            "groq_model": GROQ_MODEL, "claude_key_set": bool(ANTHROPIC_KEY)}
