import re
from pathlib import Path


def inject_cite(content: str, sentence: str, cite_key: str) -> str:
    """Append \\cite{key} after the first occurrence of sentence in content."""
    idx = content.find(sentence.strip())
    if idx == -1:
        return content
    end = idx + len(sentence.strip())
    return content[:end] + f" \\cite{{{cite_key}}}" + content[end:]


def append_to_section(tex_path: str, section_name: str, text: str) -> None:
    content = Path(tex_path).read_text(encoding="utf-8")
    marker = f"\\section{{{section_name}}}"
    idx = content.find(marker)
    if idx == -1:
        content += f"\n\\section{{{section_name}}}\n{text}\n"
    else:
        next_sec = content.find("\\section{", idx + len(marker))
        insert_at = next_sec if next_sec != -1 else len(content)
        content = content[:insert_at] + text + "\n" + content[insert_at:]
    Path(tex_path).write_text(content, encoding="utf-8")
