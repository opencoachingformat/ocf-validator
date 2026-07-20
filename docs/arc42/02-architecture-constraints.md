# 2. Architecture Constraints

| Constraint | Description |
|---|---|
| **Two target languages: TypeScript and Python** | The validator must exist as both a Node/TypeScript library and a Python library/CLI, because consumer tooling in this ecosystem is split across both (editor/renderer are TS/web-based; some generation/analysis tooling is Python-based). |
| **Schema is vendored, not fetched at runtime** | `shared/schema/ocf-action-v1.json` is a committed copy of the spec repo's `schema/v1.json`, not a live fetch. Validation must work fully offline/air-gapped and must not depend on `opencoachingformat/spec` availability at validation time. |
| **Single source of truth in `shared/`** | Error codes, the JSON Schema, and conformance fixtures are language-neutral JSON under `shared/`. Neither language package may hardcode a divergent copy of these. |
| **No auto-merge of upstream schema changes** | Schema updates from the spec repo must always land as a human-reviewed pull request. This is a hard constraint, not a preference — schema changes can silently break semantic rule assumptions (e.g. new `required` fields, removed enum values). |
| **Schema failures short-circuit semantic checks** | If Level 0 (JSON Schema) validation fails, Level 1 (semantic rules) must not run. Running semantic logic against structurally invalid data produces meaningless, confusing cascades of errors. |
| **CI is the parity enforcement mechanism** | There is no manual/procedural process for keeping TS and Python in sync — `ci.yml` runs both packages against the exact same `shared/conformance` fixtures on every push, and a mismatch is a CI failure, not a code review nit. |
| **GitHub Actions as the automation platform** | Both CI and schema-sync automation run on GitHub Actions (`ubuntu-latest`), using `GITHUB_TOKEN`/`secrets` semantics and `repository_dispatch` for cross-repo triggering — no external CI system. |
