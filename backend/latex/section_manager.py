
from pathlib import Path
from .tex_parser import load_tex, split_sections, upsert_section


class SectionManager:
    def __init__(self, tex_path: str):
        self.path = Path(tex_path)
        self._content = load_tex(tex_path)

    def get(self, name: str) -> str:
        return split_sections(self._content).get(name, "")

    def upsert(self, name: str, body: str) -> None:
        """Replace section body in-place; all other content preserved."""
        self._content = upsert_section(self._content, name, body)
        self.path.write_text(self._content, encoding="utf-8")

    def delete(self, name: str) -> None:
        import re
        pattern = re.compile(
            r"\\(?:sub)*section\{" + re.escape(name) + r"\}.*?"
            r"(?=\\(?:sub)*section\{|\\end\{document\}|$)",
            re.DOTALL,
        )
        self._content = pattern.sub("", self._content)
        self.path.write_text(self._content, encoding="utf-8")

    def list_sections(self) -> list:
        return list(split_sections(self._content).keys())
