# 0003. Automated, PR-only schema sync from the spec repo

## Status

Accepted (introduced with `.github/workflows/sync-from-spec.yml`; ratified
here 2026-07-20)

## Context

`shared/schema/ocf-action-v1.json` is a vendored copy of
`opencoachingformat/spec`'s `schema/v1.json` (see ADR-0001, constraint: no
runtime dependency on the spec repo). The spec repo evolves independently and
periodically cuts releases; this validator must eventually pick up those
schema changes, but schema changes can be either purely additive (safe) or
breaking (e.g. new `required` fields, removed enum values) in ways that may
require matching validator/rule changes.

The spec repo has GitHub Pages disabled, so a Pages URL cannot be relied on
as a stable fetch source for the schema at a given release.

## Decision

- The spec repo (or its release automation) sends a `repository_dispatch`
  event of type `spec_released` with `client_payload.version` to this repo.
- `sync-from-spec.yml` resolves the version from the payload (failing loudly
  if empty — refuses to sync against an ambiguous ref), fetches
  `schema/v1.json` at that exact ref via the **GitHub Contents API**
  (`repos/opencoachingformat/spec/contents/schema/v1.json?ref=$VERSION`) —
  not a Pages URL — so the fetch works regardless of whether Pages is ever
  enabled, and fails loudly (404) rather than silently vendoring an HTML
  error page as "schema."
- The downloaded content is sanity-checked as valid JSON before anything is
  written.
- The file is diffed against the current vendored copy; if unchanged, the
  workflow stops without opening a PR (avoids PR noise for no-op syncs).
- If changed, the workflow overwrites `shared/schema/ocf-action-v1.json`,
  rewrites `shared/schema/PROVENANCE.md` with the new source ref and sync
  timestamp, and opens a pull request (branch `auto/schema-sync-<version>`,
  no auto-merge).
- The existing `ci.yml` workflow runs schema + conformance tests against the
  updated file as part of that PR — a human must review the schema diff
  (particularly new `required` fields or removed enum values) and confirm CI
  is green before merging.

## Considered Alternatives

- **Manual-only sync** (a maintainer periodically re-copies the schema file
  by hand). Rejected as the sole mechanism: relies on someone remembering to
  check for spec releases; schema drift could go unnoticed for a long time.
  (Manual sync remains possible as a fallback — the automation doesn't
  preclude it.)
- **Auto-merge the sync PR if CI passes.** Rejected: CI passing only proves
  existing conformance fixtures still pass — it cannot prove that new schema
  fields/enums are semantically *handled* (e.g. a new required field with no
  corresponding rule support). A human review step is required specifically
  to judge whether the diff needs accompanying validator changes, not just
  whether old tests still pass.
- **Poll the spec repo on a schedule instead of `repository_dispatch`.**
  Rejected: requires this repo to guess a polling interval and adds
  unnecessary API calls; an event-driven push from the spec repo's release
  process is more precise and immediate, at the cost of depending on that
  repo actually sending the dispatch (a coupling accepted as reasonable
  given both repos are part of the same project).
- **Fetch via GitHub Pages URL.** Rejected outright: Pages is disabled on the
  spec repo (`has_pages: false`), and even if enabled later, a 404 there
  could silently resolve to a rendered "not found" HTML page being vendored
  as if it were the schema — the Contents API fails explicitly instead.

## Consequences

- **Positive:** Schema updates require zero manual fetching/copying by a
  maintainer — the PR shows up with the diff ready to review.
- **Positive:** No update is ever silently applied; `ci.yml` plus mandatory
  human review remain the gate for every schema change, satisfying the
  "deliberate schema evolution" constraint (arc42 §2).
- **Positive:** Fails loudly and specifically at each failure point (missing
  version, invalid JSON, 404 from the Contents API) rather than degrading
  into a confusing downstream failure.
- **Negative:** Entirely dependent on the spec repo actually sending the
  `repository_dispatch` event — there is no fallback poll, so a missed or
  misconfigured dispatch means schema drift goes unnoticed until someone
  checks manually (tracked as risk R3 in arc42 §11, along with the related
  gap of no duplicate-PR detection if multiple releases fire before the
  first sync PR is merged).
