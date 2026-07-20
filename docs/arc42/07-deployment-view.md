# 7. Deployment View

The OCF Validator is not a deployed service — it is distributed as **two
consumable packages** plus **CI automation**. There is no runtime server
component.

## 7.1 Distribution

| Package | Distribution mechanism | Consumers |
|---|---|---|
| `packages/ts` | npm package (`@ocf/validator`), used as a library import or via its `bin` entry (`npx @ocf/validator`) | Node/TS/web tooling: editor, renderer, generation pipelines written in TS |
| `packages/py` | Python package (`ocf_validator`), installed via `pip install -e .` in CI / `pip install ocf-validator` when published; console script `ocf-validate` | Python-based analysis/generation tooling |

Both are versioned and released independently per language ecosystem
convention (npm registry / PyPI), though kept in lockstep in practice since
they share `shared/` and CI enforces conformance parity on every commit.

## 7.2 CI/Automation Environment

| Workflow | Trigger | Runner | Purpose |
|---|---|---|---|
| `ci.yml` | `push`, `pull_request` (any branch) | `ubuntu-latest` (two parallel jobs: `ts`, `py`) | Builds and tests both packages against `shared/conformance`. This is the parity enforcement mechanism (§2, §4). |
| `sync-from-spec.yml` | `repository_dispatch` with type `spec_released`, carrying `client_payload.version` | `ubuntu-latest` | Fetches `schema/v1.json` from `opencoachingformat/spec` at the released ref via the GitHub Contents API, diffs it against the vendored copy, and — only if changed — opens a PR updating `shared/schema/ocf-action-v1.json` + `PROVENANCE.md`. Never merges automatically; `ci.yml` still gates the resulting PR. |

## 7.3 External Dependencies at Runtime (validation time)

None beyond the language runtime and the schema-validation library (AJV /
`jsonschema`) already bundled with each package. Validation is fully
offline-capable: the schema is vendored (§2), not fetched.

## 7.4 External Dependencies at CI/Sync time only

- **GitHub Contents API** (`repos/opencoachingformat/spec/contents/...`) —
  used exclusively by `sync-from-spec.yml`, authenticated via
  `secrets.SPEC_REPO_TOKEN` (falling back to `github.token`) if the spec repo
  requires elevated read access, or the default token otherwise.
- **`repository_dispatch` webhook** — the spec repo's release automation (or
  a maintainer manually) must send this event for the sync workflow to ever
  fire; there is no polling fallback.
