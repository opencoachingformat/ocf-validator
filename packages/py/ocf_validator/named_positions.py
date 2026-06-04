import json
from pathlib import Path
from typing import Any

# Canonical OCF named positions come from the spec catalog (language-neutral
# data in shared/named-positions.json), NOT from the JSON schema. Mirrors the
# TS implementation, which loads the same JSON file.
_CATALOG = json.loads(
    (Path(__file__).resolve().parents[3] / "shared" / "named-positions.json").read_text()
)

CANONICAL_NAMED: set[str] = set(_CATALOG["positions"])


def known_named(doc: dict[str, Any]) -> set[str]:
    result = set(CANONICAL_NAMED)
    np = doc.get("named_positions") or {}
    custom = np.get("custom") if isinstance(np, dict) else None
    if isinstance(custom, dict):
        for name in custom.keys():
            result.add(name)
    return result
