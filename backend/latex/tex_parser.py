"""
tex_parser.py — parse and rebuild LaTeX without destroying structure.

The key insight: upsert only replaces a section's BODY, keeping all
surrounding content (maketitle, abstract env, bibliography, etc.) intact.
"""
import re
from pathlib import Path
from typing import Dict


SECTION_RE = re.compile(
    r"(\\(?:sub)*section\{([^}]+)\})(.*?)(?=\\(?:sub)*section\{|\\end\{document\}|$)",
    re.DOTALL,
)


def load_tex(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def split_sections(content: str) -> Dict[str, str]:
    """Return {section_title: body_text}."""
    sections: Dict[str, str] = {}
    for m in SECTION_RE.finditer(content):
        title = m.group(2).strip()
        body = m.group(3).strip()
        sections[title] = body
    return sections


def get_preamble(content: str) -> str:
    """Everything before \\begin{document}."""
    match = re.search(r"\\begin\{document\}", content)
    return content[: match.start()] if match else ""


def upsert_section(content: str, section_name: str, new_body: str) -> str:
    """
    Replace the body of an existing section in-place.
    If section not found, append before \\end{document}.
    All other content (\\maketitle, \\begin{abstract}, \\bibliography) is preserved.
    """
    # Try to find and replace existing section
    pattern = re.compile(
        r"(\\(?:sub)*section\{" + re.escape(section_name) + r"\})(.*?)"
        r"(?=\\(?:sub)*section\{|\\end\{document\}|\\bibliography|$)",
        re.DOTALL,
    )
    match = pattern.search(content)
    if match:
        replacement = match.group(1) + "\n" + new_body.strip() + "\n\n"
        return content[: match.start()] + replacement + content[match.end():]

    # Section not found — insert before \end{document}
    end_match = re.search(r"\\end\{document\}", content)
    if end_match:
        insert = f"\n\\section{{{section_name}}}\n{new_body.strip()}\n\n"
        return content[: end_match.start()] + insert + content[end_match.start():]

    # No \end{document} — just append
    return content + f"\n\\section{{{section_name}}}\n{new_body.strip()}\n"


def rebuild_tex(preamble: str, sections: Dict[str, str]) -> str:
    """Rebuild from scratch (used only when SectionManager is doing full rebuild)."""
    body = "\n\n".join(
        f"\\section{{{title}}}\n{body}" for title, body in sections.items()
    )
    return f"{preamble}\n\\begin{{document}}\n{body}\n\\end{{document}}\n"
