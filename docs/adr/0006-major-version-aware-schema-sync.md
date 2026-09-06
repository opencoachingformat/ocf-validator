# 0006. Make the schema auto-sync major-version-aware

## Status

Accepted (implemented in `sync-from-spec.yml`; ratified here 2026-09-06,
ahead of any real v2.0.0 spec release — see the trust gap noted below).

## Context

ADR-0003 and ADR-0004 describe an auto-sync workflow that fetches
`schema/v1.json` from the spec repo at a released ref and writes it to the
hardcoded path `shared/schema/ocf-action-v1.json`. That was safe as long as
the spec repo only ever published v1.x content.

Plan 3 (validator dual-version support) adds a second vendored schema,
`shared/schema/ocf-action-v2.json`, alongside the existing v1 file, plus a
parallel `v2/` rule module tree so this validator can validate both major
versions side by side. The spec repo's schema file, however, stays named
`schema/v1.json` **on disk** even once its *content* becomes v2.0.0 —
filename and `x-ocf-version` are independent in that repo (confirmed while
building Plans 1-2 there). Left unfixed, the very next `spec_released`
dispatch after the spec repo's first real v2.0.0 tag would fetch v2 content
under the old v1-shaped filename and the old hardcoded-path sync logic would
silently overwrite `ocf-action-v1.json` with it — destroying this validator's
v1 support in a single automated, unreviewed-until-merge PR.

## Decision

`sync-from-spec.yml` now determines which major a fetched schema actually is
from the fetched content's own `x-ocf-version` field (never from the spec
repo's on-disk filename) and routes it accordingly:

1. A new **"Determine fetched schema's actual major version"** step reads
   `x-ocf-version` out of the downloaded JSON and derives `vN`. If `vN` is
   neither `v1` nor `v2`, the step prints `::error::` and exits 1 — the job
   stops there, before any file is written or PR opened.
2. **"Diff against vendored copy"** resolves its diff target dynamically as
   `shared/schema/ocf-action-${MAJOR}.json` instead of the old hardcoded
   `ocf-action-v1.json`. A missing target (the first-ever sync of a brand
   new major) is treated as "changed," so it gets created rather than
   erroring on a nonexistent diff.
3. **"Update vendored schema + provenance"** writes only to the resolved
   `$TARGET` path — the other major's vendored file is never touched in that
   run. `PROVENANCE.md` moved from overwrite (`>`) to append (`>>`), since
   with two vendored schemas the file now needs to accumulate one
   provenance entry per major over time instead of each sync erasing the
   other major's note.
4. **"Open pull request"**'s `commit-message`, `title`, `body`, and `branch`
   all now include the resolved major (e.g. `auto/schema-sync-v2-2.0.0` vs
   `auto/schema-sync-v1-1.5.0`), so two syncs for different majors landing
   close together never collide on the same branch, and a reviewer can tell
   at a glance which major a given sync PR touches. The body also states
   explicitly which vendored file was updated and that the other major's
   file was left untouched.

## Trust gap: the first real v2.0.0 sync must be watched manually

This change could not be end-to-end tested against a real `spec_released`
dispatch for a v2.0.0 release, because no such release has shipped yet from
the spec repo (Plans 1-2 are the spec-repo work that has to land and tag
v2.0.0 first — outside this repo's scope). Everything above was verified by
manually tracing the workflow logic for a v1 fetch, a v2 fetch, and an
unsupported-major (e.g. v3) fetch, plus validating the resulting YAML
parses, but not by observing an actual Actions run.

Per the same "verify autonomy incrementally, don't assume it" lesson as
ADR-0004 (which found the *original* v1-only sync silently failing for
months before its operational gaps were found): **the first real v2.0.0
sync must be watched manually, end to end**, before subsequent v2.x syncs
are trusted to run unattended the way v1.x syncs already do:

- Watch the workflow run itself complete successfully (the new
  `fetched-major` step correctly resolves `v2`, the `diff` step correctly
  targets `ocf-action-v2.json`).
- Review the resulting PR's file list and confirm `ocf-action-v1.json` does
  **not** appear in it — this is the single most important check, since a
  regression here is exactly the failure mode this ADR exists to prevent.
- Confirm `PROVENANCE.md`'s diff is an appended entry, not a wholesale
  replacement of the existing v1 entry.

Once that first v2.0.0 sync has been observed clean, v2.x syncs can be
trusted the same way v1.x syncs are today.

## Consequences

- **Positive:** A v2.0.0 (or later v2.x) spec release can no longer
  silently clobber the vendored v1 schema; an unrecognized future major
  (v3+) fails the workflow loudly instead of being mis-filed.
- **Positive:** `PROVENANCE.md` now carries a durable history of every
  major's sync provenance instead of only ever reflecting the most recent
  sync of whichever major landed last.
- **Negative / residual risk:** This is code-level, trace-verified
  correctness, not yet run-verified. Until the first real v2.0.0 dispatch
  fires, there is a residual (small) risk of an untested edge case in the
  new steps — the manual-watch requirement above exists specifically to
  catch that before trust is extended to unattended v2.x syncs.
- Everything ADR-0003 and ADR-0004 already established (Contents API fetch,
  human review gate before merge, the four operational preconditions) is
  unchanged and still applies per major.

## References

- ADR-0003 (the original sync decision).
- ADR-0004 (the "don't assume autonomy, verify it" precedent this ADR's
  trust-gap section follows).
- Plan 3, Task 17 (`docs/plans/2026-09-05-frameless-action-model-plan3-validator-dual-version.md`),
  the task that motivated this change.
