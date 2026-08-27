# 0004. Operational requirements that make the schema auto-sync actually work

## Status

Accepted (the `sync-from-spec.yml` workflow from ADR-0003 was failing on every
release until these were in place; ratified here 2026-08-27 after the first
fully-autonomous sync, for spec v1.2.0).

## Context

ADR-0003 decided *what* the automated schema sync does (dispatch → fetch via
Contents API → diff → open a PR). It did **not** capture the operational
preconditions the workflow depends on. In practice the workflow failed at the
final "open pull request" step on every `spec_released` event for months —
the PR was never created and the vendored schema silently drifted (it had to be
synced by hand for spec 1.1.0). Three distinct, non-obvious requirements had to
be satisfied before the sync ran end-to-end autonomously (first proven for spec
v1.2.0).

## Decision

The auto-sync (`sync-from-spec.yml` + `create-pull-request`) requires all of:

1. **No persisted git credentials colliding with the PR-action's token.**
   `actions/checkout` persists an `Authorization` header in git config;
   `peter-evans/create-pull-request` adds its own. Two `Authorization` headers
   make the branch push fail with `remote: Duplicate header: "Authorization"`
   (HTTP 400). Fix: check out with `persist-credentials: false` and pass an
   explicit `token:` to `create-pull-request`.
2. **Repository Actions permission: "Read and write".** The default workflow
   token needs write to push the `auto/schema-sync-<version>` branch. This is a
   repo (and org) setting — `Settings → Actions → General → Workflow permissions`.
   If the org enforces read-only, the repo setting is greyed out and the org
   policy must be changed first.
3. **"Allow GitHub Actions to create and approve pull requests" enabled.**
   Separate from (2). Without it the branch pushes but the PR-creation API call
   fails with `GitHub Actions is not permitted to create or approve pull
   requests`. Enable under the same Actions settings.
4. **The sync must rebuild the committed browser bundle.** The vendored schema
   is embedded in `packages/ts/dist/browser/browser.js`, and `ci.yml` enforces
   the committed bundle is up to date (`git diff --exit-code -- dist/browser`).
   A schema-only sync therefore fails that check. The sync workflow runs
   `npm ci && npm run build` before opening the PR so `create-pull-request`
   captures the regenerated bundle alongside the schema and PROVENANCE.

## Consequences

- **Positive:** With all four in place, a spec release now produces a green,
  review-ready sync PR with zero manual steps (verified for v1.2.0: the PR was
  opened by `app/github-actions`, CI passed, only schema + PROVENANCE + bundle
  changed).
- **Negative / operational:** Requirements (2) and (3) are GitHub settings, not
  code — they live outside the repo and can be silently reverted by an org
  policy change, re-breaking the sync with no code diff to point at. Requirement
  (1)/(4) are in the workflow file and are covered by the fact that a failing
  sync is visible as a failed Actions run.
- Human review is still required before merging the sync PR (per ADR-0003); this
  ADR only concerns getting the PR *opened* automatically.

## References

- ADR-0003 (the sync decision this operationalizes).
- arc42 §11 R5 (documentation-drift risk, of which the ADR-0003 omission was an
  instance).
