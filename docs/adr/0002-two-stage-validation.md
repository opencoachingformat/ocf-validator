# 0002. Two-stage validation: schema (Level 0) before semantics (Level 1)

## Status

Accepted (2026-06-03, design doc; ratified here retroactively)

## Context

An OCF document can fail to be a valid document in two fundamentally
different ways: it can be **structurally** wrong (wrong types, missing
required fields, an action referencing a field it doesn't own, an unknown
enum value) or it can be structurally fine but **semantically** incoherent
(a pass from a player who isn't holding the ball, a branch pointing at a
frame that doesn't exist, an `end_state` that disagrees with the frame's own
actions).

Semantic rules (possession tracking, reference resolution, cross-frame
coherence) all assume a structurally well-formed document — e.g. possession
tracking assumes `balls[]` is actually an array of ball objects, not
whatever malformed shape schema validation would have caught. Running
semantic rules over structurally invalid data produces confusing, often
nonsensical cascades of errors (e.g. "ball X not found" when the real problem
is that `balls` itself failed schema validation).

## Decision

Split validation into two ordered levels:

- **Level 0 — Schema.** JSON Schema validation (AJV in TypeScript,
  `jsonschema` in Python) against `shared/schema/ocf-action-v1.json`. Runs
  first, always. If it produces any issue, the validator returns immediately
  with `SCHEMA_INVALID` issue(s) and Level 1 does not run.
  - A special case runs *before* generic schema errors: detecting the legacy
    geometric model (`entity_states`/`lines`) and returning a single targeted
    `MODEL_LEGACY` error instead of a cascade of schema failures from
    validating old-shaped data against the new schema.
- **Level 1 — Semantics.** Only reached when Level 0 is clean. Builds a
  per-frame ball-possession context and runs four rule groups: reference
  integrity, ball-possession consistency, cross-frame state coherence, and
  quality/rendering hints.

## Considered Alternatives

- **Run all rules together, schema and semantic, and let each produce
  whatever issues apply.** Rejected: guarantees confusing cascades whenever
  the document is structurally broken (a single missing field can trigger
  a "ball not found," "player not found," and "branch target missing" all
  from one root cause), which is actively unhelpful to the consumers (LLM
  generators, editors) this validator is designed to serve.
- **Merge schema and semantic checks into one custom hand-rolled
  validator (no JSON Schema library).** Rejected: reimplements JSON Schema
  semantics (required, enum, oneOf, additionalProperties) by hand, which is
  exactly what mature libraries like AJV and `jsonschema` already do
  correctly and are already available in both target ecosystems.

## Consequences

- **Positive:** Consumers always get a single, targeted root-cause style
  error for structurally broken documents rather than a wall of unrelated
  semantic noise.
- **Positive:** Semantic rule authors can assume schema-valid input — they
  never need to re-check types or required-field presence that Level 0
  already guarantees (see arc42 §8.3).
- **Negative:** A document can have both a structural issue in one part and
  a semantic issue in an unrelated part; only the structural issue will be
  reported on that validation pass. A consumer must fix-and-revalidate
  iteratively rather than getting the full issue list in one pass. This is
  an accepted tradeoff given the cascade-avoidance benefit.
