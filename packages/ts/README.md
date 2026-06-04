# @ocf/validator

Reference TypeScript validator for the Open Coaching Format.

```ts
import { validate, validateFile } from "@ocf/validator";
const res = validate(doc);   // res.valid, res.errors, res.warnings, res.summary
```

## CLI

```text
npx ocf-validate play.ocf.json [--json] [--quiet] [--strict]
```

Exit codes: `0` no errors, `1` errors (or warnings with `--strict`), `2` usage.
