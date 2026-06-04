from dataclasses import dataclass, field
from typing import Any, Literal

Severity = Literal["error", "warning"]


@dataclass
class Issue:
    code: str
    severity: Severity
    message: str
    path: str
    frame: str | None = None
    spec_ref: str | None = None
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class Result:
    valid: bool
    errors: list[Issue]
    warnings: list[Issue]
    summary: dict[str, int]
