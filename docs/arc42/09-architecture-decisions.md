# 9. Architecture Decisions

Significant, hard-to-reverse architectural decisions are recorded as
Architecture Decision Records (ADRs) in [`docs/adr/`](../adr/), following the
[MADR](https://adr.github.io/madr/) format (Context, Decision, Considered
Alternatives, Consequences).

| ADR | Decision |
|---|---|
| [ADR-0001](../adr/0001-monorepo-shared-contract.md) | Use a monorepo with a language-neutral `shared/` contract (schema, error codes, conformance fixtures) rather than separate repos per language or a cross-compiled single implementation. |
| [ADR-0002](../adr/0002-two-stage-validation.md) | Split validation into Level 0 (JSON Schema) and Level 1 (semantic rules), with Level 0 always short-circuiting Level 1 on failure, rather than running all checks together. |
| [ADR-0003](../adr/0003-automated-schema-sync.md) | Automate schema updates from the spec repo via `repository_dispatch` + the GitHub Contents API, always landing as a human-reviewed PR — never fetched at runtime, never auto-merged. |

New architecturally significant decisions (anything that would be costly to
reverse, or that future contributors would reasonably ask "why was it done
this way?") should be added as a new numbered ADR in `docs/adr/` and linked
here.
