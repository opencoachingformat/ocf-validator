#!/usr/bin/env python3
"""Update shared/schema/PROVENANCE.md's section for one vendored schema major.

Used by .github/workflows/sync-from-spec.yml after vendoring a synced schema.
The file holds ONE "## ocf-action-vN.json" section per supported major, not a
growing log: each run REPLACES its own major's section in place (matched by
that heading through the next "## " heading or end of file), so the file
stays a fixed "current status per major" snapshot no matter how many syncs
have run. A naive append-only approach would leave every sync's block piled
on top of the last, with a repeated "# Schema provenance" heading and no way
to tell which block is current for a given major.
"""

import re
import sys
from datetime import datetime, timezone

PROVENANCE_PATH = "shared/schema/PROVENANCE.md"
DEFAULT_DOC = (
    "# Schema provenance\n\n"
    "One section per vendored major below; each sync replaces its own "
    "major's section in place.\n"
)


def build_section(major: str, version: str, synced_at: str) -> str:
    lines = [
        f"## ocf-action-{major}.json",
        "",
        f"`ocf-action-{major}.json` is copied verbatim from the spec repo:",
        "`opencoachingformat/spec` -> `schema/v1.json` (note: the spec repo's on-disk",
        "filename does not change across majors; only its content/`x-ocf-version` does",
        "— this workflow determines the ACTUAL major from content, not from that",
        f"filename) @ `{version}`.",
        "Synced automatically by `.github/workflows/sync-from-spec.yml` on",
        f"{synced_at} from a `spec_released` dispatch event.",
        "Re-sync deliberately; do not hand-edit.",
        "",
        "",
    ]
    return "\n".join(lines)


def update(doc: str, major: str, version: str, synced_at: str) -> str:
    section = build_section(major, version, synced_at)
    heading = f"## ocf-action-{major}.json"
    pattern = re.compile(rf"^{re.escape(heading)}\n.*?(?=^## |\Z)", re.DOTALL | re.MULTILINE)
    if pattern.search(doc):
        return pattern.sub(section, doc)
    if not doc.endswith("\n\n"):
        doc = doc.rstrip("\n") + "\n\n"
    return doc + section


def main() -> None:
    major, version = sys.argv[1], sys.argv[2]
    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        with open(PROVENANCE_PATH) as f:
            doc = f.read()
    except FileNotFoundError:
        doc = DEFAULT_DOC
    with open(PROVENANCE_PATH, "w") as f:
        f.write(update(doc, major, version, synced_at))


if __name__ == "__main__":
    main()
