import json
import re
from pathlib import Path

from .types import Issue

_REGISTRY = json.loads(
    (Path(__file__).resolve().parents[3] / "shared" / "error-codes.json").read_text()
)


def _fill(template: str, data: dict) -> str:
    def repl(m):
        k = m.group(1)
        v = data.get(k, None)
        return str(v) if v is not None else m.group(0)

    return re.sub(r"\{(\w+)\}", repl, template)


def make_issue(
    code: str,
    path: str,
    data: dict | None = None,
    frame: str | None = None,
) -> Issue:
    data = data or {}
    d = _REGISTRY[code]
    return Issue(
        code=code,
        severity=d["severity"],
        message=_fill(d["message"], data),
        path=path,
        frame=frame,
        spec_ref=d.get("spec_ref"),
        data=data,
    )
