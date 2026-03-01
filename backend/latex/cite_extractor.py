import re
from typing import List, Set

CITE_RE = re.compile(r"\\cite(?:\[.*?\])?\{([^}]+)\}")


def extract_cite_keys(content: str) -> List[str]:
    keys: List[str] = []
    for m in CITE_RE.finditer(content):
        for k in m.group(1).split(","):
            keys.append(k.strip())
    return keys


def unique_keys(content: str) -> Set[str]:
    return set(extract_cite_keys(content))
