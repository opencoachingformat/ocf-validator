# OCF Validator

Reference validator for the [Open Coaching Format](https://github.com/opencoachingformat/spec).
Checks an OCF document against the JSON Schema **and** the semantic rules the
schema cannot express (ball-possession consistency, branch-target integrity,
reference integrity), serving both authoring tools (LLM / editor) and the
rendering gate.

- `packages/ts` — TypeScript library + `ocf-validate` CLI (reference impl).
- `packages/py` — Python mirror (same conformance suite).
- `shared/` — language-neutral contract: model schema, error-code registry,
  named-position catalog, conformance fixtures.

## Quick start (TypeScript)

```bash
cd packages/ts && npm install && npm run build
node dist/cli.js path/to/play.ocf.json
```

```ts
import { validate } from "@ocf/validator";
const result = validate(doc);
if (!result.valid) console.error(result.errors);
```

See [the design doc](docs/superpowers/specs/2026-06-03-ocf-validator-design.md)
for the full rule set and result format.
