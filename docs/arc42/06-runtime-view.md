# 6. Runtime View

## 6.1 Scenario: Validating a document via the library API

```mermaid
sequenceDiagram
    participant C as consumer code
    participant V as validate(doc)
    participant S as schema-level
    participant R as rules/*

    C->>V: validate(doc)
    V->>V: legacy-model check<br/>(entity_states/lines?)
    alt MODEL_LEGACY detected
        V-->>C: {valid:false, [MODEL_LEGACY]}
    else no legacy model
        V->>S: Level 0: schema check
        S-->>V: issues[] (AJV/jsonschema)
        alt issues non-empty
            V-->>C: {valid:false, [SCHEMA_INVALID..]}<br/>(Level 1 skipped)
        else schema clean
            V->>V: Level 1: build possession context
            loop for each frame, in order
                V->>R: run rules/references
                V->>R: run rules/possession-rules
                V->>R: run rules/coherence
                V->>R: run rules/quality
            end
            R-->>V: issues[] accumulated
            V-->>C: {valid, errors[], warnings[], summary}
        end
    end
```

Key behaviors:

- **Never throws** for validation failures — a malformed document always
  produces a populated `errors[]`, never an exception. Exceptions are
  reserved for programmer errors (e.g. calling `validate(null)`).
- **Short-circuit at Level 0**: if the schema check produces any issue,
  Level 1 rules never execute — avoids nonsensical semantic errors over
  structurally broken data (e.g. asking "does this ball exist" when `balls`
  itself failed schema validation).
- **Possession context threads across frames**: rule groups in Level 1 are
  not independent — `rules/possession-rules` and `rules/coherence` both read
  and advance the same per-frame ball-possession state, processed in frame
  array order (see [§7 in the design doc](../superpowers/specs/2026-06-03-ocf-validator-design.md#7-out-of-scope-for-v1)
  for the known `after`-ordering limitation).

## 6.2 Scenario: `validate_file(path)` — parse failure

```mermaid
sequenceDiagram
    participant C as consumer code
    participant F as validate_file(path)

    C->>F: validate_file(path)
    F->>F: read file, json.parse/JSON.parse
    alt parse throws
        F-->>C: {valid:false, [JSON_PARSE]}<br/>(validate() never called)
    else parse succeeds
        F->>F: call validate(parsed) as in §6.1
        F-->>C: {valid, errors[]}
    end
```

`JSON_PARSE` is emitted only by `validate_file`/`validate_file`'s file-reading
wrapper — `validate(doc)` itself always receives an already-parsed object and
has no notion of parse failure.

## 6.3 Scenario: automated schema sync (CI, cross-repo)

```mermaid
sequenceDiagram
    participant Spec as opencoachingformat/spec
    participant CI as GitHub Actions (this repo)
    participant API as GitHub Contents API
    participant Rev as reviewer

    Spec->>CI: repository_dispatch: spec_released<br/>(client_payload.version)
    CI->>CI: resolve version from payload<br/>(fail loudly if empty)
    CI->>API: gh api .../contents/schema/v1.json?ref=$VERSION
    API-->>CI: base64 content
    CI->>CI: sanity-check: valid JSON?<br/>(abort if not)
    CI->>CI: diff vs. vendored copy
    alt unchanged
        CI->>CI: stop, no PR
    else changed
        CI->>CI: overwrite ocf-action-v1.json
        CI->>CI: rewrite PROVENANCE.md
        CI->>Rev: open PR (auto/schema-sync-*<br/>branch, no auto-merge)
        Rev->>Rev: review schema diff, check new<br/>`required`/removed enums
        Rev->>Rev: wait for ci.yml to pass
        Rev->>CI: approve + merge
    end
```
