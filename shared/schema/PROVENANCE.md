# Schema provenance

One section per vendored major below; each sync replaces its own major's section in place.

## ocf-action-v1.json

`ocf-action-v1.json` is copied verbatim from the spec repo:
`opencoachingformat/spec` -> `schema/v1.json` @ `v1.4.0`.
Synced automatically by `.github/workflows/sync-from-spec.yml` on
2026-08-28T08:40:25Z from a `spec_released` dispatch event.
Re-sync deliberately; do not hand-edit.

## ocf-action-v2.json

`ocf-action-v2.json` is copied verbatim from the spec repo:
`opencoachingformat/spec` -> `schema/v2.json` @ `v2` branch commit
`1541ecb130783106b45e5ed49845ee636ae9e1a7` (2026-09-10), manually vendored on
2026-09-10 — v2 is still pre-release (no tagged `v2.x.x` spec release exists
yet), so `.github/workflows/sync-from-spec.yml` has never actually run for
this major; the copy that was here previously predated RFC 0007
(sport-required) and RFC 0012 (`court.ruleset` -> `court.court_profile`)
entirely. Once the spec repo cuts its first real `v2.x.x` release, the normal
`spec_released` dispatch flow takes over this section as usual.
Re-sync deliberately; do not hand-edit.
