# 1. Introduction and Goals

## 1.1 Requirements Overview

The OCF Validator is the **reference implementation** for checking that an
[Open Coaching Format](https://github.com/opencoachingformat/spec) (OCF)
document is well-formed *and* semantically coherent.

An OCF document describes a basketball play as a sequence of frames: entities
(players, defense, cones, stations), balls with a possession lifecycle, and
per-frame actions (`move`, `cut`, `screen`, `defend`, `dribble`, `pass`,
`shoot`, `rebound`, `pickup`) with explicit `start_state` / `end_state` and
optional `branches` to alternate outcomes.

The validator serves two consumers:

1. **Authoring tools (LLM generators / editor):** need granular, actionable
   feedback — per-issue error codes, JSON-Pointer paths, structured data, and
   a severity split between blocking errors and non-blocking warnings — so a
   generator or human editor can locate and fix a problem.
2. **Rendering gate:** needs a single, reliable `valid` boolean guaranteeing
   that all references resolve and the document is safe to hand to a
   renderer without runtime crashes on missing entities/balls/frames.

## 1.2 Quality Goals

| Priority | Quality Goal | Motivation |
|---|---|---|
| 1 | **Correctness / conformance parity** | TypeScript and Python must agree, code-for-code, on every conformance fixture. A generator or editor built against one implementation must get identical answers from the other. |
| 2 | **Actionable feedback** | Every error/warning carries a stable code, a JSON-Pointer `path`, and structured `data` — not just a human sentence — so tooling can act on it, not just display it. |
| 3 | **Fail-safe schema gate** | Structural validation (Level 0) always runs before semantic rules (Level 1); semantic rules never run over structurally invalid data, avoiding cascades of meaningless errors. |
| 4 | **Deliberate, reviewable schema evolution** | The vendored schema copy only changes via an explicit, human-reviewed process (manual re-sync or the `sync-from-spec` PR workflow) — never silently, never auto-merged. |
| 5 | **Low integration friction** | Both packages ship the same CLI shape and the same JSON result shape; adding OCF validation to a new tool should be a few lines of code. |

## 1.3 Stakeholders

| Role | Expectations |
|---|---|
| Spec maintainers (`opencoachingformat/spec`) | Changes to the canonical schema eventually propagate here, reviewably, without requiring them to touch this repo. |
| Editor / LLM-generation tooling (companion repos: `ocf-editor`, generation pipelines) | Stable error-code contract to build UX (jump-to-error, auto-fix suggestions) against. |
| Renderer (companion repo: `ocf-renderer`) | A cheap, reliable pre-render gate (`result.valid`) so the renderer never has to defensively handle malformed documents. |
| Validator maintainers | A monorepo where both language implementations are provably kept in sync by CI, not by discipline alone. |
