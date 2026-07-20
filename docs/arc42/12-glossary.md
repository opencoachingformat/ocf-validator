# 12. Glossary

| Term | Definition |
|---|---|
| **OCF** | Open Coaching Format — the JSON-based format for describing a basketball play as entities, balls, and a sequence of frames with actions and state. Canonical spec lives in `opencoachingformat/spec`. |
| **Frame** | A single step in a play: has an `id`, a set of `actions`, a `start_state`/`end_state`, and optional `branches` to alternate frames (for branching plays / decision points). |
| **Action** | A single player behavior within a frame: `move`, `cut`, `screen`, `defend`, `dribble`, `pass`, `shoot`, `rebound`, `pickup`. Each action type has its own schema branch with its own allowed fields (e.g. `intensity` vs. `physicality`, see §8.5). |
| **Entity** | A player or court object placed on the court: offense/defense player, cone, station, etc. Identified in the `entities` array and referenced by other parts of the document (e.g. `from`/`to`/`carried_by`). |
| **Ball** | A tracked object with a possession lifecycle — carried by an entity, loose at a location, or rebounding — declared in `balls[]` and referenced by `ball_id`. |
| **Level 0 (Schema validation)** | The first validation stage: structural JSON Schema validation (AJV in TS, `jsonschema` in Python) against `shared/schema/ocf-action-v1.json`. Must pass before Level 1 runs. |
| **Level 1 (Semantic validation)** | The second validation stage: reference integrity, ball-possession consistency, cross-frame state coherence, and quality/rendering-hint checks — see design doc §4 and arc42 §5.3. |
| **Issue** | The atomic unit of validator output: `{code, severity, message, path, frame, spec_ref, data}`. Either an error (blocking) or a warning (non-blocking). |
| **`MODEL_LEGACY`** | Error code for documents using the superseded geometric model (`entity_states`/`lines`) instead of the current semantic action model. |
| **Conformance fixture** | A sample OCF document under `shared/conformance/{valid,invalid,warn}/` with an expected outcome recorded in `cases.json`, used to keep TS and Python behaviorally identical. |
| **Provenance** | The recorded source (repo, ref/commit) that a vendored file (currently: the schema) was copied from, tracked in `shared/schema/PROVENANCE.md`. |
| **`spec_released`** | The `repository_dispatch` event type sent by (or on behalf of) `opencoachingformat/spec` to trigger `sync-from-spec.yml`, carrying `client_payload.version`. |
| **Possession context** | The per-frame, threaded state tracking which entity carries which ball (or where a loose ball rests), used by the possession and coherence rule groups. |
| **`intensity`** | Schema field on movement/ball-handling actions (`move`, `cut`, `dribble`, `pass`, `shoot`) describing movement speed/effort. Mutually exclusive with `physicality` per action type. |
| **`physicality`** | Schema field on contact-oriented actions (`screen`, `defend`, `rebound`, `pickup`) describing contact intensity. Mutually exclusive with `intensity` per action type. |
