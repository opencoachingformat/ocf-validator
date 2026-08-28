# Plan 2 — Version-Aware Validator (Strang B, core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the validator version-aware — expose its bundled schema version, refuse a different-major document cleanly, warn (best-effort) when a document requires a newer minor than bundled, attach a `schema` block to every `Result`, and auto-republish the validator as a patch on schema sync.

**Architecture:** The *deterministic* signals (schemaInfo, major guard, minor-gap warning, `Result.schema`) are mirrored in **both** TS (ajv) and Python (`Draft7Validator`) to preserve conformance parity. The *optional on-demand schema fetch* is a **TS-only browser convenience** (`validateAsync`) that never changes conformance semantics — Python stays synchronous and network-free. Two new error codes go in `shared/error-codes.json`. The existing sync workflow gains a patch bump + auto-tag so npm release is hands-off.

**Tech Stack:** TypeScript (ajv 8, vitest, tsup), Python (jsonschema Draft7Validator, pytest), GitHub Actions, `shared/` contract.

**Design ref:** `../specs/` — the version-aware-validator design (Strand B) lives in the spec repo at `docs/superpowers/specs/2026-08-28-version-aware-validator-design.md`.

**Prereq:** spec v1.4.0 released (done). The schema now carries `x-ocf-version` and documents may carry `meta.min_schema_version`. The vendored schema must be synced to v1.4.0 first (Task 8 folds the pending auto-sync PR #23 in).

---

### Task 1: Two new error codes in the shared contract

**Files:**
- Modify: `shared/error-codes.json`

- [ ] **Step 1: Add the codes**

After the last entry (`EMPTY_FRAME`), add two entries (mind the trailing comma on the previous entry):

```json
  "SCHEMA_MAJOR_UNSUPPORTED": {
    "severity": "error",
    "category": "schema",
    "message": "Document targets schema major {declared} but this validator only supports {supported}. Validation was not run.",
    "spec_ref": "schema/v1.json"
  },
  "VALIDATOR_MAYBE_OUTDATED": {
    "severity": "warning",
    "category": "schema",
    "message": "Document requires schema >= {required} but this validator bundles {bundled}; some errors below may be caused by an out-of-date validator.",
    "spec_ref": "schema/v1.json"
  }
```

- [ ] **Step 2: Verify JSON is valid + count is 18**

Run: `node -e "const d=require('./shared/error-codes.json'); console.log(Object.keys(d).length, 'codes'); console.log(!!d.SCHEMA_MAJOR_UNSUPPORTED && !!d.VALIDATOR_MAYBE_OUTDATED)"`
Expected: `18 codes` and `true`.

- [ ] **Step 3: Commit**

```bash
git add shared/error-codes.json
git commit -m "feat(codes): add SCHEMA_MAJOR_UNSUPPORTED + VALIDATOR_MAYBE_OUTDATED"
```

---

### Task 2: TS — a pure `schema-version` module (parse + compare + gap logic)

**Files:**
- Create: `packages/ts/src/schema-version.ts`
- Create: `packages/ts/test/unit/schema-version.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ts/test/unit/schema-version.test.ts`:

```ts
import { test, expect } from "vitest";
import {
  bundledSchemaInfo, parseMajor, cmpSemver, schemaCheck,
} from "../../src/schema-version.js";

test("bundledSchemaInfo reads x-ocf-version from the vendored schema", () => {
  expect(typeof bundledSchemaInfo.version).toBe("string");
  expect(bundledSchemaInfo.major).toBe("v1");
  expect(bundledSchemaInfo.id).toBe("https://opencoachingformat.org/schema/v1.json");
});

test("parseMajor extracts the major token from a schema URL", () => {
  expect(parseMajor("https://opencoachingformat.org/schema/v1.json")).toBe("v1");
  expect(parseMajor("https://opencoachingformat.org/schema/v2.json")).toBe("v2");
  expect(parseMajor(undefined)).toBe(null);
});

test("cmpSemver orders versions numerically", () => {
  expect(cmpSemver("1.2.0", "1.10.0")).toBeLessThan(0);
  expect(cmpSemver("1.4.0", "1.4.0")).toBe(0);
  expect(cmpSemver("2.0.0", "1.9.9")).toBeGreaterThan(0);
});

test("schemaCheck: matching major, no min -> ok, no issues", () => {
  const r = schemaCheck({ $schema: "https://opencoachingformat.org/schema/v1.json" });
  expect(r.majorUnsupported).toBe(false);
  expect(r.outdated).toBe(false);
  expect(r.block.match).toBe(true);
});

test("schemaCheck: different major -> majorUnsupported", () => {
  const r = schemaCheck({ $schema: "https://opencoachingformat.org/schema/v2.json" });
  expect(r.majorUnsupported).toBe(true);
  expect(r.block.match).toBe(false);
});

test("schemaCheck: min_schema_version above bundled -> outdated", () => {
  const r = schemaCheck({ meta: { min_schema_version: "9.9.9" } });
  expect(r.outdated).toBe(true);
  expect(r.block.requiredByDoc).toBe("9.9.9");
});

test("schemaCheck: min_schema_version at/below bundled -> not outdated", () => {
  const r = schemaCheck({ meta: { min_schema_version: "1.0.0" } });
  expect(r.outdated).toBe(false);
});
```

- [ ] **Step 2: Run it — expect FAIL (module missing)**

Run: `cd packages/ts && npx vitest run test/unit/schema-version.test.ts`
Expected: FAIL — cannot resolve `../../src/schema-version.js`.

- [ ] **Step 3: Implement the module**

`packages/ts/src/schema-version.ts`:

```ts
import schema from "../../../shared/schema/ocf-action-v1.json" with { type: "json" };
import type { OcfDoc } from "./types.js";

const CANONICAL_ID = "https://opencoachingformat.org/schema/v1.json";

export interface SchemaInfo { version: string; major: string; id: string; }

const rawVersion = (schema as Record<string, unknown>)["x-ocf-version"];
export const bundledSchemaInfo: SchemaInfo = {
  version: typeof rawVersion === "string" ? rawVersion : "0.0.0",
  major: "v" + (typeof rawVersion === "string" ? rawVersion.split(".")[0] : "0"),
  id: (schema as Record<string, unknown>)["$id"] as string ?? CANONICAL_ID,
};

export function parseMajor(schemaUrl: string | undefined): string | null {
  if (typeof schemaUrl !== "string") return null;
  const m = schemaUrl.match(/\/schema\/(v\d+)\.json/);
  return m ? m[1] : null;
}

export function cmpSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

export interface SchemaBlock {
  validatedAgainst: string;
  documentDeclared: string | null;
  requiredByDoc: string | null;
  match: boolean;
}

export interface SchemaCheck {
  majorUnsupported: boolean;
  declaredMajor: string | null;
  outdated: boolean;
  block: SchemaBlock;
}

// Pure, synchronous. validatedAgainst defaults to the bundled version; the
// async fetch path (validateAsync) may raise it after loading a newer schema.
export function schemaCheck(doc: OcfDoc, validatedAgainst = bundledSchemaInfo.version): SchemaCheck {
  const declared = (doc as { $schema?: string }).$schema ?? null;
  const declaredMajor = parseMajor(declared ?? undefined);
  const majorUnsupported = declaredMajor !== null && declaredMajor !== bundledSchemaInfo.major;

  const meta = (doc as { meta?: { min_schema_version?: string } }).meta;
  const requiredByDoc = typeof meta?.min_schema_version === "string" ? meta.min_schema_version : null;
  const outdated = requiredByDoc !== null && cmpSemver(requiredByDoc, validatedAgainst) > 0;

  const match = !majorUnsupported && !outdated;
  return {
    majorUnsupported, declaredMajor, outdated,
    block: { validatedAgainst, documentDeclared: declared, requiredByDoc, match },
  };
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd packages/ts && npx vitest run test/unit/schema-version.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ts/src/schema-version.ts packages/ts/test/unit/schema-version.test.ts
git commit -m "feat(ts): pure schema-version module (info, major, semver, gap)"
```

---

### Task 3: TS — `Result.schema` type + wire guard/warning into `validate`

**Files:**
- Modify: `packages/ts/src/types.ts`
- Modify: `packages/ts/src/validate.ts`
- Create: `packages/ts/test/unit/validate-schema-block.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/ts/test/unit/validate-schema-block.test.ts`:

```ts
import { test, expect } from "vitest";
import { validate } from "../../src/validate.js";

const base = {
  $schema: "https://opencoachingformat.org/schema/v1.json",
  meta: { id: "00000000-0000-4000-8000-000000000001", title: "t" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  frames: [{ id: "f1",
    actions: [{ player: "offense_1", type: "shoot", ball_id: "ball_1" }],
    end_state: { offense_1: { x: 0, y: 5 } } }],
};

test("Result carries a schema block on a clean doc", () => {
  const res = validate(base);
  expect(res.schema).toBeDefined();
  expect(res.schema.documentDeclared).toBe("https://opencoachingformat.org/schema/v1.json");
  expect(res.schema.match).toBe(true);
  expect(typeof res.schema.validatedAgainst).toBe("string");
});

test("different-major doc is rejected with SCHEMA_MAJOR_UNSUPPORTED and no semantic cascade", () => {
  const doc = { ...base, $schema: "https://opencoachingformat.org/schema/v2.json" };
  const res = validate(doc);
  expect(res.valid).toBe(false);
  expect(res.errors.map((e) => e.code)).toContain("SCHEMA_MAJOR_UNSUPPORTED");
  expect(res.errors.some((e) => e.code === "SCHEMA_INVALID")).toBe(false);
  expect(res.schema.match).toBe(false);
});

test("doc requiring a newer minor warns VALIDATOR_MAYBE_OUTDATED but still validates", () => {
  const doc = { ...base, meta: { ...base.meta, min_schema_version: "9.9.9" } };
  const res = validate(doc);
  expect(res.warnings.map((w) => w.code)).toContain("VALIDATOR_MAYBE_OUTDATED");
  expect(res.schema.requiredByDoc).toBe("9.9.9");
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd packages/ts && npx vitest run test/unit/validate-schema-block.test.ts`
Expected: FAIL — `res.schema` is undefined; no such codes emitted.

- [ ] **Step 3: Extend the `Result` type**

In `packages/ts/src/types.ts`, add a `SchemaBlock` and put `schema` on `Result`:

```ts
export interface SchemaBlock {
  validatedAgainst: string;
  documentDeclared: string | null;
  requiredByDoc: string | null;
  match: boolean;
}

export interface Result {
  valid: boolean;          // true iff no errors
  errors: Issue[];
  warnings: Issue[];
  summary: { errors: number; warnings: number };
  schema: SchemaBlock;
}
```

- [ ] **Step 4: Wire guard + warning into `validate`**

In `packages/ts/src/validate.ts`, import the check and apply it. Replace the
existing `validate` function body so the schema block is always attached, the
major guard short-circuits, and the outdated warning is appended:

```ts
import { schemaCheck } from "./schema-version.js";
import { makeIssue } from "./codes.js";
// ...existing imports...

export function assemble(issues: Issue[], schema: import("./types.js").SchemaBlock): Result {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: { errors: errors.length, warnings: warnings.length },
    schema,
  };
}

export function validate(doc: OcfDoc): Result {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new TypeError("validate: expected an object (parsed OCF document)");
  }
  const check = schemaCheck(doc);

  // Major mismatch: refuse cleanly, do not run v1 schema/semantics.
  if (check.majorUnsupported) {
    return assemble([
      makeIssue("SCHEMA_MAJOR_UNSUPPORTED", "/$schema", {
        declared: check.declaredMajor, supported: bundledMajor(),
      }),
    ], check.block);
  }

  const issues: Issue[] = [];
  if (check.outdated) {
    issues.push(makeIssue("VALIDATOR_MAYBE_OUTDATED", "/meta/min_schema_version", {
      required: check.block.requiredByDoc, bundled: check.block.validatedAgainst,
    }));
  }

  const level0 = schemaLevel(doc);
  if (level0.length > 0) return assemble([...issues, ...level0], check.block);

  const ctx = buildContext(doc);
  const states = possessionByFrame(doc);
  issues.push(
    ...referenceRules(doc, ctx),
    ...possessionRules(doc, ctx, states),
    ...coherenceRules(doc, ctx),
    ...qualityRules(doc, ctx),
  );
  return assemble(issues, check.block);
}
```

Add a small helper near the top of the file (after imports):

```ts
import { bundledSchemaInfo } from "./schema-version.js";
function bundledMajor(): string { return bundledSchemaInfo.major; }
```

Note: the old `assemble(issues)` (single-arg) is replaced by the two-arg form
above. Update its only other caller if any (search the file for `assemble(`).

- [ ] **Step 5: Run it — expect PASS, then run the whole TS suite**

Run: `cd packages/ts && npx vitest run test/unit/validate-schema-block.test.ts`
Expected: PASS (3 tests).

Run: `cd packages/ts && npm test`
Expected: all pass. If any existing test asserted the exact shape of `Result`
(no `schema` key) it must be updated to allow the new key — fix those inline.

- [ ] **Step 6: Commit**

```bash
git add packages/ts/src/types.ts packages/ts/src/validate.ts packages/ts/test/unit/validate-schema-block.test.ts
git commit -m "feat(ts): major guard + outdated warning + Result.schema block"
```

---

### Task 4: TS — `validateAsync` with on-demand schema fetch (browser convenience)

**Files:**
- Create: `packages/ts/src/validate-async.ts`
- Modify: `packages/ts/src/index.ts`, `packages/ts/src/browser.ts`
- Create: `packages/ts/test/unit/validate-async.test.ts`

- [ ] **Step 1: Write the failing test (fetch is injected, no real network)**

`packages/ts/test/unit/validate-async.test.ts`:

```ts
import { test, expect } from "vitest";
import { validateAsync } from "../../src/validate-async.js";

const base = {
  $schema: "https://opencoachingformat.org/schema/v1.json",
  meta: { id: "00000000-0000-4000-8000-000000000001", title: "t", min_schema_version: "9.9.9" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  frames: [{ id: "f1",
    actions: [{ player: "offense_1", type: "shoot", ball_id: "ball_1" }],
    end_state: { offense_1: { x: 0, y: 5 } } }],
};

test("fetch success: validates against fetched newer schema, no outdated warning", async () => {
  // Fake fetch returns a schema whose x-ocf-version is 9.9.9 and accepts the doc.
  const newerSchema = { $id: "https://opencoachingformat.org/schema/v1.json", "x-ocf-version": "9.9.9", type: "object" };
  const fakeFetch = async () => ({ ok: true, json: async () => newerSchema } as Response);
  const res = await validateAsync(base, { fetchLatestSchema: true, fetchImpl: fakeFetch });
  expect(res.schema.validatedAgainst).toBe("9.9.9");
  expect(res.warnings.map((w) => w.code)).not.toContain("VALIDATOR_MAYBE_OUTDATED");
});

test("fetch failure: falls back to bundled + outdated warning", async () => {
  const fakeFetch = async () => ({ ok: false, json: async () => ({}) } as Response);
  const res = await validateAsync(base, { fetchLatestSchema: true, fetchImpl: fakeFetch });
  expect(res.warnings.map((w) => w.code)).toContain("VALIDATOR_MAYBE_OUTDATED");
});

test("fetchLatestSchema false: behaves like sync validate", async () => {
  const res = await validateAsync(base, { fetchLatestSchema: false });
  expect(res.warnings.map((w) => w.code)).toContain("VALIDATOR_MAYBE_OUTDATED");
});
```

- [ ] **Step 2: Run it — expect FAIL (module missing)**

Run: `cd packages/ts && npx vitest run test/unit/validate-async.test.ts`
Expected: FAIL — cannot resolve `../../src/validate-async.js`.

- [ ] **Step 3: Implement `validateAsync`**

`packages/ts/src/validate-async.ts`:

```ts
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { OcfDoc, Result } from "./types.js";
import { validate } from "./validate.js";
import { schemaCheck, bundledSchemaInfo } from "./schema-version.js";
import { makeIssue } from "./codes.js";

export interface AsyncOptions {
  fetchLatestSchema?: boolean;
  fetchImpl?: typeof fetch;
}

// Validate a doc, and — only when it declares a newer min_schema_version than
// bundled — try once to fetch the current schema and validate against it. On any
// failure, fall back to the synchronous validate() (which emits the outdated
// warning). This never changes conformance semantics; it is a browser aid.
export async function validateAsync(doc: OcfDoc, opts: AsyncOptions = {}): Promise<Result> {
  const { fetchLatestSchema = true, fetchImpl } = opts;
  const pre = schemaCheck(doc);

  if (!fetchLatestSchema || pre.majorUnsupported || !pre.outdated) {
    return validate(doc);
  }

  const declared = (doc as { $schema?: string }).$schema;
  const url = declared ?? bundledSchemaInfo.id;
  const doFetch = fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!doFetch) return validate(doc);

  try {
    const resp = await doFetch(url);
    if (!resp.ok) return validate(doc);
    const fetched = (await resp.json()) as Record<string, unknown>;
    const fetchedVersion = typeof fetched["x-ocf-version"] === "string"
      ? (fetched["x-ocf-version"] as string) : bundledSchemaInfo.version;

    const ajv = new Ajv({ allErrors: true, strictSchema: false, strictRequired: false });
    addFormats(ajv);
    const validateFetched = ajv.compile(fetched);
    const check = schemaCheck(doc, fetchedVersion);

    if (validateFetched(doc)) {
      // Schema-clean against the newer schema: run the sync validator for
      // semantics, then override the schema block's validatedAgainst.
      const res = validate(doc);
      // Strip the (now-inapplicable) outdated warning, since we validated against the newer schema.
      const warnings = res.warnings.filter((w) => w.code !== "VALIDATOR_MAYBE_OUTDATED");
      return {
        ...res,
        warnings,
        summary: { errors: res.errors.length, warnings: warnings.length },
        schema: check.block,
      };
    }
    // Newer schema rejected it: surface those schema errors with the newer version noted.
    const errors = (validateFetched.errors ?? []).map((e) =>
      makeIssue("SCHEMA_INVALID", e.instancePath || "/", {
        detail: `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim(),
      }));
    return {
      valid: errors.length === 0, errors, warnings: [],
      summary: { errors: errors.length, warnings: 0 },
      schema: check.block,
    };
  } catch {
    return validate(doc);
  }
}
```

- [ ] **Step 4: Export it**

`packages/ts/src/index.ts` — add:
```ts
export { validateAsync } from "./validate-async.js";
export type { SchemaBlock } from "./types.js";
```
`packages/ts/src/browser.ts` — add:
```ts
export { validateAsync } from "./validate-async.js";
export type { SchemaBlock } from "./types.js";
```

- [ ] **Step 5: Run it — expect PASS, then whole suite**

Run: `cd packages/ts && npx vitest run test/unit/validate-async.test.ts`
Expected: PASS (3 tests).

Run: `cd packages/ts && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/ts/src/validate-async.ts packages/ts/src/index.ts packages/ts/src/browser.ts packages/ts/test/unit/validate-async.test.ts
git commit -m "feat(ts): validateAsync with on-demand newer-schema fetch (browser)"
```

---

### Task 5: Python — mirror the deterministic signals (parity)

**Files:**
- Create: `packages/py/ocf_validator/schema_version.py`
- Modify: `packages/py/ocf_validator/types.py`, `packages/py/ocf_validator/validate.py`
- Create: `packages/py/tests/test_schema_version.py`

- [ ] **Step 1: Write the failing test**

`packages/py/tests/test_schema_version.py`:

```python
from ocf_validator.validate import validate

BASE = {
    "$schema": "https://opencoachingformat.org/schema/v1.json",
    "meta": {"id": "00000000-0000-4000-8000-000000000001", "title": "t"},
    "court": {"ruleset": "fiba", "type": "half_court"},
    "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
    "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
    "frames": [{"id": "f1",
        "actions": [{"player": "offense_1", "type": "shoot", "ball_id": "ball_1"}],
        "end_state": {"offense_1": {"x": 0, "y": 5}}}],
}


def test_schema_block_present_and_matches():
    res = validate(BASE)
    assert res.schema is not None
    assert res.schema["documentDeclared"] == "https://opencoachingformat.org/schema/v1.json"
    assert res.schema["match"] is True


def test_different_major_rejected_without_cascade():
    doc = {**BASE, "$schema": "https://opencoachingformat.org/schema/v2.json"}
    res = validate(doc)
    assert res.valid is False
    assert any(e.code == "SCHEMA_MAJOR_UNSUPPORTED" for e in res.errors)
    assert not any(e.code == "SCHEMA_INVALID" for e in res.errors)


def test_newer_minor_warns_but_validates():
    doc = {**BASE, "meta": {**BASE["meta"], "min_schema_version": "9.9.9"}}
    res = validate(doc)
    assert any(w.code == "VALIDATOR_MAYBE_OUTDATED" for w in res.warnings)
    assert res.schema["requiredByDoc"] == "9.9.9"
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd packages/py && python -m pytest tests/test_schema_version.py -q`
Expected: FAIL — `Result` has no `schema`; codes not emitted.

- [ ] **Step 3: Implement the schema-version module**

`packages/py/ocf_validator/schema_version.py`:

```python
import json
from pathlib import Path

_SCHEMA = json.loads(
    (Path(__file__).resolve().parents[3] / "shared" / "schema" / "ocf-action-v1.json").read_text()
)
_CANONICAL_ID = "https://opencoachingformat.org/schema/v1.json"

_raw_version = _SCHEMA.get("x-ocf-version")
BUNDLED_VERSION = _raw_version if isinstance(_raw_version, str) else "0.0.0"
BUNDLED_MAJOR = "v" + (BUNDLED_VERSION.split(".")[0] if isinstance(_raw_version, str) else "0")
BUNDLED_ID = _SCHEMA.get("$id", _CANONICAL_ID)


def parse_major(schema_url):
    if not isinstance(schema_url, str):
        return None
    import re
    m = re.search(r"/schema/(v\d+)\.json", schema_url)
    return m.group(1) if m else None


def cmp_semver(a, b):
    pa = [int(x) for x in a.split(".")]
    pb = [int(x) for x in b.split(".")]
    for i in range(3):
        d = (pa[i] if i < len(pa) else 0) - (pb[i] if i < len(pb) else 0)
        if d:
            return d
    return 0


def schema_check(doc, validated_against=None):
    validated_against = validated_against or BUNDLED_VERSION
    declared = doc.get("$schema")
    declared_major = parse_major(declared)
    major_unsupported = declared_major is not None and declared_major != BUNDLED_MAJOR

    meta = doc.get("meta") or {}
    required = meta.get("min_schema_version")
    required = required if isinstance(required, str) else None
    outdated = required is not None and cmp_semver(required, validated_against) > 0

    match = not major_unsupported and not outdated
    return {
        "major_unsupported": major_unsupported,
        "declared_major": declared_major,
        "outdated": outdated,
        "block": {
            "validatedAgainst": validated_against,
            "documentDeclared": declared,
            "requiredByDoc": required,
            "match": match,
        },
    }
```

- [ ] **Step 4: Add `schema` to the Python `Result` and wire `validate`**

In `packages/py/ocf_validator/types.py`, add a field to `Result`:

```python
@dataclass
class Result:
    valid: bool
    errors: list[Issue]
    warnings: list[Issue]
    summary: dict[str, int]
    schema: dict[str, Any] | None = None
```

In `packages/py/ocf_validator/validate.py`, thread the block through `_assemble`
and apply the guard/warning:

```python
from .schema_version import schema_check, BUNDLED_MAJOR


def _assemble(issues: list[Issue], schema_block: dict | None = None) -> Result:
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]
    return Result(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        summary={"errors": len(errors), "warnings": len(warnings)},
        schema=schema_block,
    )


def validate(doc) -> Result:
    if not isinstance(doc, dict):
        raise TypeError("validate: expected a dict (parsed OCF document)")
    check = schema_check(doc)

    if check["major_unsupported"]:
        return _assemble([
            make_issue("SCHEMA_MAJOR_UNSUPPORTED", "/$schema", {
                "declared": check["declared_major"], "supported": BUNDLED_MAJOR,
            }),
        ], check["block"])

    issues: list[Issue] = []
    if check["outdated"]:
        issues.append(make_issue("VALIDATOR_MAYBE_OUTDATED", "/meta/min_schema_version", {
            "required": check["block"]["requiredByDoc"], "bundled": check["block"]["validatedAgainst"],
        }))

    level0 = schema_level(doc)
    if level0:
        return _assemble(issues + level0, check["block"])
    ctx = build_context(doc)
    states = possession_by_frame(doc)
    issues.extend(reference_rules(doc, ctx))
    issues.extend(possession_rules(doc, ctx, states))
    issues.extend(coherence_rules(doc, ctx))
    issues.extend(quality_rules(doc, ctx))
    return _assemble(issues, check["block"])
```

(Keep `validate_file`'s `_assemble([...])` call working — it now passes
`schema_block=None`, which is fine for a JSON parse failure.)

- [ ] **Step 5: Run it — expect PASS, then whole Python suite**

Run: `cd packages/py && python -m pytest tests/test_schema_version.py -q`
Expected: PASS (3 tests).

Run: `cd packages/py && python -m pytest -q`
Expected: all pass. Fix any test asserting the old `Result` shape inline.

- [ ] **Step 6: Commit**

```bash
git add packages/py/ocf_validator/schema_version.py packages/py/ocf_validator/types.py packages/py/ocf_validator/validate.py packages/py/tests/test_schema_version.py
git commit -m "feat(py): mirror schema major guard + outdated warning + schema block"
```

---

### Task 6: Conformance fixtures for the new behavior (both languages)

**Files:**
- Create: `shared/conformance/invalid/schema-major-v2.json`
- Create: `shared/conformance/warn/min-schema-newer.json`
- Modify: `shared/conformance/cases.json` (register both — BOTH runners key off this manifest, not the directory name)

- [ ] **Step 1: Add the shared conformance fixtures**

`shared/conformance/invalid/schema-major-v2.json` (expected to error with
`SCHEMA_MAJOR_UNSUPPORTED`):

```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-000000000001", "title": "future major" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 } ],
  "frames": [ { "id": "f1", "actions": [], "end_state": { "offense_1": { "x": 0, "y": 5 } } } ]
}
```

`shared/conformance/warn/min-schema-newer.json` (expected to warn with
`VALIDATOR_MAYBE_OUTDATED` and still be valid):

```json
{
  "$schema": "https://opencoachingformat.org/schema/v1.json",
  "meta": { "id": "00000000-0000-4000-8000-000000000001", "title": "needs newer", "min_schema_version": "9.9.9" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 } ],
  "balls": [ { "id": "ball_1", "carried_by": "offense_1" } ],
  "frames": [ { "id": "f1",
    "actions": [ { "player": "offense_1", "type": "shoot", "ball_id": "ball_1" } ],
    "end_state": { "offense_1": { "x": 0, "y": 5 } } } ]
}
```

- [ ] **Step 2: Register both fixtures in `cases.json`**

Both the TS (`conformance.test.ts`) and Python (`test_conformance.py`) runners
read `shared/conformance/cases.json` — a fixture NOT listed there is silently
ignored. Add to the `invalid` array:

```json
    { "file": "invalid/schema-major-v2.json", "codes": ["SCHEMA_MAJOR_UNSUPPORTED"] }
```

and to the `warn` array:

```json
    { "file": "warn/min-schema-newer.json", "warnings": ["VALIDATOR_MAYBE_OUTDATED"] }
```

- [ ] **Step 3: Run both conformance suites**

Run: `cd packages/ts && npm test`
Run: `cd packages/py && python -m pytest -q`
Expected: both green; the new fixtures are exercised (invalid one errors, warn one warns-only).

- [ ] **Step 4: Commit**

```bash
git add shared/conformance/invalid/schema-major-v2.json shared/conformance/warn/min-schema-newer.json shared/conformance/cases.json
git commit -m "test(conformance): schema major guard + outdated warning fixtures"
```

---

### Task 7: Error-code docs sync (error-codes reference)

**Files:**
- Modify: whatever renders the error-code reference in the validator (search).

- [ ] **Step 1: Find the error-code doc/table**

Run: `grep -rl "SCHEMA_INVALID\|EMPTY_FRAME" docs README.md 2>/dev/null`
If the codes are documented in a table/markdown, add rows for
`SCHEMA_MAJOR_UNSUPPORTED` and `VALIDATOR_MAYBE_OUTDATED` matching the existing
format. If the doc is generated from `shared/error-codes.json`, no manual edit is
needed — note that in the commit.

- [ ] **Step 2: Commit (if anything changed)**

```bash
git add -A docs README.md
git commit -m "docs: document SCHEMA_MAJOR_UNSUPPORTED + VALIDATOR_MAYBE_OUTDATED"
```

---

### Task 8: Fold in the v1.4.0 schema sync + auto-republish CI

**Files:**
- Modify: `.github/workflows/sync-from-spec.yml`
- Create: `.github/workflows/auto-tag-on-sync-merge.yml`

- [ ] **Step 1: Bump patch version during sync**

In `sync-from-spec.yml`, in the "Update vendored schema + provenance" step (only
runs when `changed == 'true'`), also bump the TS package patch version. Append to
that step's script:

```bash
          # Auto-republish: a pure schema sync is a patch bump of the validator.
          cd packages/ts
          npm version patch --no-git-tag-version
          cd -
```

And add `packages/ts/package.json packages/ts/package-lock.json` to what the PR
commits (peter-evans/create-pull-request already commits all working-tree
changes, so the version bump + rebuilt bundle are included).

Update the PR body to note the bump. Change the PR `title`/`body` lines to
mention "and bumps the validator patch version for auto-republish".

- [ ] **Step 2: Add an auto-tag workflow on merge of the sync PR**

`.github/workflows/auto-tag-on-sync-merge.yml`:

```yaml
name: Auto-tag on schema-sync merge

on:
  pull_request:
    types: [closed]
    branches: [main]

permissions:
  contents: write

jobs:
  tag:
    # Only when a merged PR came from an auto/schema-sync-* branch.
    if: >
      github.event.pull_request.merged == true &&
      startsWith(github.event.pull_request.head.ref, 'auto/schema-sync-')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          ref: main
          fetch-depth: 0
      - name: Tag the merged validator version
        run: |
          VERSION="v$(node -p "require('./packages/ts/package.json').version")"
          if git rev-parse -q --verify "refs/tags/$VERSION"; then
            echo "Tag $VERSION already exists; skipping."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag -a "$VERSION" -m "$VERSION — auto-republish (schema sync)"
          git push origin "$VERSION"
```

The pushed tag triggers the existing `release-ts.yml` → npm publish.

- [ ] **Step 3: Validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/sync-from-spec.yml')); yaml.safe_load(open('.github/workflows/auto-tag-on-sync-merge.yml')); print('YAML OK')"`
Expected: `YAML OK`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/sync-from-spec.yml .github/workflows/auto-tag-on-sync-merge.yml
git commit -m "ci: auto-bump validator patch on schema sync + auto-tag on merge"
```

---

### Task 9: Sync vendored schema to v1.4.0, bundle, release

**Files:**
- Modify: `shared/schema/ocf-action-v1.json`, `shared/schema/PROVENANCE.md`, `packages/ts/dist/browser/*`, `packages/ts/package.json`

- [ ] **Step 1: Bring the vendored schema to v1.4.0**

The pending auto-sync PR #23 already carries the v1.4.0 schema + rebuilt bundle.
Either merge PR #23 first and rebase this branch on top, OR sync manually:

Run (manual sync, if #23 not merged):
```bash
gh api "repos/opencoachingformat/spec/contents/schema/v1.json?ref=v1.4.0" --jq '.content' | base64 -d > shared/schema/ocf-action-v1.json
grep -m1 x-ocf-version shared/schema/ocf-action-v1.json   # -> "1.4.0"
```
Update `shared/schema/PROVENANCE.md` to reference `v1.4.0`.

- [ ] **Step 2: Bump validator to the release version + rebuild bundle**

The new public API (`validateAsync`, `Result.schema`) is a **minor**, so set the
version deliberately rather than a patch:
```bash
cd packages/ts && npm version minor --no-git-tag-version && cd -   # 0.1.1 -> 0.2.0
cd packages/ts && npm ci && npm run build && cd -
git diff --exit-code -- packages/ts/dist/browser   # must be clean after commit of the rebuild
```

- [ ] **Step 3: Run both full suites**

Run: `cd packages/ts && npm test`
Run: `cd packages/py && python -m pytest -q`
Expected: all green against the v1.4.0 schema.

- [ ] **Step 4: Commit, PR, merge, tag**

```bash
git add shared/schema/ocf-action-v1.json shared/schema/PROVENANCE.md packages/ts/package.json packages/ts/package-lock.json packages/ts/dist
git commit -m "feat: version-aware validator 0.2.0 (schema v1.4.0, guard + gap + async)"
git push -u origin <branch>
gh pr create --repo opencoachingformat/ocf-validator --base main --title "Version-aware validator 0.2.0" --body "Major guard, outdated warning, Result.schema, validateAsync, auto-republish CI. Schema synced to v1.4.0."
# after CI green + human approval:
gh pr merge <n> --repo opencoachingformat/ocf-validator --squash --delete-branch
git checkout main && git pull origin main
git tag -a v0.2.0 -m "v0.2.0 — version-aware validator"
git push origin v0.2.0
```

- [ ] **Step 5: Verify the npm release**

```bash
npm view @opencoachingformat/validator version    # -> 0.2.0
```
And confirm the browser bundle exports `validateAsync`:
```bash
curl -s "https://cdn.jsdelivr.net/npm/@opencoachingformat/validator@0.2.0/dist/browser/browser.js" | grep -c validateAsync   # >= 1
```

---

## Self-Review Notes

- **Spec coverage (Strand B):** B1 schemaInfo → Task 2; B2 major guard → Task 3/5; B3 minor-gap warn + fetch → Task 3/5 (warn) + Task 4 (fetch); B4 API split (`validate` sync / `validateAsync`) → Task 3/4; B5 `Result.schema` → Task 3/5; B6 codes → Task 1; B7 auto-republish → Task 8/9.
- **Conformance parity:** the deterministic signals (guard, warning, block) are mirrored TS+Python (Task 3/5) with shared fixtures (Task 6). The async fetch is TS-only and does NOT affect conformance (Python never fetches) — called out in the architecture note.
- **`assemble` signature change** (TS) and `_assemble` (Py) both gain the schema block; the plan flags updating the other caller (`validate_file`) and any test asserting the old `Result` shape.
- **Version bump is a MINOR** (0.1.1 → 0.2.0) because the public API grew; the CI auto-republish (Task 8) is for the pure-patch schema-sync case only.
- **Fetch is dependency-injected** in tests (`fetchImpl`), so no real network in the suite.
