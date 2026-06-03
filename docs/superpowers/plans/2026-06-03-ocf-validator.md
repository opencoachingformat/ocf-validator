# OCF Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reference OCF validator — a TypeScript library + CLI (Python mirror to follow) that checks an OCF document against the schema and the semantic rules the schema can't express, sharing one language-neutral conformance suite.

**Architecture:** Monorepo. `shared/` holds the language-neutral contract (model schema copy, error-code registry, conformance fixtures + expected results). `packages/ts` is the lead implementation: a two-level pipeline (schema delegate then semantic engine) returning a structured `{valid, errors, warnings}` result, wrapped by a thin CLI. Both packages run the same `shared/conformance` suite in CI. Python (`packages/py`) is built last, mirrored against the identical suite.

**Tech Stack:** TypeScript, Node >=18, `ajv` + `ajv-formats` (schema), `vitest` (tests), `tsup` (build), `picocolors` (CLI). Python phase: `jsonschema`, `pytest`, `click`.

**Reference:** `docs/superpowers/specs/2026-06-03-ocf-validator-design.md`. Schema source: spec repo `schema/v1.json` @ `5e18b5d`, at `../ocf-repo/schema/v1.json` in this workspace.

---

## File Structure

```
ocf-validator/
├── shared/
│   ├── schema/ocf-action-v1.json        # copy of spec schema (provenance note)
│   ├── error-codes.json                 # code -> {severity, category, message, spec_ref}
│   └── conformance/
│       ├── valid/*.ocf.json
│       ├── invalid/*.json
│       └── cases.json                   # fixture -> expected {valid, codes[]}
├── packages/ts/
│   ├── package.json / tsconfig.json / vitest.config.ts / tsup via npm script
│   ├── src/
│   │   ├── types.ts        # Issue, Result, OcfDoc
│   │   ├── codes.ts        # loads shared/error-codes.json, makeIssue()
│   │   ├── schema-level.ts # Level 0: ajv + legacy-model gate
│   │   ├── context.ts      # entity/ball/frame indexes
│   │   ├── possession.ts   # per-frame ball-possession engine
│   │   ├── named-positions.ts
│   │   ├── court-dimensions.ts
│   │   ├── rules/references.ts
│   │   ├── rules/possession-rules.ts
│   │   ├── rules/coherence.ts
│   │   ├── rules/quality.ts
│   │   ├── validate.ts     # Level 0 -> Level 1; validateFile()
│   │   ├── cli.ts
│   │   └── index.ts
│   └── test/
│       ├── conformance.test.ts
│       └── unit/*.test.ts
├── packages/py/            # Phase 2 (Tasks 16-18), mirrors the TS surface
├── .github/workflows/ci.yml
├── README.md / LICENSE
```

Each `rules/*` module exports one pure function `(doc, ctx) -> Issue[]`, so rules are independently testable and the orchestrator concatenates their output.

**Note on the steps below:** every code block is the actual content to write. Follow TDD order (failing test -> run -> implement -> run -> commit) within each task.

---

## Task 1: Scaffold the TS package + shared schema copy

**Files:**
- Create: `shared/schema/ocf-action-v1.json` (copy), `shared/schema/PROVENANCE.md`
- Create: `packages/ts/package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Copy the schema with a provenance note**

```bash
cd ocf-validator
mkdir -p shared/schema
cp ../ocf-repo/schema/v1.json shared/schema/ocf-action-v1.json
printf '%s\n' \
  '# Schema provenance' '' \
  '`ocf-action-v1.json` is copied verbatim from the spec repo:' \
  '`opencoachingformat/spec` -> `schema/v1.json` @ commit `5e18b5d`.' \
  'Re-sync deliberately; do not hand-edit.' > shared/schema/PROVENANCE.md
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
.venv/
__pycache__/
*.pyc
.DS_Store
```

- [ ] **Step 3: Create `packages/ts/package.json`**

```json
{
  "name": "@ocf/validator",
  "version": "0.1.0",
  "description": "Reference validator for the Open Coaching Format",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": { "ocf-validate": "./dist/cli.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts src/cli.ts --format esm --dts --clean",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1",
    "picocolors": "^1.1.1"
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 4: Create `packages/ts/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: Create `packages/ts/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: false } });
```

- [ ] **Step 6: Install and verify**

Run: `cd packages/ts && npm install && npx tsc --noEmit`
Expected: install succeeds; `tsc` exits 0 (no source files yet).

- [ ] **Step 7: Commit**

```bash
cd ../.. && git add -A && git commit -m "chore: scaffold TS package and copy model schema"
```

---

## Task 2: Error-code registry + types

**Files:**
- Create: `shared/error-codes.json`, `packages/ts/src/types.ts`, `packages/ts/src/codes.ts`
- Test: `packages/ts/test/unit/codes.test.ts`

- [ ] **Step 1: Write `shared/error-codes.json`**

```json
{
  "SCHEMA_INVALID":            { "severity": "error",   "category": "schema",         "message": "Schema validation failed: {detail}", "spec_ref": "schema/v1.json" },
  "MODEL_LEGACY":              { "severity": "error",   "category": "schema",         "message": "Document uses the superseded geometric model (entity_states/lines). Use the action model (actions/balls/end_state).", "spec_ref": "design §1" },
  "JSON_PARSE":                { "severity": "error",   "category": "schema",         "message": "File is not valid JSON: {detail}", "spec_ref": "design §5" },
  "REF_ENTITY_UNKNOWN":        { "severity": "error",   "category": "reference",      "message": "References unknown entity '{ref}'.", "spec_ref": "design §4-A" },
  "REF_BALL_UNKNOWN":          { "severity": "error",   "category": "reference",      "message": "References unknown ball '{ref}'.", "spec_ref": "design §4-A" },
  "REF_BRANCH_TARGET_UNKNOWN": { "severity": "error",   "category": "reference",      "message": "Branch outcome '{outcome}' targets unknown frame '{ref}'.", "spec_ref": "design §4-A" },
  "REF_NAMED_POS_UNKNOWN":     { "severity": "error",   "category": "reference",      "message": "Unknown named position '{ref}'.", "spec_ref": "design §4-A" },
  "BALL_CARRIER_MISMATCH":     { "severity": "error",   "category": "ball-possession","message": "Player '{player}' performs {action} but does not carry ball '{ball_id}'.", "spec_ref": "design §4-B" },
  "BALL_NOT_AT_LOCATION":      { "severity": "error",   "category": "ball-possession","message": "Player '{player}' performs {action} but no ball is available to pick up.", "spec_ref": "design §4-B" },
  "BALL_AMBIGUOUS":            { "severity": "error",   "category": "ball-possession","message": "Action by '{player}' omits ball_id but {count} balls are in play.", "spec_ref": "design §4-B" },
  "ACTION_UNUSUAL_CARRIER":    { "severity": "warning", "category": "ball-possession","message": "Defense player '{player}' performs {action}; unusual but allowed.", "spec_ref": "design §4-B" },
  "END_STATE_DISAGREE":        { "severity": "error",   "category": "coherence",      "message": "end_state for '{ref}' disagrees with action endpoint.", "spec_ref": "design §4-C" },
  "START_STATE_DISCONTINUITY": { "severity": "warning", "category": "coherence",      "message": "start_state for '{ref}' differs from previous frame's end_state.", "spec_ref": "design §4-C" },
  "CONTRAST_LOW":              { "severity": "warning", "category": "quality",        "message": "color_scheme '{ref}' contrast {ratio} is below 4.5:1.", "spec_ref": "spec §780" },
  "ENTITY_OFFCOURT":           { "severity": "warning", "category": "quality",        "message": "Coordinate ({x},{y}) lies outside the {ruleset} court.", "spec_ref": "design §4-D" },
  "EMPTY_FRAME":               { "severity": "warning", "category": "quality",        "message": "Frame '{ref}' has no actions and no state change.", "spec_ref": "design §4-D" }
}
```

- [ ] **Step 2: Write `packages/ts/src/types.ts`**

```ts
export type Severity = "error" | "warning";

export interface Issue {
  code: string;
  severity: Severity;
  message: string;
  path: string;            // JSON-Pointer
  frame?: string;          // human anchor (frame id)
  spec_ref?: string;
  data?: Record<string, unknown>;
}

export interface Result {
  valid: boolean;          // true iff no errors
  errors: Issue[];
  warnings: Issue[];
  summary: { errors: number; warnings: number };
}

export type OcfDoc = Record<string, unknown>;
```

- [ ] **Step 3: Write the failing test `packages/ts/test/unit/codes.test.ts`**

```ts
import { test, expect } from "vitest";
import { makeIssue, CODES } from "../../src/codes.js";

test("makeIssue fills template and severity from the registry", () => {
  const issue = makeIssue("BALL_CARRIER_MISMATCH", "/frames/2/actions/0", {
    player: "offense_2", action: "pass", ball_id: "ball_1",
  }, "frame_3");
  expect(issue.severity).toBe("error");
  expect(issue.message).toBe(
    "Player 'offense_2' performs pass but does not carry ball 'ball_1'.");
  expect(issue.path).toBe("/frames/2/actions/0");
  expect(issue.frame).toBe("frame_3");
  expect(issue.data).toMatchObject({ player: "offense_2" });
});

test("registry has an entry for documented codes", () => {
  expect(CODES.REF_BRANCH_TARGET_UNKNOWN.severity).toBe("error");
  expect(CODES.CONTRAST_LOW.severity).toBe("warning");
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `cd packages/ts && npx vitest run test/unit/codes.test.ts`
Expected: FAIL — cannot resolve `../../src/codes.js`.

- [ ] **Step 5: Write `packages/ts/src/codes.ts`**

```ts
import registry from "../../../shared/error-codes.json" with { type: "json" };
import type { Issue, Severity } from "./types.js";

interface CodeDef { severity: Severity; category: string; message: string; spec_ref?: string; }
export const CODES = registry as Record<string, CodeDef>;

function fill(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in data ? String(data[k]) : `{${k}}`);
}

export function makeIssue(
  code: string, path: string,
  data: Record<string, unknown> = {}, frame?: string,
): Issue {
  const def = CODES[code];
  if (!def) throw new Error(`Unknown error code: ${code}`);
  return {
    code, severity: def.severity, message: fill(def.message, data), path,
    ...(frame ? { frame } : {}),
    ...(def.spec_ref ? { spec_ref: def.spec_ref } : {}),
    ...(Object.keys(data).length ? { data } : {}),
  };
}
```

- [ ] **Step 6: Run to confirm pass**

Run: `npx vitest run test/unit/codes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: error-code registry, Issue/Result types, makeIssue()"
```

---

## Task 3: Result assembly + public `validate()` skeleton

**Files:**
- Create: `packages/ts/src/validate.ts`, `packages/ts/src/index.ts`
- Test: `packages/ts/test/unit/validate-skeleton.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { validate } from "../../src/validate.js";

const MINIMAL_VALID_DOC = {
  $schema: "https://opencoachingformat.org/schema/v1.json",
  meta: { id: "00000000-0000-4000-8000-000000000001", title: "t" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
  frames: [{ id: "f1", actions: [], end_state: {} }],
};

test("a doc with no issues is valid with empty arrays", () => {
  const res = validate(MINIMAL_VALID_DOC);
  expect(res.valid).toBe(true);
  expect(res.errors).toEqual([]);
  expect(res.summary).toEqual({ errors: 0, warnings: 0 });
});

test("validate throws only for non-object input", () => {
  // @ts-expect-error intentional misuse
  expect(() => validate(null)).toThrow(/expected an object/i);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run test/unit/validate-skeleton.test.ts`
Expected: FAIL — `validate` not found.

- [ ] **Step 3: Write `packages/ts/src/validate.ts` (skeleton)**

```ts
import type { Issue, Result, OcfDoc } from "./types.js";

export function assemble(issues: Issue[]): Result {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return {
    valid: errors.length === 0, errors, warnings,
    summary: { errors: errors.length, warnings: warnings.length },
  };
}

export function validate(doc: OcfDoc): Result {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new TypeError("validate: expected an object (parsed OCF document)");
  }
  const issues: Issue[] = [];
  // Level 0 (schema) and Level 1 (semantics) appended in later tasks.
  return assemble(issues);
}
```

- [ ] **Step 4: Write `packages/ts/src/index.ts`**

```ts
export { validate } from "./validate.js";
export type { Issue, Result, Severity, OcfDoc } from "./types.js";
```

- [ ] **Step 5: Run to confirm pass**

Run: `npx vitest run test/unit/validate-skeleton.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: validate() skeleton + result assembly"
```

---

## Task 4: Level 0 — schema validation + legacy-model gate

**Files:**
- Create: `packages/ts/src/schema-level.ts`
- Modify: `packages/ts/src/validate.ts`
- Test: `packages/ts/test/unit/schema-level.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { validate } from "../../src/validate.js";

const base = {
  $schema: "https://opencoachingformat.org/schema/v1.json",
  meta: { id: "00000000-0000-4000-8000-000000000001", title: "t" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
  frames: [{ id: "f1", actions: [], end_state: {} }],
};

test("a schema-valid minimal doc passes Level 0", () => {
  expect(validate(base).valid).toBe(true);
});

test("a missing required field yields SCHEMA_INVALID and stops", () => {
  const bad = { ...base, frames: [{ id: "f1" }] };
  const res = validate(bad);
  expect(res.valid).toBe(false);
  expect(res.errors.some((e) => e.code === "SCHEMA_INVALID")).toBe(true);
});

test("legacy geometric model is rejected with MODEL_LEGACY", () => {
  const legacy = { ...base,
    frames: [{ id: "f1", entity_states: { offense_1: { x: 0, y: 0 } },
               lines: [{ type: "movement", from_entity: "offense_1", coords: [] }] }] };
  const res = validate(legacy);
  expect(res.errors[0].code).toBe("MODEL_LEGACY");
  expect(res.errors.some((e) => e.code === "SCHEMA_INVALID")).toBe(false);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run test/unit/schema-level.test.ts`
Expected: FAIL — legacy/schema handling not implemented.

- [ ] **Step 3: Write `packages/ts/src/schema-level.ts`**

```ts
import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import schema from "../../../shared/schema/ocf-action-v1.json" with { type: "json" };
import type { Issue, OcfDoc } from "./types.js";
import { makeIssue } from "./codes.js";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema as object);

function hasLegacyShape(doc: OcfDoc): boolean {
  const frames = (doc as { frames?: unknown }).frames;
  if (!Array.isArray(frames)) return false;
  return frames.some((f) =>
    f && typeof f === "object" && ("entity_states" in f || "lines" in f));
}

/** Non-empty result means STOP (do not run semantics). */
export function schemaLevel(doc: OcfDoc): Issue[] {
  if (hasLegacyShape(doc)) return [makeIssue("MODEL_LEGACY", "/frames", {})];
  if (validateSchema(doc)) return [];
  return (validateSchema.errors ?? []).map((e: ErrorObject) =>
    makeIssue("SCHEMA_INVALID", e.instancePath || "/", {
      detail: `${e.instancePath || "(root)"} ${e.message ?? ""}`.trim(),
    }));
}
```

- [ ] **Step 4: Wire Level 0 into `validate.ts`** — add the import and replace the body after the type guard:

```ts
import { schemaLevel } from "./schema-level.js";
```

```ts
  const issues: Issue[] = [];
  const level0 = schemaLevel(doc);
  if (level0.length > 0) return assemble(level0); // stop on schema/legacy failure
  // Level 1 (semantics) appended in later tasks.
  return assemble(issues);
```

- [ ] **Step 5: Run to confirm pass**

Run: `npx vitest run test/unit/schema-level.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: Level 0 schema validation + legacy-model gate"
```

---

## Task 5: Document context — entities, balls, frame index

**Files:**
- Create: `packages/ts/src/context.ts`
- Test: `packages/ts/test/unit/context.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { buildContext } from "../../src/context.js";

const doc = {
  entities: [
    { type: "offense", nr: 1, x: 0, y: 5 },
    { type: "defense", nr: 1, x: 0, y: 6 },
  ],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  court: { ruleset: "fiba", type: "half_court" },
  frames: [{ id: "f1", actions: [], end_state: {} }],
};

test("buildContext indexes entity refs, balls, frame ids", () => {
  const ctx = buildContext(doc);
  expect(ctx.entityRefs.has("offense_1")).toBe(true);
  expect(ctx.entityRefs.get("defense_1")!.type).toBe("defense");
  expect(ctx.ballIds.has("ball_1")).toBe(true);
  expect(ctx.frameIds.has("f1")).toBe(true);
  expect(ctx.ruleset).toBe("fiba");
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run test/unit/context.test.ts`
Expected: FAIL — `buildContext` not found.

- [ ] **Step 3: Write `packages/ts/src/context.ts`**

```ts
import type { OcfDoc } from "./types.js";

export interface EntityInfo { type: string; nr?: number; }
export interface DocContext {
  entityRefs: Map<string, EntityInfo>;
  ballIds: Set<string>;
  frameIds: Set<string>;
  ruleset: string;
}

function entityRef(e: Record<string, unknown>): string | null {
  const type = e.type as string | undefined;
  if (!type) return null;
  if (type === "ball" || type === "coach") return type;
  if ("nr" in e) return `${type}_${e.nr}`;
  return type;
}

export function buildContext(doc: OcfDoc): DocContext {
  const entityRefs = new Map<string, EntityInfo>();
  for (const e of (((doc as { entities?: unknown[] }).entities ?? []) as Record<string, unknown>[])) {
    const ref = entityRef(e);
    if (ref) entityRefs.set(ref, { type: e.type as string, nr: e.nr as number | undefined });
  }
  const ballIds = new Set<string>();
  for (const b of (((doc as { balls?: unknown[] }).balls ?? []) as Record<string, unknown>[])) {
    if (typeof b.id === "string") ballIds.add(b.id);
  }
  const frameIds = new Set<string>();
  for (const f of (((doc as { frames?: unknown[] }).frames ?? []) as Record<string, unknown>[])) {
    if (typeof f.id === "string") frameIds.add(f.id);
  }
  const ruleset = ((doc as { court?: { ruleset?: string } }).court?.ruleset) ?? "custom";
  return { entityRefs, ballIds, frameIds, ruleset };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run test/unit/context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: document context (entity/ball/frame indexes)"
```

---

## Task 6: Reference-integrity rules (entity/ball/branch refs)

**Files:**
- Create: `packages/ts/src/rules/references.ts`
- Test: `packages/ts/test/unit/references.test.ts`

Covers `REF_ENTITY_UNKNOWN`, `REF_BALL_UNKNOWN`, `REF_BRANCH_TARGET_UNKNOWN`.
(`REF_NAMED_POS_UNKNOWN` is added in Task 7.)

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { buildContext } from "../../src/context.js";
import { referenceRules } from "../../src/rules/references.js";

function run(doc: any) { return referenceRules(doc, buildContext(doc)); }

test("unknown branch target is flagged", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [
      { id: "f1", actions: [{ player: "offense_1", type: "shoot" }],
        end_state: {}, branches: { make: "f2", miss: "f9" } },
      { id: "f2", actions: [], end_state: {} },
    ],
  };
  const issues = run(doc);
  expect(issues.map((i) => i.code)).toContain("REF_BRANCH_TARGET_UNKNOWN");
  const issue = issues.find((i) => i.code === "REF_BRANCH_TARGET_UNKNOWN")!;
  expect(issue.data).toMatchObject({ outcome: "miss", ref: "f9" });
  expect(issue.path).toBe("/frames/0/branches/miss");
});

test("action referencing an undeclared player is flagged", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_7", type: "move", moves: [] }], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "REF_ENTITY_UNKNOWN")).toBe(true);
});

test("a fully consistent doc yields no reference issues", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "shoot", ball_id: "ball_1" }],
      end_state: {}, branches: { make: "f1" } }],
  };
  expect(run(doc)).toEqual([]);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run test/unit/references.test.ts`
Expected: FAIL — `referenceRules` not found.

- [ ] **Step 3: Write `packages/ts/src/rules/references.ts`**

```ts
import type { Issue, OcfDoc } from "../types.js";
import type { DocContext } from "../context.js";
import { makeIssue } from "../codes.js";

const ENTITY_KEYS = ["player", "for_player", "on_player", "to_player"] as const;

export function referenceRules(doc: OcfDoc, ctx: DocContext): Issue[] {
  const issues: Issue[] = [];
  const frames = (((doc as { frames?: unknown[] }).frames ?? []) as Record<string, unknown>[]);

  frames.forEach((frame, fi) => {
    const frameId = frame.id as string | undefined;
    const actions = (frame.actions ?? []) as Record<string, unknown>[];
    actions.forEach((action, ai) => {
      for (const key of ENTITY_KEYS) {
        const ref = action[key];
        if (typeof ref === "string" && !ctx.entityRefs.has(ref)) {
          issues.push(makeIssue("REF_ENTITY_UNKNOWN",
            `/frames/${fi}/actions/${ai}/${key}`, { ref }, frameId));
        }
      }
      const ballId = action.ball_id;
      if (typeof ballId === "string" && !ctx.ballIds.has(ballId)) {
        issues.push(makeIssue("REF_BALL_UNKNOWN",
          `/frames/${fi}/actions/${ai}/ball_id`, { ref: ballId }, frameId));
      }
    });
    const branches = (frame.branches ?? {}) as Record<string, unknown>;
    for (const [outcome, target] of Object.entries(branches)) {
      if (typeof target === "string" && !ctx.frameIds.has(target)) {
        issues.push(makeIssue("REF_BRANCH_TARGET_UNKNOWN",
          `/frames/${fi}/branches/${outcome}`, { outcome, ref: target }, frameId));
      }
    }
  });
  return issues;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run test/unit/references.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: reference-integrity rules (entity/ball/branch refs)"
```

---

## Task 7: Named-position registry + REF_NAMED_POS_UNKNOWN

**Files:**
- Create: `packages/ts/src/named-positions.ts`
- Modify: `packages/ts/src/rules/references.ts`
- Test: `packages/ts/test/unit/named-positions.test.ts`

- [ ] **Step 1: Inspect the schema's named-position definition**

Run: `cd packages/ts && node -e "const s=require('../../shared/schema/ocf-action-v1.json');console.log(JSON.stringify(s.definitions.coordinate_named,null,1))"`
Expected: prints `coordinate_named`. Note whether `named` has an `enum` (canonical list) or is free-form.

- [ ] **Step 2: Write `packages/ts/src/named-positions.ts`**

```ts
// Canonical named positions, mirrored from the schema coordinate_named.named enum.
import schema from "../../../shared/schema/ocf-action-v1.json" with { type: "json" };

function fromSchema(): Set<string> {
  const def = (schema as any).definitions?.coordinate_named;
  const enumVals: string[] = def?.properties?.named?.enum ?? [];
  return new Set(enumVals);
}
export const CANONICAL_NAMED = fromSchema();

export function knownNamed(doc: Record<string, unknown>): Set<string> {
  const set = new Set(CANONICAL_NAMED);
  const custom = (doc.named_positions ?? []) as Record<string, unknown>[];
  for (const p of custom) if (typeof p.name === "string") set.add(p.name);
  return set;
}
```

> If Step 1 shows `named` is free-form (no enum), CANONICAL_NAMED is empty and
> only document-declared `named_positions` count; adjust the first test below to
> match that reality before it can pass.

- [ ] **Step 3: Write the failing test**

```ts
import { test, expect } from "vitest";
import { buildContext } from "../../src/context.js";
import { referenceRules } from "../../src/rules/references.js";

test("a named coordinate not in the registry is flagged", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "move",
                 moves: [{ to: { named: "not_a_real_spot" } }] }],
      end_state: {} }],
  };
  expect(referenceRules(doc, buildContext(doc))
    .some((i) => i.code === "REF_NAMED_POS_UNKNOWN")).toBe(true);
});

test("a document-declared named position is accepted", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    named_positions: [{ name: "my_spot", x: 1, y: 1 }],
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "move",
                 moves: [{ to: { named: "my_spot" } }] }],
      end_state: {} }],
  };
  expect(referenceRules(doc, buildContext(doc))
    .some((i) => i.code === "REF_NAMED_POS_UNKNOWN")).toBe(false);
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `npx vitest run test/unit/named-positions.test.ts`
Expected: FAIL — named coordinates not yet walked.

- [ ] **Step 5: Add the named-coordinate walk to `references.ts`**

Add this import and helper near the top:

```ts
import { knownNamed } from "../named-positions.js";

function walkNamed(
  node: unknown, pointer: string, known: Set<string>,
  frameId: string | undefined, out: Issue[],
): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkNamed(v, `${pointer}/${i}`, known, frameId, out));
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.named === "string" && !known.has(obj.named)) {
      out.push(makeIssue("REF_NAMED_POS_UNKNOWN",
        `${pointer}/named`, { ref: obj.named }, frameId));
    }
    for (const [k, v] of Object.entries(obj)) {
      walkNamed(v, `${pointer}/${k}`, known, frameId, out);
    }
  }
}
```

Inside `referenceRules`, compute `const known = knownNamed(doc as Record<string, unknown>);`
once before the frame loop, and inside the loop (after branches handling) add:

```ts
    walkNamed(frame.actions, `/frames/${fi}/actions`, known, frameId, issues);
    walkNamed(frame.end_state, `/frames/${fi}/end_state`, known, frameId, issues);
    walkNamed(frame.start_state, `/frames/${fi}/start_state`, known, frameId, issues);
```

- [ ] **Step 6: Run to confirm pass**

Run: `npx vitest run test/unit/named-positions.test.ts test/unit/references.test.ts`
Expected: PASS. (Adjust per Step 2 note if the schema is free-form.)

- [ ] **Step 7: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: named-position registry + REF_NAMED_POS_UNKNOWN"
```

---

## Task 8: Ball-possession engine

**Files:**
- Create: `packages/ts/src/possession.ts`
- Test: `packages/ts/test/unit/possession.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { possessionByFrame } from "../../src/possession.js";

test("initial possession comes from balls[] carried_by", () => {
  const doc = {
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    frames: [{ id: "f1", actions: [], end_state: {} }],
  };
  const states = possessionByFrame(doc);
  expect(states[0].carrierOf("ball_1")).toBe("offense_1");
  expect(states[0].ballCount).toBe(1);
});

test("end_state.balls updates possession for the next frame", () => {
  const doc = {
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    frames: [
      { id: "f1", actions: [], end_state: { balls: { ball_1: { carried_by: "offense_2" } } } },
      { id: "f2", actions: [], end_state: {} },
    ],
  };
  const states = possessionByFrame(doc);
  expect(states[0].carrierOf("ball_1")).toBe("offense_1");
  expect(states[1].carrierOf("ball_1")).toBe("offense_2");
});

test("a loose ball (at) has no carrier", () => {
  const doc = {
    balls: [{ id: "ball_1", at: { x: 0, y: 0 } }],
    frames: [{ id: "f1", actions: [], end_state: {} }],
  };
  const states = possessionByFrame(doc);
  expect(states[0].carrierOf("ball_1")).toBeNull();
  expect(states[0].looseAt("ball_1")).toEqual({ x: 0, y: 0 });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run test/unit/possession.test.ts`
Expected: FAIL — `possessionByFrame` not found.

- [ ] **Step 3: Write `packages/ts/src/possession.ts`**

```ts
import type { OcfDoc } from "./types.js";

export interface FrameState {
  carrierOf(ballId: string): string | null;
  looseAt(ballId: string): { x?: number; y?: number; named?: string } | null;
  ballCount: number;
}

interface BallState {
  carried_by?: string;
  at?: { x?: number; y?: number; named?: string };
  dead?: boolean;
}

function makeFrameState(map: Map<string, BallState>): FrameState {
  return {
    ballCount: [...map.values()].filter((b) => !b.dead).length,
    carrierOf: (id) => map.get(id)?.carried_by ?? null,
    looseAt: (id) => map.get(id)?.at ?? null,
  };
}

export function possessionByFrame(doc: OcfDoc): FrameState[] {
  const current = new Map<string, BallState>();
  for (const b of (((doc as { balls?: unknown[] }).balls ?? []) as Record<string, unknown>[])) {
    if (typeof b.id === "string") {
      current.set(b.id, {
        carried_by: b.carried_by as string | undefined,
        at: b.at as BallState["at"],
        dead: b.dead as boolean | undefined,
      });
    }
  }
  const frames = (((doc as { frames?: unknown[] }).frames ?? []) as Record<string, unknown>[]);
  const states: FrameState[] = [];
  for (const frame of frames) {
    states.push(makeFrameState(new Map([...current].map(([k, v]) => [k, { ...v }]))));
    const endBalls = ((frame.end_state ?? {}) as Record<string, unknown>).balls as
      Record<string, BallState> | undefined;
    if (endBalls) {
      for (const [id, st] of Object.entries(endBalls)) current.set(id, { ...st });
    }
  }
  return states;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run test/unit/possession.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: per-frame ball-possession engine"
```

---

## Task 9: Ball-possession rules (BALL_*)

**Files:**
- Create: `packages/ts/src/rules/possession-rules.ts`
- Test: `packages/ts/test/unit/possession-rules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { buildContext } from "../../src/context.js";
import { possessionByFrame } from "../../src/possession.js";
import { possessionRules } from "../../src/rules/possession-rules.js";

function run(doc: any) {
  return possessionRules(doc, buildContext(doc), possessionByFrame(doc));
}

test("pass by a non-carrier is BALL_CARRIER_MISMATCH", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }, { type: "offense", nr: 2, x: 1, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_2", type: "pass", to_player: "offense_1", ball_id: "ball_1" }],
      end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "BALL_CARRIER_MISMATCH")).toBe(true);
});

test("pass by the actual carrier is clean", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }, { type: "offense", nr: 2, x: 1, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" }],
      end_state: {} }],
  };
  expect(run(doc).filter((i) => i.severity === "error")).toEqual([]);
});

test("omitting ball_id with two balls is BALL_AMBIGUOUS", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }, { id: "ball_2", at: { x: 3, y: 3 } }],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "dribble", moves: [] }], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "BALL_AMBIGUOUS")).toBe(true);
});

test("a defense player passing emits ACTION_UNUSUAL_CARRIER (warning)", () => {
  const doc = {
    entities: [{ type: "defense", nr: 1, x: 0, y: 5 }, { type: "offense", nr: 1, x: 1, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "defense_1" }],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "defense_1", type: "pass", to_player: "offense_1", ball_id: "ball_1" }],
      end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "ACTION_UNUSUAL_CARRIER" && i.severity === "warning")).toBe(true);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run test/unit/possession-rules.test.ts`
Expected: FAIL — `possessionRules` not found.

- [ ] **Step 3: Write `packages/ts/src/rules/possession-rules.ts`**

```ts
import type { Issue, OcfDoc } from "../types.js";
import type { DocContext } from "../context.js";
import type { FrameState } from "../possession.js";
import { makeIssue } from "../codes.js";

const BALL_DEPENDENT = new Set(["pass", "shoot", "dribble"]);
const PICKUP = new Set(["pickup", "rebound"]);

function resolveBallId(action: Record<string, unknown>, ctx: DocContext): string | "AMBIGUOUS" | null {
  if (typeof action.ball_id === "string") return action.ball_id;
  if (ctx.ballIds.size === 1) return [...ctx.ballIds][0];
  if (ctx.ballIds.size === 0) return null;
  return "AMBIGUOUS";
}

export function possessionRules(doc: OcfDoc, ctx: DocContext, states: FrameState[]): Issue[] {
  const issues: Issue[] = [];
  const frames = (((doc as { frames?: unknown[] }).frames ?? []) as Record<string, unknown>[]);

  frames.forEach((frame, fi) => {
    const frameId = frame.id as string | undefined;
    const state = states[fi];
    const actions = (frame.actions ?? []) as Record<string, unknown>[];

    actions.forEach((action, ai) => {
      const type = action.type as string;
      const player = action.player as string;
      const path = `/frames/${fi}/actions/${ai}`;

      if (BALL_DEPENDENT.has(type)) {
        const ball = resolveBallId(action, ctx);
        if (ball === "AMBIGUOUS") {
          issues.push(makeIssue("BALL_AMBIGUOUS", path, { player, count: ctx.ballIds.size }, frameId));
          return;
        }
        if (ball && state.carrierOf(ball) !== player) {
          issues.push(makeIssue("BALL_CARRIER_MISMATCH", path,
            { player, action: type, ball_id: ball }, frameId));
        }
        if (ctx.entityRefs.get(player)?.type === "defense") {
          issues.push(makeIssue("ACTION_UNUSUAL_CARRIER", path, { player, action: type }, frameId));
        }
      } else if (PICKUP.has(type)) {
        const ball = resolveBallId(action, ctx);
        if (ball === "AMBIGUOUS") {
          issues.push(makeIssue("BALL_AMBIGUOUS", path, { player, count: ctx.ballIds.size }, frameId));
        } else if (ball && state.looseAt(ball) === null && state.carrierOf(ball) !== null) {
          issues.push(makeIssue("BALL_NOT_AT_LOCATION", path, { player, action: type }, frameId));
        }
      }
    });
  });
  return issues;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run test/unit/possession-rules.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: ball-possession rules (mismatch, ambiguous, pickup, unusual carrier)"
```

---

## Task 10: Quality rules (off-court, empty-frame, low-contrast)

**Files:**
- Create: `packages/ts/src/court-dimensions.ts`, `packages/ts/src/rules/quality.ts`
- Test: `packages/ts/test/unit/quality.test.ts`

- [ ] **Step 1: Write `packages/ts/src/court-dimensions.ts`**

```ts
// Half-extents per ruleset; origin is court center. Values from spec court table.
export interface HalfExtent { x: number; y: number; }
const FULL: Record<string, { l: number; w: number }> = {
  fiba: { l: 28.0, w: 15.0 },
  nba:  { l: 94.0, w: 50.0 },
  ncaa: { l: 94.0, w: 50.0 },
  nfhs: { l: 84.0, w: 50.0 },
};
export function halfExtent(ruleset: string): HalfExtent | null {
  const f = FULL[ruleset];
  if (!f) return null;
  return { x: f.w / 2, y: f.l / 2 };
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { test, expect } from "vitest";
import { qualityRules } from "../../src/rules/quality.js";
import { buildContext } from "../../src/context.js";

function run(doc: any) { return qualityRules(doc, buildContext(doc)); }

test("a coordinate outside the FIBA court is ENTITY_OFFCOURT", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 99, y: 0 }],
    balls: [], court: { ruleset: "fiba", type: "full_court" },
    frames: [{ id: "f1", actions: [], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "ENTITY_OFFCOURT")).toBe(true);
});

test("an empty frame is EMPTY_FRAME", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
    balls: [], court: { ruleset: "fiba", type: "full_court" },
    frames: [{ id: "f1", actions: [], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "EMPTY_FRAME")).toBe(true);
});

test("low-contrast color_scheme is CONTRAST_LOW", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }],
    balls: [], court: { ruleset: "fiba", type: "full_court" },
    color_scheme: { offense: "#fefefe", background: "#ffffff" },
    frames: [{ id: "f1", actions: [{ player: "offense_1", type: "move", moves: [] }], end_state: {} }],
  };
  expect(run(doc).some((i) => i.code === "CONTRAST_LOW")).toBe(true);
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `npx vitest run test/unit/quality.test.ts`
Expected: FAIL — `qualityRules` not found.

- [ ] **Step 4: Write `packages/ts/src/rules/quality.ts`**

```ts
import type { Issue, OcfDoc } from "../types.js";
import type { DocContext } from "../context.js";
import { makeIssue } from "../codes.js";
import { halfExtent } from "../court-dimensions.js";

function relLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: string, b: string): number | null {
  const la = relLuminance(a), lb = relLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function* coords(node: unknown): Generator<{ x: number; y: number }> {
  if (Array.isArray(node)) { for (const v of node) yield* coords(v); }
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (typeof o.x === "number" && typeof o.y === "number") yield { x: o.x, y: o.y };
    for (const v of Object.values(o)) yield* coords(v);
  }
}

export function qualityRules(doc: OcfDoc, ctx: DocContext): Issue[] {
  const issues: Issue[] = [];

  const ext = halfExtent(ctx.ruleset);
  if (ext) {
    const entities = ((doc as { entities?: unknown[] }).entities ?? []);
    for (const c of coords(entities)) {
      if (Math.abs(c.x) > ext.x || Math.abs(c.y) > ext.y) {
        issues.push(makeIssue("ENTITY_OFFCOURT", "/entities",
          { x: c.x, y: c.y, ruleset: ctx.ruleset }));
        break;
      }
    }
  }

  const frames = (((doc as { frames?: unknown[] }).frames ?? []) as Record<string, unknown>[]);
  frames.forEach((frame, fi) => {
    const actions = (frame.actions ?? []) as unknown[];
    const endState = (frame.end_state ?? {}) as Record<string, unknown>;
    if (actions.length === 0 && Object.keys(endState).length === 0) {
      issues.push(makeIssue("EMPTY_FRAME", `/frames/${fi}`, {}, frame.id as string));
    }
  });

  const cs = (doc as { color_scheme?: Record<string, string> }).color_scheme;
  if (cs && typeof cs.background === "string") {
    for (const [role, color] of Object.entries(cs)) {
      if (role === "background" || typeof color !== "string") continue;
      const ratio = contrast(color, cs.background);
      if (ratio !== null && ratio < 4.5) {
        issues.push(makeIssue("CONTRAST_LOW", `/color_scheme/${role}`,
          { ref: role, ratio: ratio.toFixed(2) }));
      }
    }
  }
  return issues;
}
```

- [ ] **Step 5: Run to confirm pass**

Run: `npx vitest run test/unit/quality.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: quality rules (off-court, empty-frame, low-contrast)"
```

---

## Task 11: Coherence rules + wire Level 1 into validate()

**Files:**
- Create: `packages/ts/src/rules/coherence.ts`
- Modify: `packages/ts/src/validate.ts`
- Test: `packages/ts/test/unit/coherence.test.ts`, `packages/ts/test/unit/validate-full.test.ts`

- [ ] **Step 1: Write `packages/ts/src/rules/coherence.ts`** (pragmatic: explicit endpoints only)

```ts
import type { Issue, OcfDoc } from "../types.js";
import type { DocContext } from "../context.js";
import { makeIssue } from "../codes.js";

function coordKey(c: unknown): string | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  if (typeof o.named === "string") return `named:${o.named}`;
  if (typeof o.x === "number" && typeof o.y === "number") return `xy:${o.x},${o.y}`;
  return null;
}

export function coherenceRules(doc: OcfDoc, _ctx: DocContext): Issue[] {
  const issues: Issue[] = [];
  const frames = (((doc as { frames?: unknown[] }).frames ?? []) as Record<string, unknown>[]);

  frames.forEach((frame, fi) => {
    const frameId = frame.id as string | undefined;
    const endState = (frame.end_state ?? {}) as Record<string, unknown>;
    const actions = (frame.actions ?? []) as Record<string, unknown>[];

    for (const action of actions) {
      const player = action.player as string | undefined;
      if (!player || !(player in endState)) continue;
      const moves = action.moves as Array<Record<string, unknown>> | undefined;
      if (!moves || moves.length === 0) continue;
      const lastTo = moves[moves.length - 1]?.to;
      const endKey = coordKey(endState[player]);
      const toKey = coordKey(lastTo);
      if (endKey && toKey && endKey !== toKey) {
        issues.push(makeIssue("END_STATE_DISAGREE",
          `/frames/${fi}/end_state/${player}`, { ref: player }, frameId));
      }
    }

    const next = frames[fi + 1];
    if (next) {
      const start = (next.start_state ?? {}) as Record<string, unknown>;
      for (const [ref, coord] of Object.entries(start)) {
        if (ref === "balls") continue;
        const a = coordKey(coord), b = coordKey(endState[ref]);
        if (a && b && a !== b) {
          issues.push(makeIssue("START_STATE_DISCONTINUITY",
            `/frames/${fi + 1}/start_state/${ref}`, { ref }, next.id as string));
        }
      }
    }
  });
  return issues;
}
```

- [ ] **Step 2: Write the failing coherence test**

```ts
import { test, expect } from "vitest";
import { buildContext } from "../../src/context.js";
import { coherenceRules } from "../../src/rules/coherence.js";

test("end_state contradicting an explicit move endpoint is flagged", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "move", moves: [{ to: { x: 5, y: 5 } }] }],
      end_state: { offense_1: { x: 1, y: 1 } } }],
  };
  expect(coherenceRules(doc, buildContext(doc))
    .some((i) => i.code === "END_STATE_DISAGREE")).toBe(true);
});

test("variant move without explicit `to` is skipped (no false positive)", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "move", moves: [{ variant: "speed" }] }],
      end_state: { offense_1: { x: 9, y: 9 } } }],
  };
  expect(coherenceRules(doc, buildContext(doc))
    .some((i) => i.code === "END_STATE_DISAGREE")).toBe(false);
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `npx vitest run test/unit/coherence.test.ts`
Expected: FAIL — `coherenceRules` not found.

- [ ] **Step 4: Wire all Level-1 rules into `validate.ts`** — add imports:

```ts
import { buildContext } from "./context.js";
import { possessionByFrame } from "./possession.js";
import { referenceRules } from "./rules/references.js";
import { possessionRules } from "./rules/possession-rules.js";
import { coherenceRules } from "./rules/coherence.js";
import { qualityRules } from "./rules/quality.js";
```

…and replace the Level-1 placeholder (after the `level0` early-return) with:

```ts
  const ctx = buildContext(doc);
  const states = possessionByFrame(doc);
  issues.push(
    ...referenceRules(doc, ctx),
    ...possessionRules(doc, ctx, states),
    ...coherenceRules(doc, ctx),
    ...qualityRules(doc, ctx),
  );
  return assemble(issues);
```

- [ ] **Step 5: Write `packages/ts/test/unit/validate-full.test.ts`**

```ts
import { test, expect } from "vitest";
import { validate } from "../../src/validate.js";

test("a clean minimal doc has no errors after all rules", () => {
  const doc = {
    $schema: "https://opencoachingformat.org/schema/v1.json",
    meta: { id: "00000000-0000-4000-8000-000000000001", title: "t" },
    court: { ruleset: "fiba", type: "half_court" },
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "shoot", ball_id: "ball_1" }],
      end_state: { offense_1: { x: 0, y: 5 } } }],
  };
  const res = validate(doc);
  expect(res.errors).toEqual([]);
  expect(res.valid).toBe(true);
});
```

- [ ] **Step 6: Run to confirm pass**

Run: `npx vitest run`
Expected: PASS — all unit tests green.

- [ ] **Step 7: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: coherence rules + full Level-1 orchestration"
```

---

## Task 12: validateFile() + JSON_PARSE

**Files:**
- Modify: `packages/ts/src/validate.ts`, `packages/ts/src/index.ts`
- Test: `packages/ts/test/unit/validate-file.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateFile } from "../../src/validate.js";

const dir = mkdtempSync(join(tmpdir(), "ocf-"));

test("validateFile parses and validates a file", () => {
  const p = join(dir, "ok.json");
  writeFileSync(p, JSON.stringify({
    $schema: "x",
    meta: { id: "00000000-0000-4000-8000-000000000001", title: "t" },
    court: { ruleset: "fiba", type: "half_court" },
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    frames: [{ id: "f1", actions: [], end_state: { offense_1: { x: 0, y: 5 } } }],
  }));
  expect(validateFile(p).valid).toBe(true);
});

test("validateFile surfaces malformed JSON as JSON_PARSE", () => {
  const p = join(dir, "bad.json");
  writeFileSync(p, "{ not json ");
  const res = validateFile(p);
  expect(res.valid).toBe(false);
  expect(res.errors[0].code).toBe("JSON_PARSE");
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run test/unit/validate-file.test.ts`
Expected: FAIL — `validateFile` not found.

- [ ] **Step 3: Add `validateFile` to `validate.ts`** (add imports + function)

```ts
import { readFileSync } from "node:fs";
import { makeIssue } from "./codes.js";

export function validateFile(path: string): Result {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return assemble([makeIssue("JSON_PARSE", "/", { detail: (err as Error).message })]);
  }
  return validate(parsed as OcfDoc);
}
```

- [ ] **Step 4: Export from `index.ts`**

```ts
export { validate, validateFile } from "./validate.js";
```

- [ ] **Step 5: Run to confirm pass**

Run: `npx vitest run test/unit/validate-file.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: validateFile() with JSON_PARSE handling"
```

---

## Task 13: Seed the conformance suite + record actual codes

**Files:**
- Create: `shared/conformance/valid/*.ocf.json` (copy 4 examples)
- Create: `shared/conformance/invalid/*.json` (copy 6 fixtures + 2 new semantic fixtures)
- Create: `shared/conformance/cases.json`, `packages/ts/scripts/capture-codes.mjs`
- Test: `packages/ts/test/conformance.test.ts`

- [ ] **Step 1: Copy the spec repo's valid examples and invalid fixtures**

```bash
cd ocf-validator
mkdir -p shared/conformance/valid shared/conformance/invalid
cp ../ocf-repo/examples/*.ocf.json shared/conformance/valid/
cp ../ocf-repo/examples/invalid/*.json shared/conformance/invalid/
```

- [ ] **Step 2: Add two genuinely-semantic invalid fixtures**

Create `shared/conformance/invalid/sem-branch-target-missing.json`:

```json
{
  "$schema": "https://opencoachingformat.org/schema/v1.json",
  "meta": { "id": "00000000-0000-4000-8000-0000000000a1", "title": "branch to nowhere" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [{ "type": "offense", "nr": 1, "x": 0, "y": 5 }],
  "balls": [{ "id": "ball_1", "carried_by": "offense_1" }],
  "frames": [
    { "id": "f1",
      "actions": [{ "player": "offense_1", "type": "shoot", "ball_id": "ball_1" }],
      "end_state": {}, "branches": { "make": "does_not_exist" } }
  ]
}
```

Create `shared/conformance/invalid/sem-pass-non-carrier.json`:

```json
{
  "$schema": "https://opencoachingformat.org/schema/v1.json",
  "meta": { "id": "00000000-0000-4000-8000-0000000000a2", "title": "pass by non-carrier" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [
    { "type": "offense", "nr": 1, "x": 0, "y": 5 },
    { "type": "offense", "nr": 2, "x": 2, "y": 5 }
  ],
  "balls": [{ "id": "ball_1", "carried_by": "offense_1" }],
  "frames": [
    { "id": "f1",
      "actions": [{ "player": "offense_2", "type": "pass", "to_player": "offense_1", "ball_id": "ball_1" }],
      "end_state": {} }
  ]
}
```

- [ ] **Step 3: Write a capture script `packages/ts/scripts/capture-codes.mjs`**

```js
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { validateFile } from "../dist/index.js";

const root = new URL("../../../shared/conformance/", import.meta.url).pathname;

for (const sub of ["valid", "invalid"]) {
  const dir = join(root, sub);
  for (const f of readdirSync(dir)) {
    const res = validateFile(join(dir, f));
    console.log(`${sub}/${f}\t${res.valid}\t${res.errors.map((e) => e.code).join(",")}`);
  }
}
```

- [ ] **Step 4: Build and run the capture script to record ACTUAL codes**

Run:
```bash
cd packages/ts && npm run build && node scripts/capture-codes.mjs
```
Expected: one line per fixture. Each `invalid/*` line shows `false` and >=1 code; each `valid/*` line shows `true` with no codes. **If a valid example shows `false`, that is a real finding — investigate the rule or the schema copy before pinning.** Use this output to fill `cases.json` in Step 5.

- [ ] **Step 5: Write `shared/conformance/cases.json`** using the codes observed in Step 4

```json
{
  "valid": [
    { "file": "valid/pick-and-roll.ocf.json" },
    { "file": "valid/3-man-weave.ocf.json" },
    { "file": "valid/transition-3v2.ocf.json" },
    { "file": "valid/quick-mode.ocf.json" }
  ],
  "invalid": [
    { "file": "invalid/ball-carried-and-at.json",         "codes": ["SCHEMA_INVALID"] },
    { "file": "invalid/state-bad-ball-key.json",           "codes": ["SCHEMA_INVALID"] },
    { "file": "invalid/action-pass-missing-receiver.json", "codes": ["SCHEMA_INVALID"] },
    { "file": "invalid/action-unknown-type.json",          "codes": ["SCHEMA_INVALID"] },
    { "file": "invalid/frame-bad-branch-key.json",         "codes": ["SCHEMA_INVALID"] },
    { "file": "invalid/frame-missing-end-state.json",      "codes": ["SCHEMA_INVALID"] },
    { "file": "invalid/sem-branch-target-missing.json",    "codes": ["REF_BRANCH_TARGET_UNKNOWN"] },
    { "file": "invalid/sem-pass-non-carrier.json",         "codes": ["BALL_CARRIER_MISMATCH"] }
  ]
}
```

> Adjust each `codes` array to match Step 4's actual output. The conformance test
> uses subset matching: every listed code must appear; list the codes that
> genuinely characterize each fixture.

- [ ] **Step 6: Write `packages/ts/test/conformance.test.ts`**

```ts
import { test, expect, describe } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFile } from "../src/validate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..", "shared", "conformance");
const cases = JSON.parse(readFileSync(join(root, "cases.json"), "utf8")) as {
  valid: { file: string }[];
  invalid: { file: string; codes: string[] }[];
};

describe("valid fixtures pass", () => {
  for (const c of cases.valid) {
    test(c.file, () => {
      const res = validateFile(join(root, c.file));
      expect(res.errors, JSON.stringify(res.errors)).toEqual([]);
      expect(res.valid).toBe(true);
    });
  }
});

describe("invalid fixtures rejected with expected codes", () => {
  for (const c of cases.invalid) {
    test(c.file, () => {
      const res = validateFile(join(root, c.file));
      expect(res.valid).toBe(false);
      const got = new Set(res.errors.map((e) => e.code));
      for (const code of c.codes) expect(got.has(code)).toBe(true);
    });
  }
});
```

- [ ] **Step 7: Run the conformance suite**

Run: `cd packages/ts && npx vitest run test/conformance.test.ts`
Expected: PASS — all valid examples validate, all invalid fixtures rejected with their listed codes. (If a valid example fails here, fix the rule or schema copy — do not weaken the test.)

- [ ] **Step 8: Commit**

```bash
cd ../.. && git add -A && git commit -m "test: seed shared conformance suite (valid + invalid + semantic fixtures)"
```

---

## Task 14: CLI

**Files:**
- Create: `packages/ts/src/cli.ts`
- Test: `packages/ts/test/unit/cli.test.ts`

- [ ] **Step 1: Write the failing test (in-process, capturing output + exit code)**

```ts
import { test, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli.js";

const dir = mkdtempSync(join(tmpdir(), "ocf-cli-"));
function write(name: string, doc: unknown): string {
  const p = join(dir, name); writeFileSync(p, JSON.stringify(doc)); return p;
}
const good = {
  $schema: "x", meta: { id: "00000000-0000-4000-8000-000000000001", title: "t" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
  frames: [{ id: "f1", actions: [], end_state: { offense_1: { x: 0, y: 5 } } }],
};

test("exit 0 on a valid file", () => {
  const out: string[] = [];
  expect(runCli([write("ok.json", good)], { log: (s) => out.push(s) })).toBe(0);
});

test("exit 1 when errors are present", () => {
  const bad = { ...good, frames: [{ id: "f1" }] };
  const out: string[] = [];
  expect(runCli([write("bad.json", bad)], { log: (s) => out.push(s) })).toBe(1);
  expect(out.join("\n")).toMatch(/SCHEMA_INVALID/);
});

test("--json prints machine-readable result", () => {
  const out: string[] = [];
  expect(runCli(["--json", write("ok2.json", good)], { log: (s) => out.push(s) })).toBe(0);
  expect(() => JSON.parse(out.join("\n"))).not.toThrow();
});

test("--strict turns warnings into a failing exit code", () => {
  const warn = { ...good, frames: [{ id: "f1", actions: [], end_state: {} }] };
  const out: string[] = [];
  expect(runCli([write("warn.json", warn)], { log: (s) => out.push(s) })).toBe(0);
  expect(runCli(["--strict", write("warn2.json", warn)], { log: (s) => out.push(s) })).toBe(1);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run test/unit/cli.test.ts`
Expected: FAIL — `runCli` not found.

- [ ] **Step 3: Write `packages/ts/src/cli.ts`**

```ts
#!/usr/bin/env node
import pc from "picocolors";
import { validateFile } from "./validate.js";
import type { Result, Issue } from "./types.js";

interface Io { log: (s: string) => void; }

function formatIssue(i: Issue): string {
  const tag = i.severity === "error" ? pc.red("error") : pc.yellow("warn ");
  const loc = i.frame ? `${i.path} (${i.frame})` : i.path;
  return `  ${tag} ${pc.bold(i.code)} ${loc}\n        ${i.message}`;
}

function printHuman(file: string, res: Result, io: Io): void {
  if (res.valid && res.warnings.length === 0) { io.log(`${pc.green("ok")} ${file}`); return; }
  io.log(`${res.valid ? pc.yellow("warn") : pc.red("fail")} ${file}`);
  for (const e of res.errors) io.log(formatIssue(e));
  for (const w of res.warnings) io.log(formatIssue(w));
  io.log(`  ${res.summary.errors} error(s), ${res.summary.warnings} warning(s)`);
}

export function runCli(argv: string[], io: Io = { log: console.log }): number {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const files = argv.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    io.log("usage: ocf-validate [--json] [--quiet] [--strict] <file.ocf.json> ...");
    return 2;
  }
  const asJson = flags.has("--json"), quiet = flags.has("--quiet"), strict = flags.has("--strict");
  let worstExit = 0;
  const results: Record<string, Result> = {};
  for (const file of files) {
    const res = validateFile(file);
    results[file] = res;
    if (res.errors.length > 0 || (strict && res.warnings.length > 0)) worstExit = 1;
    if (!asJson && !quiet) printHuman(file, res, io);
  }
  if (asJson) io.log(JSON.stringify(results, null, 2));
  return worstExit;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runCli(process.argv.slice(2)));
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run test/unit/cli.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Build and smoke-test the real binary**

Run:
```bash
npm run build && node dist/cli.js ../../shared/conformance/valid/pick-and-roll.ocf.json; echo "exit=$?"
```
Expected: prints an `ok`/`warn` line and `exit=0`.

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat: ocf-validate CLI (human + --json + --strict, exit codes)"
```

---

## Task 15: CI + README + LICENSE

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`, `packages/ts/README.md`, `LICENSE`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on: [push, pull_request]
jobs:
  ts:
    name: TypeScript validator
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: packages/ts } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm install
      - run: npm run build
      - run: npm test
```

- [ ] **Step 2: Write repo-root `README.md`**

````markdown
# OCF Validator

Reference validator for the [Open Coaching Format](https://github.com/opencoachingformat/spec).
Checks an OCF document against the JSON Schema **and** the semantic rules the
schema cannot express (ball-possession consistency, branch-target integrity,
reference integrity), serving both authoring tools (LLM / editor) and the
rendering gate.

- `packages/ts` — TypeScript library + `ocf-validate` CLI (reference impl).
- `packages/py` — Python mirror (same conformance suite).
- `shared/` — language-neutral contract: model schema, error-code registry,
  conformance fixtures.

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
````

- [ ] **Step 3: Write `packages/ts/README.md`**

````markdown
# @ocf/validator

Reference TypeScript validator for the Open Coaching Format.

```ts
import { validate, validateFile } from "@ocf/validator";
const res = validate(doc);   // res.valid, res.errors, res.warnings, res.summary
```

CLI:

```
npx ocf-validate play.ocf.json [--json] [--quiet] [--strict]
```

Exit codes: `0` no errors, `1` errors (or warnings with `--strict`), `2` usage.
````

- [ ] **Step 4: Create `LICENSE` (match the spec repo)**

```bash
cp ../ocf-repo/LICENSE LICENSE
```

- [ ] **Step 5: Verify the full suite once more**

Run: `cd packages/ts && npm test`
Expected: PASS — unit + conformance all green.

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add -A && git commit -m "ci: CI workflow + README + LICENSE"
```

---

## Task 16: Python mirror — scaffold + Level 0 + result

**Files:**
- Create: `packages/py/pyproject.toml`, `packages/py/ocf_validator/{__init__,types,codes,schema_level,validate}.py`
- Test: `packages/py/tests/test_schema_level.py`

The Python package mirrors the TS public surface: `validate(doc) -> Result`,
`validate_file(path) -> Result`, same codes (from `shared/error-codes.json`).

- [ ] **Step 1: Write `packages/py/pyproject.toml`**

```toml
[project]
name = "ocf-validator"
version = "0.1.0"
description = "Reference validator for the Open Coaching Format"
requires-python = ">=3.10"
dependencies = ["jsonschema>=4.21", "click>=8.1"]

[project.scripts]
ocf-validate = "ocf_validator.cli:main"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.pytest.ini_options]
pythonpath = ["."]
```

- [ ] **Step 2: Write `packages/py/ocf_validator/types.py`**

```python
from dataclasses import dataclass, field
from typing import Any, Literal

Severity = Literal["error", "warning"]


@dataclass
class Issue:
    code: str
    severity: Severity
    message: str
    path: str
    frame: str | None = None
    spec_ref: str | None = None
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class Result:
    valid: bool
    errors: list[Issue]
    warnings: list[Issue]
    summary: dict[str, int]
```

- [ ] **Step 3: Write `packages/py/ocf_validator/codes.py`**

```python
import json
import re
from pathlib import Path
from .types import Issue

_REGISTRY = json.loads(
    (Path(__file__).resolve().parents[3] / "shared" / "error-codes.json").read_text()
)


def _fill(template: str, data: dict) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: str(data.get(m.group(1), m.group(0))), template)


def make_issue(code: str, path: str, data: dict | None = None,
               frame: str | None = None) -> Issue:
    data = data or {}
    d = _REGISTRY[code]
    return Issue(code=code, severity=d["severity"], message=_fill(d["message"], data),
                 path=path, frame=frame, spec_ref=d.get("spec_ref"), data=data)
```

- [ ] **Step 4: Write `packages/py/ocf_validator/schema_level.py`**

```python
import json
from pathlib import Path
from jsonschema import Draft7Validator
from .codes import make_issue
from .types import Issue

_SCHEMA = json.loads(
    (Path(__file__).resolve().parents[3] / "shared" / "schema" / "ocf-action-v1.json").read_text()
)
_VALIDATOR = Draft7Validator(_SCHEMA)


def _has_legacy_shape(doc: dict) -> bool:
    frames = doc.get("frames")
    if not isinstance(frames, list):
        return False
    return any(isinstance(f, dict) and ("entity_states" in f or "lines" in f) for f in frames)


def schema_level(doc: dict) -> list[Issue]:
    if _has_legacy_shape(doc):
        return [make_issue("MODEL_LEGACY", "/frames", {})]
    issues: list[Issue] = []
    for e in _VALIDATOR.iter_errors(doc):
        ptr = "/" + "/".join(str(p) for p in e.absolute_path)
        issues.append(make_issue("SCHEMA_INVALID", ptr, {"detail": e.message}))
    return issues
```

- [ ] **Step 5: Write `packages/py/ocf_validator/validate.py`**

```python
import json
from .schema_level import schema_level
from .codes import make_issue
from .types import Issue, Result


def _assemble(issues: list[Issue]) -> Result:
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]
    return Result(valid=len(errors) == 0, errors=errors, warnings=warnings,
                  summary={"errors": len(errors), "warnings": len(warnings)})


def validate(doc) -> Result:
    if not isinstance(doc, dict):
        raise TypeError("validate: expected a dict (parsed OCF document)")
    level0 = schema_level(doc)
    if level0:
        return _assemble(level0)
    issues: list[Issue] = []
    # Level 1 rules appended in Task 17.
    return _assemble(issues)


def validate_file(path: str) -> Result:
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.loads(fh.read())
    except (json.JSONDecodeError, OSError) as err:
        return _assemble([make_issue("JSON_PARSE", "/", {"detail": str(err)})])
    return validate(doc)
```

- [ ] **Step 6: Write `packages/py/ocf_validator/__init__.py`**

```python
from .validate import validate, validate_file
from .types import Issue, Result

__all__ = ["validate", "validate_file", "Issue", "Result"]
```

- [ ] **Step 7: Write `packages/py/tests/test_schema_level.py`**

```python
from ocf_validator import validate

BASE = {
    "$schema": "x",
    "meta": {"id": "00000000-0000-4000-8000-000000000001", "title": "t"},
    "court": {"ruleset": "fiba", "type": "half_court"},
    "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
    "frames": [{"id": "f1", "actions": [], "end_state": {}}],
}


def test_minimal_valid_passes_level0():
    assert validate(BASE).valid


def test_missing_required_is_schema_invalid():
    bad = {**BASE, "frames": [{"id": "f1"}]}
    res = validate(bad)
    assert not res.valid
    assert any(e.code == "SCHEMA_INVALID" for e in res.errors)


def test_legacy_model_rejected():
    legacy = {**BASE, "frames": [{"id": "f1", "entity_states": {}, "lines": []}]}
    res = validate(legacy)
    assert res.errors[0].code == "MODEL_LEGACY"
```

- [ ] **Step 8: Install and run**

Run:
```bash
cd packages/py && python -m venv .venv && . .venv/bin/activate && pip install -e . pytest && pytest -q
```
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat(py): scaffold Python mirror + Level 0 (schema + legacy gate)"
```

---

## Task 17: Python mirror — semantic rules + conformance parity

**Files:**
- Create: `packages/py/ocf_validator/{context,possession,rules}.py`
- Modify: `packages/py/ocf_validator/validate.py`
- Create: `packages/py/tests/test_conformance.py`

> The Python rules mirror the TS rule modules one-to-one (the TS plan already
> specifies each rule's logic). The shared conformance suite is the acceptance
> test that proves parity.

- [ ] **Step 1: Write `packages/py/ocf_validator/context.py`**

```python
from dataclasses import dataclass


@dataclass
class DocContext:
    entity_refs: dict[str, dict]
    ball_ids: set[str]
    frame_ids: set[str]
    ruleset: str


def _entity_ref(e: dict) -> str | None:
    t = e.get("type")
    if not t:
        return None
    if t in ("ball", "coach"):
        return t
    if "nr" in e:
        return f"{t}_{e['nr']}"
    return t


def build_context(doc: dict) -> DocContext:
    entity_refs: dict[str, dict] = {}
    for e in doc.get("entities", []):
        ref = _entity_ref(e)
        if ref:
            entity_refs[ref] = {"type": e.get("type"), "nr": e.get("nr")}
    ball_ids = {b["id"] for b in doc.get("balls", []) if isinstance(b.get("id"), str)}
    frame_ids = {f["id"] for f in doc.get("frames", []) if isinstance(f.get("id"), str)}
    ruleset = (doc.get("court") or {}).get("ruleset", "custom")
    return DocContext(entity_refs, ball_ids, frame_ids, ruleset)
```

- [ ] **Step 2: Write `packages/py/ocf_validator/possession.py`**

```python
def possession_by_frame(doc: dict) -> list[dict]:
    current: dict[str, dict] = {}
    for b in doc.get("balls", []):
        if isinstance(b.get("id"), str):
            current[b["id"]] = {
                "carried_by": b.get("carried_by"),
                "at": b.get("at"),
                "dead": bool(b.get("dead", False)),
            }
    states = []
    for frame in doc.get("frames", []):
        states.append({k: dict(v) for k, v in current.items()})
        end_balls = (frame.get("end_state") or {}).get("balls") or {}
        for bid, st in end_balls.items():
            current[bid] = dict(st)
    return states


def carrier_of(state: dict, ball_id: str):
    return (state.get(ball_id) or {}).get("carried_by")


def loose_at(state: dict, ball_id: str):
    return (state.get(ball_id) or {}).get("at")
```

- [ ] **Step 3: Write `packages/py/ocf_validator/rules.py`** (mirrors all four TS rule modules)

```python
import json
import re
from pathlib import Path
from .codes import make_issue
from .context import DocContext
from .possession import carrier_of, loose_at
from .types import Issue

ENTITY_KEYS = ("player", "for_player", "on_player", "to_player")
BALL_DEPENDENT = {"pass", "shoot", "dribble"}
PICKUP = {"pickup", "rebound"}
FULL_COURT = {"fiba": (28.0, 15.0), "nba": (94.0, 50.0),
              "ncaa": (94.0, 50.0), "nfhs": (84.0, 50.0)}


def _known_named(doc: dict) -> set[str]:
    schema = json.loads(
        (Path(__file__).resolve().parents[3] / "shared" / "schema" / "ocf-action-v1.json").read_text()
    )
    enum = (schema.get("definitions", {}).get("coordinate_named", {})
            .get("properties", {}).get("named", {}).get("enum", []))
    names = set(enum)
    for p in doc.get("named_positions", []):
        if isinstance(p.get("name"), str):
            names.add(p["name"])
    return names


def _walk_named(node, pointer, known, frame_id, out):
    if isinstance(node, list):
        for i, v in enumerate(node):
            _walk_named(v, f"{pointer}/{i}", known, frame_id, out)
    elif isinstance(node, dict):
        if isinstance(node.get("named"), str) and node["named"] not in known:
            out.append(make_issue("REF_NAMED_POS_UNKNOWN",
                                   f"{pointer}/named", {"ref": node["named"]}, frame_id))
        for k, v in node.items():
            _walk_named(v, f"{pointer}/{k}", known, frame_id, out)


def reference_rules(doc: dict, ctx: DocContext) -> list[Issue]:
    out: list[Issue] = []
    known = _known_named(doc)
    for fi, frame in enumerate(doc.get("frames", [])):
        fid = frame.get("id")
        for ai, action in enumerate(frame.get("actions", [])):
            for key in ENTITY_KEYS:
                ref = action.get(key)
                if isinstance(ref, str) and ref not in ctx.entity_refs:
                    out.append(make_issue("REF_ENTITY_UNKNOWN",
                                          f"/frames/{fi}/actions/{ai}/{key}", {"ref": ref}, fid))
            ball = action.get("ball_id")
            if isinstance(ball, str) and ball not in ctx.ball_ids:
                out.append(make_issue("REF_BALL_UNKNOWN",
                                      f"/frames/{fi}/actions/{ai}/ball_id", {"ref": ball}, fid))
        for outcome, target in (frame.get("branches") or {}).items():
            if isinstance(target, str) and target not in ctx.frame_ids:
                out.append(make_issue("REF_BRANCH_TARGET_UNKNOWN",
                                      f"/frames/{fi}/branches/{outcome}",
                                      {"outcome": outcome, "ref": target}, fid))
        _walk_named(frame.get("actions"), f"/frames/{fi}/actions", known, fid, out)
        _walk_named(frame.get("end_state"), f"/frames/{fi}/end_state", known, fid, out)
        _walk_named(frame.get("start_state"), f"/frames/{fi}/start_state", known, fid, out)
    return out


def _resolve_ball(action, ctx):
    if isinstance(action.get("ball_id"), str):
        return action["ball_id"]
    if len(ctx.ball_ids) == 1:
        return next(iter(ctx.ball_ids))
    if len(ctx.ball_ids) == 0:
        return None
    return "AMBIGUOUS"


def possession_rules(doc: dict, ctx: DocContext, states: list[dict]) -> list[Issue]:
    out: list[Issue] = []
    for fi, frame in enumerate(doc.get("frames", [])):
        fid = frame.get("id")
        state = states[fi]
        for ai, action in enumerate(frame.get("actions", [])):
            t, player = action.get("type"), action.get("player")
            path = f"/frames/{fi}/actions/{ai}"
            if t in BALL_DEPENDENT:
                ball = _resolve_ball(action, ctx)
                if ball == "AMBIGUOUS":
                    out.append(make_issue("BALL_AMBIGUOUS", path,
                                          {"player": player, "count": len(ctx.ball_ids)}, fid))
                    continue
                if ball and carrier_of(state, ball) != player:
                    out.append(make_issue("BALL_CARRIER_MISMATCH", path,
                                          {"player": player, "action": t, "ball_id": ball}, fid))
                if (ctx.entity_refs.get(player) or {}).get("type") == "defense":
                    out.append(make_issue("ACTION_UNUSUAL_CARRIER", path,
                                          {"player": player, "action": t}, fid))
            elif t in PICKUP:
                ball = _resolve_ball(action, ctx)
                if ball == "AMBIGUOUS":
                    out.append(make_issue("BALL_AMBIGUOUS", path,
                                          {"player": player, "count": len(ctx.ball_ids)}, fid))
                elif ball and loose_at(state, ball) is None and carrier_of(state, ball) is not None:
                    out.append(make_issue("BALL_NOT_AT_LOCATION", path,
                                          {"player": player, "action": t}, fid))
    return out


def _coord_key(c):
    if not isinstance(c, dict):
        return None
    if isinstance(c.get("named"), str):
        return f"named:{c['named']}"
    if isinstance(c.get("x"), (int, float)) and isinstance(c.get("y"), (int, float)):
        return f"xy:{c['x']},{c['y']}"
    return None


def coherence_rules(doc: dict, ctx: DocContext) -> list[Issue]:
    out: list[Issue] = []
    frames = doc.get("frames", [])
    for fi, frame in enumerate(frames):
        fid = frame.get("id")
        end_state = frame.get("end_state") or {}
        for action in frame.get("actions", []):
            player = action.get("player")
            moves = action.get("moves")
            if not player or player not in end_state or not moves:
                continue
            last_to = moves[-1].get("to") if isinstance(moves[-1], dict) else None
            ek, tk = _coord_key(end_state.get(player)), _coord_key(last_to)
            if ek and tk and ek != tk:
                out.append(make_issue("END_STATE_DISAGREE",
                                      f"/frames/{fi}/end_state/{player}", {"ref": player}, fid))
        if fi + 1 < len(frames):
            start = frames[fi + 1].get("start_state") or {}
            for ref, coord in start.items():
                if ref == "balls":
                    continue
                a, b = _coord_key(coord), _coord_key(end_state.get(ref))
                if a and b and a != b:
                    out.append(make_issue("START_STATE_DISCONTINUITY",
                                          f"/frames/{fi+1}/start_state/{ref}", {"ref": ref},
                                          frames[fi + 1].get("id")))
    return out


def _rel_lum(hexstr):
    m = re.fullmatch(r"#?([0-9a-fA-F]{6})", hexstr or "")
    if not m:
        return None
    n = int(m.group(1), 16)
    chans = []
    for c in ((n >> 16) & 255, (n >> 8) & 255, n & 255):
        s = c / 255
        chans.append(s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4)
    return 0.2126 * chans[0] + 0.7152 * chans[1] + 0.0722 * chans[2]


def _contrast(a, b):
    la, lb = _rel_lum(a), _rel_lum(b)
    if la is None or lb is None:
        return None
    hi, lo = (la, lb) if la >= lb else (lb, la)
    return (hi + 0.05) / (lo + 0.05)


def _coords(node):
    if isinstance(node, list):
        for v in node:
            yield from _coords(v)
    elif isinstance(node, dict):
        if isinstance(node.get("x"), (int, float)) and isinstance(node.get("y"), (int, float)):
            yield (node["x"], node["y"])
        for v in node.values():
            yield from _coords(v)


def quality_rules(doc: dict, ctx: DocContext) -> list[Issue]:
    out: list[Issue] = []
    full = FULL_COURT.get(ctx.ruleset)
    if full:
        ex, ey = full[1] / 2, full[0] / 2
        for x, y in _coords(doc.get("entities", [])):
            if abs(x) > ex or abs(y) > ey:
                out.append(make_issue("ENTITY_OFFCOURT", "/entities",
                                      {"x": x, "y": y, "ruleset": ctx.ruleset}))
                break
    for fi, frame in enumerate(doc.get("frames", [])):
        if not frame.get("actions") and not (frame.get("end_state") or {}):
            out.append(make_issue("EMPTY_FRAME", f"/frames/{fi}", {}, frame.get("id")))
    cs = doc.get("color_scheme")
    if isinstance(cs, dict) and isinstance(cs.get("background"), str):
        for role, color in cs.items():
            if role == "background" or not isinstance(color, str):
                continue
            ratio = _contrast(color, cs["background"])
            if ratio is not None and ratio < 4.5:
                out.append(make_issue("CONTRAST_LOW", f"/color_scheme/{role}",
                                      {"ref": role, "ratio": f"{ratio:.2f}"}))
    return out
```

- [ ] **Step 4: Wire Level 1 into `validate.py`** — add imports and replace the `# Level 1 rules appended in Task 17.` block:

```python
from .context import build_context
from .possession import possession_by_frame
from .rules import reference_rules, possession_rules, coherence_rules, quality_rules
```

```python
    ctx = build_context(doc)
    states = possession_by_frame(doc)
    issues = [
        *reference_rules(doc, ctx),
        *possession_rules(doc, ctx, states),
        *coherence_rules(doc, ctx),
        *quality_rules(doc, ctx),
    ]
    return _assemble(issues)
```

- [ ] **Step 5: Write `packages/py/tests/test_conformance.py`** (same shared suite as TS)

```python
import json
from pathlib import Path
import pytest
from ocf_validator import validate_file

ROOT = Path(__file__).resolve().parents[3] / "shared" / "conformance"
CASES = json.loads((ROOT / "cases.json").read_text())


@pytest.mark.parametrize("c", CASES["valid"], ids=lambda c: c["file"])
def test_valid(c):
    res = validate_file(str(ROOT / c["file"]))
    assert res.errors == [], [e.code for e in res.errors]
    assert res.valid


@pytest.mark.parametrize("c", CASES["invalid"], ids=lambda c: c["file"])
def test_invalid(c):
    res = validate_file(str(ROOT / c["file"]))
    assert not res.valid
    got = {e.code for e in res.errors}
    for code in c["codes"]:
        assert code in got
```

- [ ] **Step 6: Run the Python conformance suite (parity check)**

Run: `cd packages/py && . .venv/bin/activate && pytest -q`
Expected: PASS — identical pass/fail to the TS conformance run. **If Python diverges from TS on any fixture, fix the Python rule — the shared suite is the contract.**

- [ ] **Step 7: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat(py): semantic rules mirrored against the shared conformance suite"
```

---

## Task 18: Python CLI + CI integration

**Files:**
- Create: `packages/py/ocf_validator/cli.py`, `packages/py/tests/test_cli.py`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `packages/py/ocf_validator/cli.py`**

```python
import json
import sys
import click
from .validate import validate_file


def _print_human(file, res):
    if res.valid and not res.warnings:
        click.echo(f"ok   {file}")
        return
    mark = "warn" if res.valid else "fail"
    click.echo(f"{mark} {file}")
    for i in res.errors + res.warnings:
        loc = f"{i.path} ({i.frame})" if i.frame else i.path
        click.echo(f"  {i.severity:5} {i.code} {loc}\n        {i.message}")
    click.echo(f"  {res.summary['errors']} error(s), {res.summary['warnings']} warning(s)")


@click.command()
@click.argument("files", nargs=-1, required=True)
@click.option("--json", "as_json", is_flag=True, help="machine-readable output")
@click.option("--quiet", is_flag=True, help="exit code only")
@click.option("--strict", is_flag=True, help="treat warnings as errors")
def main(files, as_json, quiet, strict):
    worst = 0
    results = {}
    for f in files:
        res = validate_file(f)
        results[f] = res
        if res.errors or (strict and res.warnings):
            worst = 1
        if not as_json and not quiet:
            _print_human(f, res)
    if as_json:
        click.echo(json.dumps(
            {f: {"valid": r.valid,
                 "errors": [vars(e) for e in r.errors],
                 "warnings": [vars(w) for w in r.warnings],
                 "summary": r.summary} for f, r in results.items()}, indent=2))
    sys.exit(worst)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write `packages/py/tests/test_cli.py`**

```python
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
VALID = ROOT / "shared" / "conformance" / "valid" / "pick-and-roll.ocf.json"


def _run(args):
    return subprocess.run(
        [sys.executable, "-m", "ocf_validator.cli", *args],
        capture_output=True, text=True, cwd=ROOT / "packages" / "py")


def test_exit_zero_on_valid():
    assert _run([str(VALID)]).returncode == 0


def test_json_flag_parses():
    r = _run(["--json", str(VALID)])
    assert r.returncode == 0
    json.loads(r.stdout)
```

- [ ] **Step 3: Run the Python CLI tests**

Run: `cd packages/py && . .venv/bin/activate && pip install -e . && pytest -q tests/test_cli.py`
Expected: PASS (2 tests).

- [ ] **Step 4: Add a Python job to `.github/workflows/ci.yml`**

```yaml
  py:
    name: Python validator
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: packages/py } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e . pytest
      - run: pytest -q
```

- [ ] **Step 5: Final full verification (both languages)**

Run:
```bash
cd packages/ts && npm test && cd ../py && . .venv/bin/activate && pytest -q
```
Expected: PASS — TS unit + conformance green; Python conformance + CLI green; both agree on the shared suite.

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add -A && git commit -m "feat(py): CLI + Python CI job; both impls green on shared suite"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** §2 layout -> Tasks 1,13,15; §3 pipeline -> Tasks 4,11; §4-A refs -> Tasks 6,7; §4-B possession -> Tasks 8,9; §4-C coherence -> Task 11 (pragmatic, explicit-endpoints only); §4-D quality -> Task 10; §5 result/API/CLI -> Tasks 2,3,12,14; §6 conformance -> Tasks 13,17. MODEL_LEGACY/SCHEMA_INVALID/JSON_PARSE -> Tasks 4,12.
- **Dropped rule:** `BRANCH_END_STATE_MISSING` removed (schema already requires `end_state` on every frame). Spec updated to match.
- **Fixture reality:** several seed fixtures are Level-0 schema failures; Task 13 records the *actual* emitted codes (capture script) before pinning `cases.json`, and adds two genuinely-semantic fixtures.
- **Type/name consistency:** `validate`/`validateFile`/`validate_file`, `assemble`/`_assemble`, `buildContext`/`build_context`, `possessionByFrame`/`possession_by_frame`, `makeIssue`/`make_issue`, rule fn names, and the `Issue`/`Result` shapes are consistent across TS and Python tasks.
