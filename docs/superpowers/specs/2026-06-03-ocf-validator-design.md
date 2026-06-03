# OCF Validator — Design

**Status:** Approved (brainstorming complete)
**Date:** 2026-06-03
**Model target:** OCF semantic action model (`schema/v1.json` as merged in
`opencoachingformat/spec` PR #3, commit `5e18b5d`).

---

## 1. Purpose

The OCF Validator is the **reference implementation** for checking that an Open
Coaching Format document is well-formed *and* semantically coherent. It serves
two consumers:

1. **Authoring (LLM / Editor):** granular, actionable feedback — per-issue
   codes, JSON-Pointer paths, structured data, and a severity split between
   blocking errors and non-blocking warnings — so a generator or editor can
   locate and fix problems.
2. **Rendering gate:** a single, reliable `valid` boolean guaranteeing that all
   references resolve and the document is safe to render.

It validates against the **new semantic action model** (`balls[]` lifecycle,
`actions`, `start_state`/`end_state`, `branches`), which is now canonical on
`origin/main` of the spec repo. The superseded geometric model
(`entity_states`, `lines`) is explicitly rejected (see §4, `MODEL_LEGACY`).

Non-goals (separate companion repos, per the spec roadmap): the renderer, the
editor, LLM generation.

---

## 2. Architecture & Repo Layout

A **monorepo** with a single language-neutral source of truth in `shared/`, and
two reference implementations that are two renderings of the same contract.

```
ocf-validator/
├── shared/                       # language-neutral — the reference truth
│   ├── conformance/
│   │   ├── valid/*.ocf.json
│   │   ├── invalid/*.ocf.json
│   │   └── cases.json            # fixture → expected {code, severity}[]
│   ├── error-codes.json          # code → {severity, category, message, spec_ref}
│   └── schema/
│       └── ocf-action-v1.json    # copy of spec repo schema/v1.json (provenance noted)
├── packages/
│   ├── ts/                       # reference (built first)
│   │   ├── src/                  # validate(), rules, CLI
│   │   └── test/                 # loads shared/conformance
│   └── py/                       # mirrored against the same suite
│       ├── ocf_validator/
│       └── tests/
├── README.md
├── LICENSE
└── .github/workflows/ci.yml      # runs BOTH packages against shared/conformance
```

**Core idea:** `shared/` is the contract. Error codes, the model schema, and the
conformance fixtures live as language-neutral JSON. TS and Python import the
*same* error-code registry and run against the *same* fixtures in CI. If either
implementation drifts, CI goes red.

**Schema provenance:** `shared/schema/ocf-action-v1.json` is a copy of the spec
repo's `schema/v1.json` at commit `5e18b5d`. A header comment records the source
commit so the copy can be re-synced deliberately rather than guessed.

**Build order:** TypeScript first as the lead reference implementation (rules,
error codes, conformance suite), then Python mirrored against the same suite.

---

## 3. Validation Pipeline

Two levels, run in order.

### Level 0 — Schema (delegated)

The document is first validated against the JSON Schema (AJV in TS,
`jsonschema` in Python). If schema validation fails, the validator **stops
here** — semantic rules over structurally broken data are meaningless. Schema
failures are translated into the common result format (code `SCHEMA_INVALID`,
carrying the schema engine's instance path).

A document using the legacy geometric model (`entity_states` / `lines`) is
detected *before* generic schema errors and rejected with a single targeted
`MODEL_LEGACY` error rather than a cascade of cryptic schema failures.

### Level 1 — Semantics

Runs only when Level 0 is clean. Rules are grouped A–D below. The semantic
engine carries a **per-frame ball-possession state** (who carries which ball,
where loose balls rest) threaded through the frame sequence.

---

## 4. Semantic Rules

### A) Reference integrity (errors — blocking)

| Code | Rule |
|---|---|
| `REF_ENTITY_UNKNOWN` | Every `from` / `to` / `carried_by` / `start_state` key / `end_state` key refers to an entity declared in `entities`. |
| `REF_BALL_UNKNOWN` | Every `ball_id` (in an action or ball state) exists in `balls[]`. |
| `REF_BRANCH_TARGET_UNKNOWN` | Every `branches[].to` points at an existing `frame.id`. |
| `REF_NAMED_POS_UNKNOWN` | Every `{named: …}` coordinate is a known position (schema registry or document `named_positions`). |

### B) Ball-possession consistency (the core)

The validator tracks ball possession per frame and checks each ball-dependent
action against it.

| Code | Severity | Rule |
|---|---|---|
| `BALL_CARRIER_MISMATCH` | **error** | `pass` / `shoot` / `dribble`: the `from` player must currently carry the referenced ball. |
| `BALL_NOT_AT_LOCATION` | **error** | `pickup` / `rebound`: a ball must be `at` a reachable location (or rebounding off the rim) at the pickup point. |
| `BALL_AMBIGUOUS` | **error** | Action omits `ball_id` while more than one ball is in play → auto-selection impossible. |
| `ACTION_UNUSUAL_CARRIER` | **warning** | A defense player performs `pass` / `shoot` etc. — convention, not a hard rule (legitimate exceptions exist). |

### C) Cross-frame state coherence

`end_state` checking is **pragmatic in v1**: it compares `end_state` only
against actions with an explicit endpoint (`to_player`, an explicit `to`
coordinate, or the basket). Variant moves without a `to` (e.g. a `speed` move)
are **skipped, not guessed** — geometric interpolation is an open question in
the model design (§13) and guessing risks false positives.

| Code | Severity | Rule |
|---|---|---|
| `END_STATE_DISAGREE` | **error** | `end_state` must agree with the explicit endpoints of the frame's actions. |
| `START_STATE_DISCONTINUITY` | **warning** | Frame N+1 `start_state` differs from frame N `end_state` without explanation. |

> Note: the schema makes `end_state` **required on every frame**, so a separate
> "branch frame must have end_state" rule is redundant and is **not**
> implemented — the schema already enforces it (`SCHEMA_INVALID`).

### D) Quality / rendering hints (warnings)

| Code | Severity | Rule |
|---|---|---|
| `CONTRAST_LOW` | **warning** | `color_scheme` contrast below 4.5:1 (spec §780, WCAG). |
| `ENTITY_OFFCOURT` | **warning** | A coordinate lies outside the court dimensions of the `ruleset`. |
| `EMPTY_FRAME` | **warning** | A frame with no actions and no state change. |

### Model gate

| Code | Severity | Rule |
|---|---|---|
| `MODEL_LEGACY` | **error** | Document uses the superseded geometric model (`entity_states` / `lines`). Message points to the action model. |
| `SCHEMA_INVALID` | **error** | Generic schema failure (carries engine instance path). |
| `JSON_PARSE` | **error** | File is not parseable JSON (emitted by `validate_file` only). |

### Error registry (`shared/error-codes.json`)

Each code is defined **once**, language-neutrally; both implementations import
this file:

```json
{
  "BALL_CARRIER_MISMATCH": {
    "severity": "error",
    "category": "ball-possession",
    "message": "Player {from} performs {action} but does not carry ball {ball_id}.",
    "spec_ref": "design §7.2"
  }
}
```

Codes, severities, and message templates are therefore identical across both
languages, and conformance fixtures reference exactly these codes.

---

## 5. Interface

### Result format (language-neutral, identical in TS & Py)

`validate(doc)` always returns the same structured object — it never throws for
*validation* failures (exceptions only for true programmer errors such as a
non-object argument):

```jsonc
{
  "valid": false,            // true ⟺ no errors (the renderer gate checks exactly this)
  "errors":   [ /* Issue[] */ ],
  "warnings": [ /* Issue[] */ ],
  "summary": { "errors": 2, "warnings": 1 }
}
```

An **Issue**:

```jsonc
{
  "code": "BALL_CARRIER_MISMATCH",
  "severity": "error",
  "message": "Player offense_2 performs pass but does not carry ball b1.",
  "path": "/frames/2/actions/0",      // JSON-Pointer — editor jumps straight here
  "frame": "frame_3",                  // human-friendly anchor
  "spec_ref": "design §7.2",
  "data": { "from": "offense_2", "ball_id": "b1", "action": "pass" }
}
```

This serves both consumers cleanly:

- **Renderer gate:** reads only `result.valid` → yes/no.
- **LLM / Editor:** reads `errors` / `warnings`, uses `path` to mark the spot,
  `data` + `message` to explain and correct.

### Library API

**TypeScript:**

```ts
import { validate, validateFile } from "@ocf/validator";
const result = validate(doc);          // doc: parsed JSON
if (!result.valid) { /* result.errors */ }
```

**Python (mirrored):**

```python
from ocf_validator import validate, validate_file
result = validate(doc)                  # doc: dict
if not result.valid:
    ...                                 # result.errors
```

`validate_file(path)` reads and parses the JSON, surfacing parse failures as a
`JSON_PARSE` issue rather than throwing.

### CLI (a thin wrapper over `validate`)

```
ocf-validate path/to/play.ocf.json [more.json ...]
ocf-validate --json play.ocf.json       # machine-readable result (CI / pipelines)
ocf-validate --quiet play.ocf.json      # exit code only
ocf-validate --strict play.ocf.json     # treat warnings as errors
```

- **Default output:** human-readable, colored, grouped by file — errors red,
  warnings yellow, each with `path` and `message`.
- **Exit codes:** `0` = no errors (warnings allowed), `1` = errors, `2` = CLI
  usage error. `--strict` makes warnings count toward exit `1`.

Both packages ship the same CLI: TS via a `bin` entry (`npx @ocf/validator`),
Python via a console script (`ocf-validate`).

---

## 6. Conformance — the contract that keeps both honest

`shared/conformance/cases.json` lists the **expected issues** per fixture:

```jsonc
{
  "file": "invalid/ball-carried-and-at.json",
  "expect": { "valid": false, "errors": [{ "code": "SCHEMA_INVALID" }] }
}
```

Both the TS and Py test runners load this file, call their own `validate()`, and
compare **codes + severity**. If one implementation drifts, CI goes red.

The 6 existing invalid fixtures from the spec repo seed the suite. Note that
several of them are caught at **Level 0 (schema)**, not by a semantic rule —
the conformance case records whatever code the validator actually emits:

| Fixture | Expected code | Caught at |
|---|---|---|
| `ball-carried-and-at` | `SCHEMA_INVALID` | Level 0 (ball `oneOf`) |
| `state-bad-ball-key` | `SCHEMA_INVALID` or `REF_BALL_UNKNOWN` | depends on shape |
| `action-pass-missing-receiver` | `SCHEMA_INVALID` | Level 0 (required `to`) |
| `action-unknown-type` | `SCHEMA_INVALID` | Level 0 (action `oneOf`) |
| `frame-bad-branch-key` | `SCHEMA_INVALID` | Level 0 (branch outcome not in enum) |
| `frame-missing-end-state` | `SCHEMA_INVALID` | Level 0 (`end_state` is required) |

The seed fixtures turn out to be **mostly Level-0 (schema) failures** — the
genuinely semantic rules (ball-possession, `REF_BRANCH_TARGET_UNKNOWN`,
`REF_*`, quality warnings) need **new** fixtures, authored as part of the plan.

> During implementation, each fixture is run once to record the *actual* emitted
> code before pinning it in `cases.json`; the table above is the design intent,
> verified in Task 1.

These seed the suite, plus the 4 valid examples (`pick-and-roll`, `3-man-weave`,
`transition-3v2`, `quick-mode`) and new fixtures for each semantic rule above.

---

## 7. Out of scope for v1

- Geometric interpolation of variant moves without a `to` (deferred; see §4-C).
- `ACTION_UNUSUAL_CARRIER` beyond the basic offense/defense convention.
- Renderer, editor, LLM generation (separate companion repos).
