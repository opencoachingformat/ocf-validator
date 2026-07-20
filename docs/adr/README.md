# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) in
[MADR](https://adr.github.io/madr/) style for the OCF Validator. Each ADR
captures a single significant decision, the alternatives considered, and the
consequences.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-monorepo-shared-contract.md) | Monorepo with a language-neutral `shared/` contract | Accepted |
| [0002](0002-two-stage-validation.md) | Two-stage validation: schema (Level 0) before semantics (Level 1) | Accepted |
| [0003](0003-automated-schema-sync.md) | Automated, PR-only schema sync from the spec repo | Accepted |

New ADRs should follow the same template (Context, Decision, Considered
Alternatives, Consequences) and be added to this index.
