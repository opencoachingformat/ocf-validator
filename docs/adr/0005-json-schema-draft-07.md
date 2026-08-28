# 0005. Stay on JSON Schema draft-07

## Status

Accepted (2026-08-28)

## Context

OCF's schema (`shared/schema/ocf-action-v1.json`, vendored from the spec)
declares `"$schema": "http://json-schema.org/draft-07/schema#"`, and both
reference validators pin draft-07: TypeScript uses the default `Ajv` import
(draft-07 mode, ajv 8.x) and Python uses `jsonschema`'s `Draft7Validator`. The
question recurs whether to move to a newer dialect (2019-09 / 2020-12), motivated
in particular by `$dynamicRef`/`$dynamicAnchor` and `unevaluatedProperties`.

What the schema actually uses today (measured): `$ref` (~123×), `if`/`then`
(6× each), `allOf`/`oneOf`/`anyOf`, `const` (26×), `patternProperties`,
`definitions`. It uses **zero** post-draft-07 keywords — no `$dynamicRef`,
`$dynamicAnchor`, `$recursiveRef`, `unevaluatedProperties`, or `prefixItems`.

What `$dynamicRef` solves is **late binding under recursion with extension**: a
generic recursive schema (tree/list) whose element type an extending schema
overrides, with the recursion carrying the override. OCF is not that shape:

- OCF documents are **flat-layered, not recursive**: `frames[] → actions[] →
  moves[]`, with no structure referencing itself at variable depth.
- OCF's variance is **conditional, not recursive**: "which actions a sport
  allows" is `if/then` on a `const` `sport` field (RFC 0003) — exactly what
  draft-07 `if/then` is for, and it works.
- Per-sport vocabularies (`sports/*.json`) are separate files composed via
  ordinary `$ref`/whitelist, not polymorphic recursion.

## Decision

Stay on **JSON Schema draft-07** for the v1 line.

Re-evaluate only when a concrete need for a post-07 feature appears (see
Consequences → triggers), not preemptively.

## Considered Alternatives

- **Move to 2020-12 for `$dynamicRef`.** Rejected: it addresses recursion-with-
  extension, which OCF does not have. It would add zero expressive power to the
  current schema while incurring migration cost.
- **Move to 2019-09/2020-12 for `unevaluatedProperties`.** Rejected for now:
  our field-strictness is already enforced by `additionalProperties: false`
  everywhere; `unevaluatedProperties` would only matter if we needed
  "base fields + exactly one sport extension, nothing else" expressed more
  strictly than today, which we do not.

## Consequences

- **Two-language conformance stays simple.** TS (`ajv`, draft-07 default) and
  Python (`Draft7Validator`) must stay byte-for-byte in agreement (ADR-0001).
  draft-07 has the most uniform, mature support across both; a dialect bump
  would have to be validated in both, where 2020-12 behavior/maturity differs.
- **No re-tuning of strict-mode balance.** 2019-09/2020-12 change *behavior*,
  not just add keywords: `additionalProperties` interacts with
  `unevaluatedProperties`, and in-place applicators (`allOf`/`if`) see evaluated
  properties differently. We rely on `additionalProperties: false` throughout
  and already carry two calibrated ajv exceptions (`strictSchema: false`,
  `strictRequired: false`, see `schema-level.ts`). A dialect bump would re-open
  that balance and risk regressing the invalid-fixture suite.
- **Maximum ecosystem consumability.** draft-07 is the most broadly supported
  dialect across editors, codegen, and language libraries — valuable for a
  published interchange format.
- **Re-evaluation triggers (when a bump would be justified):**
  1. A genuinely **recursive-polymorphic** feature — e.g. nested "play-in-play"
     composition where an embedded play must carry its own, stricter action
     vocabulary through the recursion. That is the canonical `$dynamicRef` case.
  2. A need for `unevaluatedProperties` to express "base + exactly-one-extension,
     nothing else" more strictly than `additionalProperties: false` allows.

  A major schema bump (v2) is the natural place to reconsider, since it already
  requires deliberate validator work.

## References

- ADR-0001 (monorepo shared contract), ADR-0002 (two-stage validation).
- Spec: `docs/specification-v1.adoc` (Design Principles — "Schema dialect")
  records the same decision for format consumers.
- RFC 0003 (Sport Scoping — the conditional, non-recursive variance model).
