# 8. Cross-cutting Concepts

## 8.1 Error/Result Model

A single, language-neutral shape is used everywhere, defined once
conceptually and mirrored (not shared as code, since TS and Python cannot
share a runtime type) in both languages:

```jsonc
{
  "valid": false,
  "errors":   [ /* Issue[] */ ],
  "warnings": [ /* Issue[] */ ],
  "summary": { "errors": 2, "warnings": 1 }
}
```

An `Issue`:

```jsonc
{
  "code": "BALL_CARRIER_MISMATCH",
  "severity": "error",
  "message": "Player offense_2 performs pass but does not carry ball b1.",
  "path": "/frames/2/actions/0",
  "frame": "frame_3",
  "spec_ref": "design §7.2",
  "data": { "from": "offense_2", "ball_id": "b1", "action": "pass" }
}
```

`result.valid` is defined as `errors.length === 0` — warnings never affect it
(unless a consumer opts into `--strict`, which is a CLI-layer concern, not a
change to the underlying result semantics).

## 8.2 Error Code Registry (`shared/error-codes.json`)

Every code's severity, category, and message template is defined **exactly
once**, language-neutrally. Both `codes.ts` and `codes.py` load this file
directly rather than hardcoding severities or messages per-language. This is
the mechanism that guarantees a `BALL_CARRIER_MISMATCH` means the same
severity and produces the same message shape regardless of which package
raised it.

## 8.3 Two-Level Validation (Schema, then Semantics)

See [ADR-0002](../adr/0002-two-stage-validation.md). Cross-cutting because
every rule group (references, possession, coherence, quality) implicitly
depends on Level 0 having already guaranteed structural shape — no rule
group re-checks types/required fields that the schema already enforces.

## 8.4 Possession State Tracking

The semantic engine carries a **per-frame ball-possession state** (who
carries which ball, where loose balls rest) threaded through the frame
sequence in **array order** (not resolved via each action's optional `after`
dependency — a known v1 limitation, see design doc §7). Both
`rules/possession-rules` (carrier mismatches, ambiguous balls) and
`rules/coherence` (`end_state` agreement) read this same state, so it is
built once per `validate()` call and passed through, not recomputed per rule.

## 8.5 Field Semantics: `intensity` vs. `physicality`

Actions with movement or ball-handling semantics (`move`, `cut`, `dribble`,
`pass`, `shoot`) accept an `intensity` field (`walk` / `jog` / `sprint` /
similar movement-speed enum, schema-defined). Contact-oriented actions
(`screen`, `defend`, `rebound`, `pickup`) instead accept a `physicality`
field — the two are **mutually exclusive per action type** and enforced via
`additionalProperties: false` combined with per-`oneOf`-branch property
lists in the JSON Schema: an action type that doesn't declare a field in its
schema branch will fail Level-0 validation (`SCHEMA_INVALID`) if that field
is present, rather than silently ignoring it. This is why
`action-bad-movement-intensity` (an `intensity` value not in the schema enum)
and `action-intensity-on-screen` (`intensity` used on a `screen`, which only
accepts `physicality`) are both caught at Level 0, not by a semantic rule.

## 8.6 Legacy Model Rejection

Documents using the superseded geometric model (`entity_states` / `lines`,
predating the current `balls[]`/`actions`/`start_state`/`end_state` model)
are detected **before** generic schema errors run, and rejected with a
single targeted `MODEL_LEGACY` error whose message points at the current
model — rather than surfacing a confusing cascade of unrelated schema
failures from validating old-shaped data against the new schema.

## 8.7 Provenance and Deliberate Schema Change

`shared/schema/ocf-action-v1.json` always carries a paired
`shared/schema/PROVENANCE.md` recording the exact source commit/ref it was
copied from. The file is never hand-edited — both the manual process and the
`sync-from-spec.yml` automation always update schema + provenance together,
so provenance can never silently drift out of sync with the actual vendored
content.

## 8.8 Conformance as Contract, Not Just Tests

`shared/conformance/cases.json` is treated as a first-class architectural
artifact, not merely a test fixture list: it is the machine-checked
definition of "these two implementations agree." Any new rule or schema
change is expected to add/update a fixture + case entry, and CI failing on a
conformance mismatch is the intended signal that the two languages have
drifted — this is the primary mechanism satisfying Quality Goal 1.

## 8.9 Structural Mirroring vs. Exact Mirroring

The Python package is a **behavioral** mirror of the TypeScript reference,
not a file-for-file structural clone: e.g. Python consolidates the four rule
groups into one `rules.py` rather than a `rules/` subpackage. This is
intentional — parity is enforced at the `shared/conformance` behavioral
level (identical codes/severities per fixture), and each language is free to
use idiomatic internal structure as long as conformance holds.
