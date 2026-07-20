# 0001. Monorepo with a language-neutral `shared/` contract

## Status

Accepted (2026-06-03, design doc; ratified here retroactively as arc42
documentation was introduced 2026-07-20)

## Context

The OCF Validator must exist as both a TypeScript library (for
web/editor/renderer tooling) and a Python library (for Python-based
generation/analysis tooling). Both implementations must agree, code-for-code,
on what is valid, what errors mean, and what schema they validate against —
consumer tooling built against either language must get identical answers.

The risk of maintaining two independent codebases for the "same" validator is
well understood: error codes drift, message text diverges, one language gets
a bugfix the other doesn't, and nobody notices until a consumer hits a
mismatch in production.

## Decision

Use a single monorepo (`ocf-validator`) with:

- `shared/` — a language-neutral source of truth: the vendored JSON Schema,
  the error-code registry (`error-codes.json`), the named-position catalog,
  and the conformance fixture suite (`conformance/{valid,invalid,warn}/*` +
  `cases.json`).
- `packages/ts/` and `packages/py/` — two implementations that both load
  `shared/` directly (not a copy) and are tested against the same
  `shared/conformance/cases.json` in the same CI workflow (`ci.yml`).

TypeScript is built first as the lead reference implementation; Python is
then mirrored against the same conformance suite.

## Considered Alternatives

- **Separate repos per language.** Rejected: makes it easy for the schema,
  error codes, or fixtures to drift silently between repos, since there is no
  single CI run that can compare both at once.
- **Single implementation, cross-compiled or transpiled to the other
  language.** Rejected: no mature, low-maintenance TS↔Python transpilation
  exists for this kind of rule logic; would trade a manageable mirroring
  problem for a fragile toolchain dependency.
- **Shared logic via a common runtime (e.g. WASM module callable from both
  languages).** Rejected as premature complexity for v1 — adds a build/FFI
  layer for both ecosystems before there's evidence the mirroring approach is
  insufficient.

## Consequences

- **Positive:** Any drift between implementations becomes a CI failure via
  the shared conformance suite (`ci.yml`), not something caught later by a
  consumer or in code review.
- **Positive:** Schema and error-code changes are made once, in `shared/`,
  and both languages pick them up automatically at build/test time.
- **Negative:** Contributors must update (or at least run tests against)
  both packages when semantics change — there is no way to change behavior
  in only one language without CI catching the resulting conformance gap.
- **Negative:** The Python package intentionally does not mirror the TS
  package's internal file structure exactly (see arc42 §8.9) — this is a
  deliberate tradeoff (behavioral parity over structural parity), documented
  so it isn't mistaken for an oversight during review.
