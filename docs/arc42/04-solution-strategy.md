# 4. Solution Strategy

| Goal | Strategy |
|---|---|
| Conformance parity between TS and Python (Quality Goal 1) | **Monorepo with a language-neutral `shared/` contract** (schema, error-code registry, conformance fixtures) that both packages import unchanged. See [ADR-0001](../adr/0001-monorepo-shared-contract.md). |
| Actionable feedback (Quality Goal 2) | A single, language-neutral **result format** (`{valid, errors[], warnings[]}`, each issue carrying `code`, `severity`, `message`, `path`, `data`) defined once and mirrored in both languages — never ad hoc per-rule return shapes. |
| Fail-safe schema gate (Quality Goal 3) | **Two-stage validation pipeline**: Level 0 (JSON Schema via AJV / `jsonschema`) always runs first and short-circuits Level 1 (semantic rules) on failure. See [ADR-0002](../adr/0002-two-stage-validation.md). |
| Deliberate schema evolution (Quality Goal 4) | The vendored schema is **never fetched at validation time**. Updates only happen through an explicit, reviewed PR — either a manual re-sync or the automated `sync-from-spec.yml` workflow, which itself only opens a PR and never auto-merges. See [ADR-0003](../adr/0003-automated-schema-sync.md). |
| Low integration friction (Quality Goal 5) | Both packages expose the **same CLI shape** (`ocf-validate [--json] [--quiet] [--strict]`) and the same library entry points (`validate`, `validate_file`), so switching consumer tooling between languages requires no conceptual relearning. |
| Parity enforcement without manual discipline | `ci.yml` runs both packages' test suites against `shared/conformance/cases.json` on every push — drift between implementations is a **CI failure**, not something that has to be caught in review. |

## Key technology choices

- **AJV** (TypeScript) and **`jsonschema`** (Python) for Level-0 schema validation — both are mature, widely-used JSON Schema engines for their respective ecosystem, avoiding a hand-rolled schema validator.
- **`tsup`** for TS build (ESM + `.d.ts` output), **`vitest`** for TS tests, **`click`** for the Python CLI, **`pytest`** for Python tests — standard, low-maintenance tooling per ecosystem rather than a shared build system across languages.
- **GitHub Actions** for both CI and schema-sync automation, using `repository_dispatch` + the GitHub Contents API rather than GitHub Pages (disabled on the spec repo) or a scheduled poll.
