# 5. Building Block View

## 5.1 Whitebox: Overall System

```
ocf-validator/
├── shared/                        # language-neutral — the reference truth
│   ├── error-codes.json           # code → {severity, category, message, spec_ref}
│   ├── named-positions.json       # canonical OCF named-position catalog
│   ├── schema/
│   │   ├── ocf-action-v1.json     # vendored copy of spec repo schema/v1.json
│   │   └── PROVENANCE.md          # source commit / sync record
│   └── conformance/
│       ├── valid/*.json           # documents expected to validate cleanly
│       ├── invalid/*.json         # documents expected to fail, with expected codes
│       ├── warn/*.json            # documents expected to pass with warnings
│       └── cases.json             # fixture → expected {codes|warnings}
├── packages/
│   ├── ts/                        # reference implementation (built first)
│   │   ├── src/
│   │   │   ├── index.ts           # public API: validate()
│   │   │   ├── cli.ts             # ocf-validate CLI entry point
│   │   │   ├── validate.ts        # pipeline orchestration (Level 0 → Level 1)
│   │   │   ├── schema-level.ts    # AJV setup + schema-level checks
│   │   │   ├── context.ts         # per-frame ball-possession state tracking
│   │   │   ├── possession.ts      # possession bookkeeping helpers
│   │   │   ├── codes.ts           # loads shared/error-codes.json
│   │   │   ├── named-positions.ts # loads shared/named-positions.json
│   │   │   ├── court-dimensions.ts# ruleset → court bounds (for ENTITY_OFFCOURT)
│   │   │   ├── types.ts           # Issue / Result / doc shape types
│   │   │   └── rules/
│   │   │       ├── references.ts       # REF_* rules
│   │   │       ├── possession-rules.ts # BALL_* / ACTION_UNUSUAL_CARRIER
│   │   │       ├── coherence.ts        # END_STATE_DISAGREE / START_STATE_DISCONTINUITY
│   │   │       └── quality.ts          # CONTRAST_LOW / ENTITY_OFFCOURT / EMPTY_FRAME
│   │   └── test/                  # unit tests + shared/conformance runner
│   └── py/                        # mirrored implementation
│       ├── ocf_validator/
│       │   ├── __init__.py        # public API: validate, validate_file
│       │   ├── cli.py             # ocf-validate console script (click)
│       │   ├── validate.py        # pipeline orchestration
│       │   ├── schema_level.py    # jsonschema setup + schema-level checks
│       │   ├── context.py         # per-frame ball-possession state tracking
│       │   ├── possession.py      # possession bookkeeping helpers
│       │   ├── codes.py           # loads shared/error-codes.json
│       │   ├── named_positions.py # loads shared/named-positions.json
│       │   ├── rules.py           # all rule groups (references/possession/coherence/quality)
│       │   └── types.py           # Issue / Result dataclasses
│       └── tests/                 # unit tests + shared/conformance runner
├── .github/workflows/
│   ├── ci.yml                     # runs both packages against shared/conformance
│   └── sync-from-spec.yml         # repository_dispatch-triggered schema re-sync PR
└── docs/
    ├── arc42/                     # this architecture documentation
    ├── adr/                       # Architecture Decision Records
    └── superpowers/                # historical design/plan docs
```

## 5.2 Building Block: Validation Pipeline (`validate.ts` / `validate.py`)

Orchestrates, in order:

1. **Legacy-model gate** — detects the superseded geometric model
   (`entity_states` / `lines`) and short-circuits with a single `MODEL_LEGACY`
   error rather than a cascade of schema errors.
2. **Level 0 — Schema** (`schema-level.ts` / `schema_level.py`) — runs AJV /
   `jsonschema` against `shared/schema/ocf-action-v1.json`. On failure,
   returns immediately with `SCHEMA_INVALID` issue(s); Level 1 does not run.
3. **Level 1 — Semantics** — only reached when Level 0 passed. Builds a
   per-frame possession `context` (who carries which ball, where loose balls
   rest) and runs the four rule groups (`rules/*`) against it, threading
   context frame-by-frame.

## 5.3 Building Block: Rule Groups (Level 1)

| Module | Codes produced |
|---|---|
| `rules/references` | `REF_ENTITY_UNKNOWN`, `REF_BALL_UNKNOWN`, `REF_BRANCH_TARGET_UNKNOWN`, `REF_NAMED_POS_UNKNOWN` |
| `rules/possession-rules` | `BALL_CARRIER_MISMATCH`, `BALL_NOT_AT_LOCATION`, `BALL_AMBIGUOUS`, `ACTION_UNUSUAL_CARRIER` |
| `rules/coherence` | `END_STATE_DISAGREE`, `START_STATE_DISCONTINUITY` |
| `rules/quality` | `CONTRAST_LOW`, `ENTITY_OFFCOURT`, `EMPTY_FRAME` |

The Python package consolidates the same four groups into a single
`rules.py` module rather than a `rules/` package — an intentional structural
difference (see §8, "Structural mirroring vs. exact mirroring") that does not
affect conformance parity, since parity is enforced at the `shared/conformance`
behavioral level, not at the file-layout level.

## 5.4 Building Block: `shared/`

- **`error-codes.json`** — the single place a code's severity, category, and
  message template are defined. Both `codes.ts` and `codes.py` load this file
  verbatim rather than redefining codes locally.
- **`schema/ocf-action-v1.json`** — vendored, provenance-tracked copy of the
  canonical schema. Never hand-edited (enforced by convention + PROVENANCE.md
  instruction, not by tooling).
- **`conformance/`** — the parity contract: `cases.json` maps each fixture to
  its expected outcome; both test suites load it and assert identical
  `{code, severity}` results.
