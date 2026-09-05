# Frame-less Action Model — Plan 3: Validator Dual-Version (v1 + v2) Support

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full v2 (frame-less action model) validation support to `ocf-validator`, side-by-side with the existing v1 (`frames[]`) support — both TypeScript (`packages/ts`) and Python (`packages/py`) — so `validate()`/`validate_file()` dispatch on the document's declared `$schema` major version and run the matching, fully independent rule set. Neither language drops v1 support; this is additive.

**Architecture:** This repo (`ocf-validator`) is separate from `spec` (Plans 1-2) — it vendors its own copy of the OCF schema (`shared/schema/ocf-action-v1.json`) and validates documents against it plus its own semantic rules (reference integrity, ball possession, coherence, quality), which are NOT expressible in JSON Schema alone. The existing v1 modules (`context`, `possession`, `rules/references`, `rules/possession-rules`, `rules/coherence`, `rules/quality`) move unchanged into a `v1/` subdirectory in each language package; a new parallel `v2/` subdirectory holds equivalent modules rewritten against `actions[]`/`trigger`/`branch`. `validate()` detects the document's major version from `$schema` and calls into the matching subdirectory's `validate()`. Conformance fixtures split into `shared/conformance/v1/` (existing fixtures, unchanged) and `shared/conformance/v2/` (new, migrated per the same patterns used in the `spec` repo's Plan 2). Two rule sets means two schema versions vendored: `shared/schema/ocf-action-v1.json` stays as-is; a new `shared/schema/ocf-action-v2.json` is added once Plans 1-2 ship a tagged v2.0.0 release of `@opencoachingformat/spec` (this plan copies the FINAL schema state from the `spec` repo's `feat/frameless-action-model` branch as a stand-in, since a real npm-published v2.0.0 doesn't exist yet at plan-writing time — Task 1 documents exactly what to copy and from where).

**Critical dependency on the existing auto-sync workflow:** `.github/workflows/sync-from-spec.yml` fires on every `spec_released` dispatch and unconditionally writes the fetched schema to the hardcoded path `shared/schema/ocf-action-v1.json`, regardless of what major version the fetched content actually is (the spec repo's file is named `schema/v1.json` on disk even after its *content* becomes v2.0.0 — filename and semantic version are independent; see Plans 1-2). Confirmed by reading the workflow in full: without a fix, the FIRST spec release after v2.0.0 ships would silently overwrite the real v1 schema this plan is preserving with v2 content, defeating the entire dual-version design. This plan does not lay that groundwork silently — Task 17 makes the workflow major-version-aware, as its own explicit final task, once the v1/v2 directory structure this plan builds actually exists for it to target.

**Tech Stack:** TypeScript (`packages/ts`, vitest), Python (`packages/py`, pytest), JSON Schema draft-07, no new external dependencies.

---

## Before you start

Confirm the baseline test suites pass before starting:

```bash
cd /Users/oliver-marcuseder/01-vibe-coding/00-Basektball/open-coaching-format/ocf-validator-frameless-action-model
cd packages/ts && npx vitest run && cd ../..
cd packages/py && python -m pytest && cd ../..
```

Expected: PASS for both. If either fails, this repo has an unrelated pre-existing issue — stop and investigate before starting this plan.

Also confirm you have the finished Plans 1-2 output available (the migrated schema and examples live in the `spec` repo's `feat/frameless-action-model` branch, a sibling worktree):

```bash
ls /Users/oliver-marcuseder/01-vibe-coding/00-Basektball/open-coaching-format/spec-frameless-action-model/schema/v1.json
```

Expected: file exists (it's still named `v1.json` on disk — the `$id`/`x-ocf-version` INSIDE the file is what will say v2.0.0 once Plans 1-2's changelog task lands; check `x-ocf-version` directly, not the filename):

```bash
grep '"x-ocf-version"' /Users/oliver-marcuseder/01-vibe-coding/00-Basektball/open-coaching-format/spec-frameless-action-model/schema/v1.json
```

If this still reports `1.4.0` (Plans 1-2 not fully executed/committed yet as a version bump), stop and complete Plans 1-2 first, or at minimum manually bump `x-ocf-version` to `2.0.0` and `$id`'s version segment as a stand-in for this plan's purposes — Task 1 depends on this value being `2.x.x`.

---

### Task 1: Vendor the v2 schema and add version-dispatch scaffolding (TypeScript)

**Files:**
- Create: `shared/schema/ocf-action-v2.json` (copy from the spec repo)
- Modify: `packages/ts/src/schema-version.ts`
- Test: `packages/ts/test/unit/schema-version.test.ts` (extend)

- [ ] **Step 1: Copy the v2 schema into this repo**

```bash
cp /Users/oliver-marcuseder/01-vibe-coding/00-Basektball/open-coaching-format/spec-frameless-action-model/schema/v1.json \
   shared/schema/ocf-action-v2.json
```

Manually edit `shared/schema/ocf-action-v2.json`: change `"$id"` from `https://opencoachingformat.org/schema/v1.json` to `https://opencoachingformat.org/schema/v2.json`, and confirm `"x-ocf-version"` reads `"2.0.0"` (or whatever the actual Plans 1-2 changelog task set it to — read it, don't assume).

- [ ] **Step 2: Write the failing test**

Read the current `packages/ts/test/unit/schema-version.test.ts` first:

```bash
cat packages/ts/test/unit/schema-version.test.ts
```

Add a new test (matching that file's existing style/imports) asserting a second bundled schema info object exists for v2:

```typescript
import { bundledSchemaInfoFor } from "../../src/schema-version.js";

test("bundledSchemaInfoFor('v2') reports major v2", () => {
  const info = bundledSchemaInfoFor("v2");
  expect(info.major).toBe("v2");
  expect(info.id).toBe("https://opencoachingformat.org/schema/v2.json");
});

test("bundledSchemaInfoFor('v1') still reports major v1 (unchanged)", () => {
  const info = bundledSchemaInfoFor("v1");
  expect(info.major).toBe("v1");
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/ts && npx vitest run test/unit/schema-version.test.ts
```

Expected: FAIL — `bundledSchemaInfoFor` doesn't exist yet (only the single `bundledSchemaInfo` constant does).

- [ ] **Step 4: Refactor `schema-version.ts` to support both versions**

Replace the entire contents of `packages/ts/src/schema-version.ts`:

```typescript
import schemaV1 from "../../../shared/schema/ocf-action-v1.json" with { type: "json" };
import schemaV2 from "../../../shared/schema/ocf-action-v2.json" with { type: "json" };
import type { OcfDoc } from "./types.js";

const CANONICAL_ID_V1 = "https://opencoachingformat.org/schema/v1.json";
const CANONICAL_ID_V2 = "https://opencoachingformat.org/schema/v2.json";

export interface SchemaInfo { version: string; major: string; id: string; }

function infoFrom(schema: unknown, canonicalId: string): SchemaInfo {
  const rawVersion = (schema as Record<string, unknown>)["x-ocf-version"];
  const version = typeof rawVersion === "string" ? rawVersion : "0.0.0";
  return {
    version,
    major: "v" + version.split(".")[0],
    id: ((schema as Record<string, unknown>)["$id"] as string) ?? canonicalId,
  };
}

const BUNDLED: Record<"v1" | "v2", SchemaInfo> = {
  v1: infoFrom(schemaV1, CANONICAL_ID_V1),
  v2: infoFrom(schemaV2, CANONICAL_ID_V2),
};

/** Back-compat: existing v1-only call sites keep working unchanged. */
export const bundledSchemaInfo: SchemaInfo = BUNDLED.v1;

export function bundledSchemaInfoFor(major: "v1" | "v2"): SchemaInfo {
  return BUNDLED[major];
}

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

const SUPPORTED_MAJORS = new Set(["v1", "v2"]);

// Pure, synchronous. Dispatches to the matching bundled version's info based
// on the document's declared major; falls back to v2 (the current default)
// when $schema is absent, matching how v1 defaulted to itself when absent.
export function schemaCheck(doc: OcfDoc, validatedAgainstOverride?: string): SchemaCheck {
  const declared = (doc as { $schema?: string }).$schema ?? null;
  const declaredMajor = parseMajor(declared ?? undefined);
  const effectiveMajor = (declaredMajor && SUPPORTED_MAJORS.has(declaredMajor) ? declaredMajor : "v2") as "v1" | "v2";
  const majorUnsupported = declaredMajor !== null && !SUPPORTED_MAJORS.has(declaredMajor);

  const bundled = BUNDLED[effectiveMajor];
  const validatedAgainst = validatedAgainstOverride ?? bundled.version;

  const meta = (doc as { meta?: { min_schema_version?: string } }).meta;
  const requiredByDoc = typeof meta?.min_schema_version === "string" ? meta.min_schema_version : null;
  const outdated = requiredByDoc !== null && cmpSemver(requiredByDoc, validatedAgainst) > 0;

  const match = !majorUnsupported && !outdated;
  return {
    majorUnsupported, declaredMajor, outdated,
    block: { validatedAgainst, documentDeclared: declared, requiredByDoc, match },
  };
}

export function effectiveMajorOf(doc: OcfDoc): "v1" | "v2" {
  const declared = (doc as { $schema?: string }).$schema ?? null;
  const declaredMajor = parseMajor(declared ?? undefined);
  return (declaredMajor && SUPPORTED_MAJORS.has(declaredMajor) ? declaredMajor : "v2") as "v1" | "v2";
}
```

Design notes on this rewrite:
- `bundledSchemaInfo` (singular, v1) is KEPT for back-compat with any existing import elsewhere in the codebase — check for other usages before deleting it:

```bash
grep -rn "bundledSchemaInfo\b" packages/ts/src packages/ts/test
```

Fix any other call site found to use `bundledSchemaInfoFor(effectiveMajorOf(doc))` instead, if it needs version-aware behavior; leave it on `bundledSchemaInfo` only if it's genuinely v1-specific (unlikely outside this file and `validate.ts`, handled in Task 3).
- A document declaring neither v1 nor v2 (`$schema` absent, or some other value) now defaults to **v2**, not v1 — this is a deliberate default flip (v2 becomes the assumed default for new documents going forward, matching the `spec` repo's own eventual default), whereas v1 defaulted to itself when absent. Confirm this is the intended default before proceeding — it affects every fixture with no `$schema` field.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/ts && npx vitest run test/unit/schema-version.test.ts
```

Expected: PASS (all tests, old and new).

- [ ] **Step 6: Run the full existing test suite to check for fallout**

```bash
cd packages/ts && npx vitest run
```

Expected: some existing tests may now fail if they assumed `schemaCheck`'s old signature/behavior exactly (e.g. a document with no `$schema` previously defaulted to v1 semantics; it now defaults to v2). Read every failure — do not blanket-fix; each one tells you whether a v1-assuming test fixture needs an explicit `"$schema": ".../v1.json"` added (if it's meant to stay a v1 test) or needs updating to expect v2 dispatch (if the default-flip is what broke it). This is expected work for this task, not a sign something is wrong — fix each failing test/fixture individually based on what it actually needs to keep testing.

- [ ] **Step 7: Commit**

```bash
git add shared/schema/ocf-action-v2.json packages/ts/src/schema-version.ts packages/ts/test/unit/schema-version.test.ts
git commit -m "feat(ts): vendor v2 schema, add version-aware schema dispatch"
```

---

### Task 2: Mirror Task 1 in Python

**Files:**
- Modify: `packages/py/ocf_validator/schema_version.py`
- Test: `packages/py/tests/test_schema_version.py` (extend)

- [ ] **Step 1: Read the current test file**

```bash
cat packages/py/tests/test_schema_version.py
```

- [ ] **Step 2: Write the failing test**

Add to `packages/py/tests/test_schema_version.py` (matching its existing style):

```python
from ocf_validator.schema_version import bundled_schema_info_for


def test_bundled_schema_info_for_v2_reports_major_v2():
    info = bundled_schema_info_for("v2")
    assert info["major"] == "v2"
    assert info["id"] == "https://opencoachingformat.org/schema/v2.json"


def test_bundled_schema_info_for_v1_unchanged():
    info = bundled_schema_info_for("v1")
    assert info["major"] == "v1"
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/py && python -m pytest tests/test_schema_version.py -v
```

Expected: FAIL — `bundled_schema_info_for` doesn't exist.

- [ ] **Step 4: Rewrite `schema_version.py`**

Replace the entire contents of `packages/py/ocf_validator/schema_version.py`:

```python
import json
import re
from pathlib import Path

_SHARED_SCHEMA_DIR = Path(__file__).resolve().parents[3] / "shared" / "schema"

_CANONICAL_ID = {
    "v1": "https://opencoachingformat.org/schema/v1.json",
    "v2": "https://opencoachingformat.org/schema/v2.json",
}

_SCHEMA_FILE = {
    "v1": "ocf-action-v1.json",
    "v2": "ocf-action-v2.json",
}


def _load_info(major: str) -> dict:
    schema = json.loads((_SHARED_SCHEMA_DIR / _SCHEMA_FILE[major]).read_text())
    raw_version = schema.get("x-ocf-version")
    version = raw_version if isinstance(raw_version, str) else "0.0.0"
    return {
        "version": version,
        "major": "v" + version.split(".")[0],
        "id": schema.get("$id", _CANONICAL_ID[major]),
    }


_BUNDLED = {"v1": _load_info("v1"), "v2": _load_info("v2")}

# Back-compat: existing v1-only call sites keep working unchanged.
BUNDLED_VERSION = _BUNDLED["v1"]["version"]
BUNDLED_MAJOR = _BUNDLED["v1"]["major"]
BUNDLED_ID = _BUNDLED["v1"]["id"]

_SUPPORTED_MAJORS = {"v1", "v2"}


def bundled_schema_info_for(major: str) -> dict:
    return _BUNDLED[major]


def parse_major(schema_url):
    if not isinstance(schema_url, str):
        return None
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


def effective_major_of(doc: dict) -> str:
    declared = doc.get("$schema")
    declared_major = parse_major(declared)
    return declared_major if declared_major in _SUPPORTED_MAJORS else "v2"


def schema_check(doc, validated_against=None):
    declared = doc.get("$schema")
    declared_major = parse_major(declared)
    effective_major = declared_major if declared_major in _SUPPORTED_MAJORS else "v2"
    major_unsupported = declared_major is not None and declared_major not in _SUPPORTED_MAJORS

    bundled = _BUNDLED[effective_major]
    validated_against = validated_against or bundled["version"]

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

Same default-flip note as Task 1 Step 4 applies here: a document with no `$schema` now defaults to v2 dispatch, not v1.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/py && python -m pytest tests/test_schema_version.py -v
```

Expected: PASS (all tests).

- [ ] **Step 6: Run the full Python test suite to check for fallout**

```bash
cd packages/py && python -m pytest
```

Expected: same as TS Task 1 Step 6 — fix each failure individually based on whether it's a v1 fixture needing an explicit `$schema` or a default-flip-affected expectation.

- [ ] **Step 7: Commit**

```bash
git add packages/py/ocf_validator/schema_version.py packages/py/tests/test_schema_version.py
git commit -m "feat(py): vendor v2 schema info, add version-aware schema dispatch"
```

---

### Task 3: Reorganize TypeScript rule modules into `v1/` (no behavior change)

**Files:**
- Create: `packages/ts/src/v1/context.ts`, `packages/ts/src/v1/possession.ts`, `packages/ts/src/v1/rules/references.ts`, `packages/ts/src/v1/rules/possession-rules.ts`, `packages/ts/src/v1/rules/coherence.ts`, `packages/ts/src/v1/rules/quality.ts`, `packages/ts/src/v1/validate.ts`
- Delete: `packages/ts/src/context.ts`, `packages/ts/src/possession.ts`, `packages/ts/src/rules/references.ts`, `packages/ts/src/rules/possession-rules.ts`, `packages/ts/src/rules/coherence.ts`, `packages/ts/src/rules/quality.ts`, `packages/ts/src/validate.ts` (moved, not modified)
- Modify: every file under `packages/ts/test/unit/` that imports these (update import paths only), `packages/ts/src/validate-file.ts`, `packages/ts/src/validate-async.ts`, `packages/ts/src/index.ts`, `packages/ts/src/browser.ts` (wherever they import `validate.js`/`context.js`/etc.)

This task is a pure move — no logic changes. Every file's content stays byte-identical except import paths that need a `../` prefix added (since they're now one directory deeper).

- [ ] **Step 1: Move the six v1 rule/support files**

```bash
mkdir -p packages/ts/src/v1/rules
git mv packages/ts/src/context.ts packages/ts/src/v1/context.ts
git mv packages/ts/src/possession.ts packages/ts/src/v1/possession.ts
git mv packages/ts/src/rules/references.ts packages/ts/src/v1/rules/references.ts
git mv packages/ts/src/rules/possession-rules.ts packages/ts/src/v1/rules/possession-rules.ts
git mv packages/ts/src/rules/coherence.ts packages/ts/src/v1/rules/coherence.ts
git mv packages/ts/src/rules/quality.ts packages/ts/src/v1/rules/quality.ts
git mv packages/ts/src/validate.ts packages/ts/src/v1/validate.ts
```

- [ ] **Step 2: Fix relative imports inside the 7 moved files**

Each moved file imports from `./types.js` or `./codes.js` (one level up now) or `../context.js`/`./context.js` (siblings within v1/). Check every import in each file:

```bash
grep -n '^import' packages/ts/src/v1/context.ts packages/ts/src/v1/possession.ts packages/ts/src/v1/validate.ts packages/ts/src/v1/rules/*.ts
```

Fix each import path:
- `packages/ts/src/v1/context.ts`: `import type { OcfDoc } from "./types.js";` → `import type { OcfDoc } from "../types.js";`
- `packages/ts/src/v1/possession.ts`: `import type { OcfDoc } from "./types.js";` → `../types.js`; `import { getFrames } from "./context.js";` stays `./context.js` (same directory now).
- `packages/ts/src/v1/rules/references.ts`, `possession-rules.ts`, `coherence.ts`, `quality.ts`: each imports `../types.js`, `../context.js`, `../codes.js` — these were already one level up from `rules/` to `src/`; now they need to go up to `src/v1/` then further to `src/`. Change every `../types.js` → `../../types.js`, every `../context.js` → `../context.js` (context.ts is now a sibling of rules/, i.e. `v1/context.ts`, reached via `../context.js` — unchanged), every `../codes.js` → `../../codes.js`, every `../possession.js` → `../possession.js` (unchanged, sibling).

Do this precisely by reading each file's actual import lines before changing them — don't guess; the exact old paths were shown in Task reading (`possession-rules.ts` imports `"../types.js"`, `"../context.js"`, `"../possession.js"` (as a type-only import for `FrameState`), `"../codes.js"`; `coherence.ts` imports `"../types.js"`, `"../context.js"`, `"../codes.js"`; the pattern is consistent).

- `packages/ts/src/v1/validate.ts`: imports `./types.js` → `../types.js`; `./schema-level.js` → `../schema-level.js`; `./context.js` → `./context.js` (now sibling); `./possession.js` → `./possession.js` (sibling); `./rules/references.js` etc. stay `./rules/references.js` (sibling subdirectory, unchanged); `./schema-version.js` → `../schema-version.js`; `./codes.js` → `../codes.js`.

- [ ] **Step 3: Update every file elsewhere that imported the moved modules**

```bash
grep -rln 'from "\./context\.js"\|from "\./possession\.js"\|from "\./validate\.js"\|from "\./rules/' packages/ts/src packages/ts/test
```

For each match outside `packages/ts/src/v1/`, update the import to point at `./v1/context.js`, `./v1/possession.js`, `./v1/validate.js`, `./v1/rules/...` respectively (adjusting relative-path depth as needed per file location — e.g. `packages/ts/src/validate-file.ts` importing `./validate.js` becomes `./v1/validate.js`; `packages/ts/test/unit/context.test.ts` importing `../../src/context.js` becomes `../../src/v1/context.js`).

- [ ] **Step 4: Run the full test suite to confirm the move broke nothing**

```bash
cd packages/ts && npx vitest run
```

Expected: PASS — every test that passed before this task still passes (this task changes zero behavior, only file locations and import paths).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ts): move v1 rule modules under src/v1/ (no behavior change)"
```

---

### Task 4: Mirror Task 3 in Python

**Files:**
- Create: `packages/py/ocf_validator/v1/__init__.py`, `packages/py/ocf_validator/v1/context.py`, `packages/py/ocf_validator/v1/possession.py`, `packages/py/ocf_validator/v1/rules.py`, `packages/py/ocf_validator/v1/validate.py`
- Delete (moved): `packages/py/ocf_validator/context.py`, `packages/py/ocf_validator/possession.py`, `packages/py/ocf_validator/rules.py`, `packages/py/ocf_validator/validate.py`
- Modify: `packages/py/ocf_validator/__init__.py`, `packages/py/ocf_validator/cli.py`, every test in `packages/py/tests/` that imports these

- [ ] **Step 1: Move the four v1 files**

```bash
mkdir -p packages/py/ocf_validator/v1
touch packages/py/ocf_validator/v1/__init__.py
git mv packages/py/ocf_validator/context.py packages/py/ocf_validator/v1/context.py
git mv packages/py/ocf_validator/possession.py packages/py/ocf_validator/v1/possession.py
git mv packages/py/ocf_validator/rules.py packages/py/ocf_validator/v1/rules.py
git mv packages/py/ocf_validator/validate.py packages/py/ocf_validator/v1/validate.py
git add packages/py/ocf_validator/v1/__init__.py
```

- [ ] **Step 2: Fix relative imports inside the 4 moved files**

Each moved file uses relative imports like `from .codes import make_issue` (one level up now, since they moved one package level deeper). Check:

```bash
grep -n '^from \.' packages/py/ocf_validator/v1/context.py packages/py/ocf_validator/v1/possession.py packages/py/ocf_validator/v1/rules.py packages/py/ocf_validator/v1/validate.py
```

Fix each: `from .codes import make_issue` → `from ..codes import make_issue`; `from .context import ...` → same-package sibling, stays `from .context import ...`; `from .named_positions import known_named` → `from ..named_positions import known_named`; `from .possession import FrameState` → same-package sibling, stays `from .possession import FrameState`; `from .types import Issue` → `from ..types import Issue`; `from .schema_version import ...` (in `validate.py`) → `from ..schema_version import ...`; `from .schema_level import schema_level` → `from ..schema_level import schema_level`.

Apply this precisely per file, reading each file's exact import list first — the pattern (same-package sibling imports stay `.`, imports of things that stayed at the parent level become `..`) is consistent across all four files.

- [ ] **Step 3: Update `packages/py/ocf_validator/__init__.py` and `cli.py`**

```bash
cat packages/py/ocf_validator/__init__.py
cat packages/py/ocf_validator/cli.py
```

Update whatever these import from `.validate`, `.context`, `.possession`, `.rules` to `.v1.validate`, `.v1.context`, etc. — read each file's actual imports first (already partially seen: `cli.py`'s content wasn't shown in full during planning; read it before editing).

- [ ] **Step 4: Update every test file that imports the moved modules**

```bash
grep -rln 'from ocf_validator\.\(context\|possession\|rules\|validate\) import\|from \.\.ocf_validator' packages/py/tests
```

Update each match's import path to `ocf_validator.v1.<module>`.

- [ ] **Step 5: Run the full test suite**

```bash
cd packages/py && python -m pytest
```

Expected: PASS — same no-behavior-change guarantee as Task 3.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(py): move v1 rule modules under ocf_validator/v1/ (no behavior change)"
```

---

### Task 5: Build the v2 `context` module (TypeScript)

**Files:**
- Create: `packages/ts/src/v2/context.ts`
- Test: `packages/ts/test/unit/v2/context.test.ts`

The v2 document has no `frames[]`/`frameIds` — instead it has a flat `actions[]` (which may contain `branch` items) and every action has a unique `id`. `getActionIds`/`getFlatActions` need to walk INTO branch cases recursively, since a branch's cases contain their own nested action sub-sequences (and per the design, a case's actions may themselves contain a nested branch).

- [ ] **Step 1: Write the failing test**

Create `packages/ts/test/unit/v2/context.test.ts`:

```typescript
import { test, expect, describe } from "vitest";
import { buildContextV2, walkActions, isBranch } from "../../../src/v2/context.js";

const SAMPLE_DOC = {
  court: { ruleset: "fiba" },
  entities: [
    { type: "offense", nr: 1, x: 0, y: 5 },
    { type: "offense", nr: 2, x: 1, y: 5 },
  ],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  actions: [
    { id: "a1", player: "offense_1", type: "pass", to_player: "offense_2" },
    {
      id: "branch_1",
      on: "a1",
      cases: {
        make: { actions: [{ id: "a2", player: "offense_2", type: "shoot" }], then: null },
        miss: { actions: [], then: null },
      },
    },
  ],
};

describe("buildContextV2", () => {
  test("collects entity refs, ball ids, ruleset", () => {
    const ctx = buildContextV2(SAMPLE_DOC);
    expect(ctx.entityRefs.has("offense_1")).toBe(true);
    expect(ctx.entityRefs.has("offense_2")).toBe(true);
    expect(ctx.ballIds.has("ball_1")).toBe(true);
    expect(ctx.ruleset).toBe("fiba");
  });

  test("collects every action id, including ones nested inside branch cases", () => {
    const ctx = buildContextV2(SAMPLE_DOC);
    expect(ctx.actionIds.has("a1")).toBe(true);
    expect(ctx.actionIds.has("a2")).toBe(true);
    expect(ctx.actionIds.has("branch_1")).toBe(true);
  });
});

describe("isBranch", () => {
  test("distinguishes a branch item from a plain action", () => {
    expect(isBranch(SAMPLE_DOC.actions[0])).toBe(false);
    expect(isBranch(SAMPLE_DOC.actions[1])).toBe(true);
  });
});

describe("walkActions", () => {
  test("visits every action in document order, recursing into branch cases", () => {
    const visited: string[] = [];
    walkActions(SAMPLE_DOC.actions as Record<string, unknown>[], (action, path) => {
      visited.push(`${path}:${action.id}`);
    });
    expect(visited).toEqual([
      "/actions/0:a1",
      "/actions/1:branch_1",
      "/actions/1/cases/make/actions/0:a2",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/ts && npx vitest run test/unit/v2/context.test.ts
```

Expected: FAIL — `packages/ts/src/v2/context.ts` doesn't exist.

- [ ] **Step 3: Write `packages/ts/src/v2/context.ts`**

```typescript
import type { OcfDoc } from "../types.js";

export interface EntityInfo { type: string; nr?: number; }
export interface DocContextV2 {
  entityRefs: Map<string, EntityInfo>;
  ballIds: Set<string>;
  actionIds: Set<string>;
  ruleset: string;
}

function entityRef(e: Record<string, unknown>): string | null {
  const type = e.type as string | undefined;
  if (!type) return null;
  if (type === "ball" || type === "coach") return type;
  if ("nr" in e) return `${type}_${e.nr}`;
  return type;
}

/** A top-level actions[] item is a branch iff it has 'cases' (actions never do). */
export function isBranch(item: Record<string, unknown>): boolean {
  return "cases" in item;
}

/**
 * Visit every action AND branch in document order, recursing into every
 * branch case's own actions[] (which may itself contain nested branches).
 * Calls back with (item, jsonPointerPath) for both actions and branches.
 */
export function walkActions(
  items: Record<string, unknown>[],
  visit: (item: Record<string, unknown>, path: string) => void,
  basePath = "/actions",
): void {
  items.forEach((item, i) => {
    const path = `${basePath}/${i}`;
    visit(item, path);
    if (isBranch(item)) {
      const cases = (item.cases ?? {}) as Record<string, { actions?: unknown[] }>;
      for (const [outcome, branchCase] of Object.entries(cases)) {
        const nested = (branchCase.actions ?? []) as Record<string, unknown>[];
        walkActions(nested, visit, `${path}/cases/${outcome}/actions`);
      }
    }
  });
}

export function buildContextV2(doc: OcfDoc): DocContextV2 {
  const entityRefs = new Map<string, EntityInfo>();
  for (const e of (((doc as { entities?: unknown[] }).entities ?? []) as Record<string, unknown>[])) {
    const ref = entityRef(e);
    if (ref) entityRefs.set(ref, { type: e.type as string, nr: e.nr as number | undefined });
  }
  const ballIds = new Set<string>();
  for (const b of (((doc as { balls?: unknown[] }).balls ?? []) as Record<string, unknown>[])) {
    if (typeof b.id === "string") ballIds.add(b.id);
  }
  const actionIds = new Set<string>();
  const topLevel = (((doc as { actions?: unknown[] }).actions ?? []) as Record<string, unknown>[]);
  walkActions(topLevel, (item) => {
    if (typeof item.id === "string") actionIds.add(item.id);
  });
  const ruleset = ((doc as { court?: { ruleset?: string } }).court?.ruleset) ?? "custom";
  return { entityRefs, ballIds, actionIds, ruleset };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/ts && npx vitest run test/unit/v2/context.test.ts
```

Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ts/src/v2/context.ts packages/ts/test/unit/v2/context.test.ts
git commit -m "feat(ts): v2 context module (actions[]/branch-aware entity/ball/action-id collection)"
```

---

### Task 6: Mirror Task 5 in Python

**Files:**
- Create: `packages/py/ocf_validator/v2/__init__.py`, `packages/py/ocf_validator/v2/context.py`
- Test: `packages/py/tests/v2/test_context.py`

- [ ] **Step 1: Write the failing test**

```bash
mkdir -p packages/py/tests/v2
touch packages/py/tests/v2/__init__.py
```

Create `packages/py/tests/v2/test_context.py`:

```python
from ocf_validator.v2.context import build_context_v2, is_branch, walk_actions

SAMPLE_DOC = {
    "court": {"ruleset": "fiba"},
    "entities": [
        {"type": "offense", "nr": 1, "x": 0, "y": 5},
        {"type": "offense", "nr": 2, "x": 1, "y": 5},
    ],
    "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
    "actions": [
        {"id": "a1", "player": "offense_1", "type": "pass", "to_player": "offense_2"},
        {
            "id": "branch_1",
            "on": "a1",
            "cases": {
                "make": {"actions": [{"id": "a2", "player": "offense_2", "type": "shoot"}], "then": None},
                "miss": {"actions": [], "then": None},
            },
        },
    ],
}


def test_build_context_v2_collects_entities_balls_ruleset():
    ctx = build_context_v2(SAMPLE_DOC)
    assert "offense_1" in ctx.entity_refs
    assert "offense_2" in ctx.entity_refs
    assert "ball_1" in ctx.ball_ids
    assert ctx.ruleset == "fiba"


def test_build_context_v2_collects_nested_branch_action_ids():
    ctx = build_context_v2(SAMPLE_DOC)
    assert "a1" in ctx.action_ids
    assert "a2" in ctx.action_ids
    assert "branch_1" in ctx.action_ids


def test_is_branch_distinguishes_action_from_branch():
    assert is_branch(SAMPLE_DOC["actions"][0]) is False
    assert is_branch(SAMPLE_DOC["actions"][1]) is True


def test_walk_actions_visits_in_order_recursing_into_cases():
    visited = []
    walk_actions(SAMPLE_DOC["actions"], lambda item, path: visited.append(f"{path}:{item['id']}"))
    assert visited == [
        "/actions/0:a1",
        "/actions/1:branch_1",
        "/actions/1/cases/make/actions/0:a2",
    ]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/py && python -m pytest tests/v2/test_context.py -v
```

Expected: FAIL — `ocf_validator.v2.context` doesn't exist.

- [ ] **Step 3: Write `packages/py/ocf_validator/v2/context.py`**

```python
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class EntityInfo:
    type: str
    nr: int | None = None


@dataclass
class DocContextV2:
    entity_refs: dict[str, EntityInfo] = field(default_factory=dict)
    ball_ids: set[str] = field(default_factory=set)
    action_ids: set[str] = field(default_factory=set)
    ruleset: str = "custom"


def _entity_ref(e: dict[str, Any]) -> str | None:
    type_ = e.get("type")
    if not type_:
        return None
    if type_ in ("ball", "coach"):
        return type_
    if "nr" in e:
        return f"{type_}_{e['nr']}"
    return type_


def is_branch(item: dict[str, Any]) -> bool:
    """A top-level actions[] item is a branch iff it has 'cases' (actions never do)."""
    return "cases" in item


def walk_actions(
    items: list[dict[str, Any]],
    visit: Callable[[dict[str, Any], str], None],
    base_path: str = "/actions",
) -> None:
    """Visit every action AND branch in document order, recursing into every
    branch case's own actions[] (which may itself contain nested branches)."""
    for i, item in enumerate(items):
        path = f"{base_path}/{i}"
        visit(item, path)
        if is_branch(item):
            cases = item.get("cases") or {}
            for outcome, branch_case in cases.items():
                nested = branch_case.get("actions") or []
                walk_actions(nested, visit, f"{path}/cases/{outcome}/actions")


def build_context_v2(doc: dict[str, Any]) -> DocContextV2:
    entity_refs: dict[str, EntityInfo] = {}
    for e in doc.get("entities") or []:
        if not isinstance(e, dict):
            continue
        ref = _entity_ref(e)
        if ref:
            entity_refs[ref] = EntityInfo(type=e.get("type"), nr=e.get("nr"))
    ball_ids: set[str] = set()
    for b in doc.get("balls") or []:
        if isinstance(b, dict) and isinstance(b.get("id"), str):
            ball_ids.add(b["id"])
    action_ids: set[str] = set()
    top_level = doc.get("actions") or []

    def _collect(item: dict[str, Any], _path: str) -> None:
        if isinstance(item.get("id"), str):
            action_ids.add(item["id"])

    walk_actions(top_level, _collect)
    court = doc.get("court") or {}
    ruleset = court.get("ruleset") if isinstance(court, dict) else None
    return DocContextV2(
        entity_refs=entity_refs,
        ball_ids=ball_ids,
        action_ids=action_ids,
        ruleset=ruleset or "custom",
    )
```

Create `packages/py/ocf_validator/v2/__init__.py` (empty file):

```bash
touch packages/py/ocf_validator/v2/__init__.py
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/py && python -m pytest tests/v2/test_context.py -v
```

Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/py/ocf_validator/v2/ packages/py/tests/v2/
git commit -m "feat(py): v2 context module (actions[]/branch-aware entity/ball/action-id collection)"
```

---

### Task 7: Add new error codes for v2-specific violations

**Files:**
- Modify: `shared/error-codes.json`

New v2 rules need codes not covered by the existing registry: an action's `trigger.ref` pointing at a nonexistent action id, a branch's `on` pointing at a nonexistent action id, a branch case missing an outcome the `on` action could produce is NOT an error (per design, unhandled outcomes just don't branch) — but a `branch.cases` key using an invalid outcome IS already caught by the SCHEMA_INVALID path (enum violation), so no new code needed there. The genuinely new semantic (non-schema) checks are: trigger ref resolution and branch `on` resolution.

- [ ] **Step 1: Add two new error codes**

Add to `shared/error-codes.json` (insert after `REF_BRANCH_TARGET_UNKNOWN`, keeping the existing entries unchanged):

```json
    "REF_TRIGGER_ACTION_UNKNOWN": {
      "severity": "error",
      "category": "reference",
      "message": "trigger references unknown action '{ref}'.",
      "spec_ref": "frameless-action-model-design §Action Identity and Ordering"
    },
    "REF_BRANCH_ON_UNKNOWN": {
      "severity": "error",
      "category": "reference",
      "message": "branch 'on' references unknown action '{ref}'.",
      "spec_ref": "frameless-action-model-design §Branching"
    },
```

(Use a plain text editor edit, not literal ` `-style escapes typed by hand — write the actual `§` character or ASCII-safe wording; whichever this repo's existing entries use for non-ASCII, check first:)

```bash
grep -n 'spec_ref' shared/error-codes.json | head -3
```

Match that file's existing escaping convention exactly (it already uses `§` for `§` per the codes already read during planning — reuse the same pattern, not a different one).

- [ ] **Step 2: Verify the registry is still valid JSON**

```bash
python3 -m json.tool shared/error-codes.json > /dev/null && echo "valid JSON"
```

Expected: `valid JSON`.

- [ ] **Step 3: Commit**

```bash
git add shared/error-codes.json
git commit -m "feat: add REF_TRIGGER_ACTION_UNKNOWN and REF_BRANCH_ON_UNKNOWN error codes"
```

---

### Task 8: Build v2 reference rules (TypeScript) — entity/ball/named-position/trigger/branch-on resolution

**Files:**
- Create: `packages/ts/src/v2/rules/references.ts`
- Test: `packages/ts/test/unit/v2/references.test.ts`

This is the v2 equivalent of `v1/rules/references.ts`, walking `actions[]` (recursing into branches via `walkActions`) instead of `frames[].actions[]`, and adding two new checks (`trigger.ref`, `branch.on`) that didn't exist in v1.

- [ ] **Step 1: Read the v1 equivalent for reference (already read in full during planning — reproduced here for this file's structure)**

The v1 `references.ts` (now at `packages/ts/src/v1/rules/references.ts` after Task 3) walks every frame's actions checking `player`/`for_player`/`on_player`/`to_player` against `ctx.entityRefs`, `ball_id` against `ctx.ballIds`, `branches` targets against `ctx.frameIds`, and recursively checks every `named` coordinate against the position registry.

- [ ] **Step 2: Write the failing test**

Create `packages/ts/test/unit/v2/references.test.ts`:

```typescript
import { test, expect } from "vitest";
import { referenceRulesV2 } from "../../../src/v2/rules/references.js";
import { buildContextV2 } from "../../../src/v2/context.js";

function ctxFor(doc: Record<string, unknown>) {
  return buildContextV2(doc);
}

test("flags an action referencing an unknown entity", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [{ id: "a1", player: "offense_9", type: "cut", moves: [{ to: { x: 1, y: 1 } }] }],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_ENTITY_UNKNOWN")).toBe(true);
});

test("flags a trigger.ref pointing at an unknown action id", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [
      { id: "a1", player: "offense_1", type: "move", moves: [{ to: { x: 1, y: 1 } }],
        trigger: { type: "action_end", ref: "does_not_exist" } },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_TRIGGER_ACTION_UNKNOWN")).toBe(true);
});

test("accepts a trigger.ref pointing at a real action id", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [
      { id: "a1", player: "offense_1", type: "move", moves: [{ to: { x: 1, y: 1 } }] },
      { id: "a2", player: "offense_1", type: "move", moves: [{ to: { x: 2, y: 2 } }],
        trigger: { type: "action_end", ref: "a1" } },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_TRIGGER_ACTION_UNKNOWN")).toBe(false);
});

test("flags a branch.on pointing at an unknown action id", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "does_not_exist", cases: { make: { actions: [], then: null } } },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_BRANCH_ON_UNKNOWN")).toBe(true);
});

test("accepts a branch.on pointing at a real action id", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: null } } },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_BRANCH_ON_UNKNOWN")).toBe(false);
});

test("flags an action referencing an unknown ball_id", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }, { type: "offense", nr: 2, x: 1, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    actions: [{ id: "a1", player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_9" }],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_BALL_UNKNOWN")).toBe(true);
});

test("checks reference integrity inside nested branch case actions too", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      {
        id: "branch_1", on: "a1",
        cases: { make: { actions: [{ id: "a2", player: "offense_9", type: "move", moves: [{ to: { x: 1, y: 1 } }] }], then: null } },
      },
    ],
  };
  const issues = referenceRulesV2(doc, ctxFor(doc));
  expect(issues.some((i) => i.code === "REF_ENTITY_UNKNOWN" && i.path.includes("/cases/make/"))).toBe(true);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/ts && npx vitest run test/unit/v2/references.test.ts
```

Expected: FAIL — `v2/rules/references.ts` doesn't exist.

- [ ] **Step 4: Write `packages/ts/src/v2/rules/references.ts`**

```typescript
import type { Issue } from "../../types.js";
import { walkActions, isBranch, type DocContextV2 } from "../context.js";
import { known_namedPositions } from "../../named-positions.js";
import { makeIssue } from "../../codes.js";

const _ENTITY_KEYS = ["player", "for_player", "on_player", "to_player", "guards_player", "around_player", "off_screen_by"];

function walkNamed(
  node: unknown,
  pointer: string,
  known: Set<string>,
  out: Issue[],
): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkNamed(v, `${pointer}/${i}`, known, out));
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const named = obj.named;
    if (typeof named === "string" && !known.has(named)) {
      out.push(makeIssue("REF_NAMED_POS_UNKNOWN", `${pointer}/named`, { ref: named }));
    }
    for (const [k, v] of Object.entries(obj)) walkNamed(v, `${pointer}/${k}`, known, out);
  }
}

export function referenceRulesV2(doc: Record<string, unknown>, ctx: DocContextV2): Issue[] {
  const issues: Issue[] = [];
  const known = known_namedPositions(doc);
  const topLevel = ((doc.actions ?? []) as Record<string, unknown>[]);

  walkActions(topLevel, (item, path) => {
    if (isBranch(item)) {
      const on = item.on;
      if (typeof on === "string" && !ctx.actionIds.has(on)) {
        issues.push(makeIssue("REF_BRANCH_ON_UNKNOWN", `${path}/on`, { ref: on }));
      }
      return;
    }
    const action = item;
    for (const key of _ENTITY_KEYS) {
      const ref = action[key];
      if (typeof ref === "string" && !ctx.entityRefs.has(ref)) {
        issues.push(makeIssue("REF_ENTITY_UNKNOWN", `${path}/${key}`, { ref }));
      }
    }
    const ballId = action.ball_id;
    if (typeof ballId === "string" && !ctx.ballIds.has(ballId)) {
      issues.push(makeIssue("REF_BALL_UNKNOWN", `${path}/ball_id`, { ref: ballId }));
    }
    const ballIds = action.ball_ids;
    if (Array.isArray(ballIds)) {
      ballIds.forEach((bid, i) => {
        if (typeof bid === "string" && !ctx.ballIds.has(bid)) {
          issues.push(makeIssue("REF_BALL_UNKNOWN", `${path}/ball_ids/${i}`, { ref: bid }));
        }
      });
    }
    const trigger = action.trigger as Record<string, unknown> | undefined;
    if (trigger && typeof trigger.ref === "string" && !ctx.actionIds.has(trigger.ref)) {
      issues.push(makeIssue("REF_TRIGGER_ACTION_UNKNOWN", `${path}/trigger/ref`, { ref: trigger.ref }));
    }
    walkNamed(action.moves, `${path}/moves`, known, issues);
  });

  return issues;
}
```

Check `named-positions.ts`'s actual exported function name before using `known_namedPositions` — it was not read in full during planning:

```bash
grep -n "^export" packages/ts/src/named-positions.ts
```

Fix the import name in the file above to match whatever that file actually exports (likely `knownNamed` or similar, following the Python module's `known_named` naming seen in `packages/py/ocf_validator/named_positions.py`) — do not leave a guessed name that doesn't compile.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/ts && npx vitest run test/unit/v2/references.test.ts
```

Expected: PASS (all 7 tests). If the named-position import was wrong, fix it now per Step 4's note and re-run.

- [ ] **Step 6: Commit**

```bash
git add packages/ts/src/v2/rules/references.ts packages/ts/test/unit/v2/references.test.ts
git commit -m "feat(ts): v2 reference rules (entity/ball/named-position/trigger/branch-on resolution)"
```

---

### Task 9: Mirror Task 8 in Python

**Files:**
- Create: `packages/py/ocf_validator/v2/rules.py` (references section)
- Test: `packages/py/tests/v2/test_rules.py` (references section)

- [ ] **Step 1: Write the failing tests**

Create `packages/py/tests/v2/test_rules.py`:

```python
from ocf_validator.v2.context import build_context_v2
from ocf_validator.v2.rules import reference_rules_v2


def test_flags_unknown_entity_reference():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [{"id": "a1", "player": "offense_9", "type": "cut", "moves": [{"to": {"x": 1, "y": 1}}]}],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_ENTITY_UNKNOWN" for i in issues)


def test_flags_unknown_trigger_ref():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "move", "moves": [{"to": {"x": 1, "y": 1}}],
             "trigger": {"type": "action_end", "ref": "does_not_exist"}},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_TRIGGER_ACTION_UNKNOWN" for i in issues)


def test_accepts_known_trigger_ref():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "move", "moves": [{"to": {"x": 1, "y": 1}}]},
            {"id": "a2", "player": "offense_1", "type": "move", "moves": [{"to": {"x": 2, "y": 2}}],
             "trigger": {"type": "action_end", "ref": "a1"}},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert not any(i.code == "REF_TRIGGER_ACTION_UNKNOWN" for i in issues)


def test_flags_unknown_branch_on():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "shoot"},
            {"id": "branch_1", "on": "does_not_exist", "cases": {"make": {"actions": [], "then": None}}},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_BRANCH_ON_UNKNOWN" for i in issues)


def test_flags_unknown_ball_id():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "offense", "nr": 2, "x": 1, "y": 5}],
        "balls": [{"id": "ball_1", "carried_by": "offense_1"}],
        "actions": [{"id": "a1", "player": "offense_1", "type": "pass", "to_player": "offense_2", "ball_id": "ball_9"}],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_BALL_UNKNOWN" for i in issues)


def test_checks_references_inside_nested_branch_cases():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "shoot"},
            {
                "id": "branch_1", "on": "a1",
                "cases": {"make": {"actions": [{"id": "a2", "player": "offense_9", "type": "move", "moves": [{"to": {"x": 1, "y": 1}}]}], "then": None}},
            },
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_ENTITY_UNKNOWN" and "/cases/make/" in i.path for i in issues)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/py && python -m pytest tests/v2/test_rules.py -v
```

Expected: FAIL — `ocf_validator.v2.rules` doesn't exist.

- [ ] **Step 3: Write `packages/py/ocf_validator/v2/rules.py`**

```python
from typing import Any

from ..codes import make_issue
from ..named_positions import known_named
from ..types import Issue
from .context import DocContextV2, is_branch, walk_actions

_ENTITY_KEYS = ("player", "for_player", "on_player", "to_player", "guards_player", "around_player", "off_screen_by")

# Same entity-ref keys as _ENTITY_KEYS, but checked again here because
# move_step objects (inside moves[]) carry their own around_player/
# off_screen_by, independent of any same-named key on the enclosing action
# (e.g. action_cut has both a top-level around_player default AND a per-step
# override). Both real conformance fixtures (transition-3v2.ocf.json,
# pick-and-roll.ocf.json) use the move_step-level field, so this is not
# optional — omitting it silently lets a bad move_step reference through
# with zero issues raised (caught the hard way in the TS mirror, fixed
# there in commit eeb94c9 after Task 8 shipped without it).
_MOVE_STEP_ENTITY_KEYS = ("around_player", "off_screen_by")


def _walk_named(node: Any, pointer: str, known: set[str], entity_refs: dict, out: list[Issue]) -> None:
    if isinstance(node, list):
        for i, v in enumerate(node):
            _walk_named(v, f"{pointer}/{i}", known, entity_refs, out)
    elif isinstance(node, dict):
        named = node.get("named")
        if isinstance(named, str) and named not in known:
            out.append(make_issue("REF_NAMED_POS_UNKNOWN", f"{pointer}/named", {"ref": named}))
        for key in _MOVE_STEP_ENTITY_KEYS:
            ref = node.get(key)
            if isinstance(ref, str) and ref not in entity_refs:
                out.append(make_issue("REF_ENTITY_UNKNOWN", f"{pointer}/{key}", {"ref": ref}))
        for k, v in node.items():
            _walk_named(v, f"{pointer}/{k}", known, entity_refs, out)


def reference_rules_v2(doc: dict[str, Any], ctx: DocContextV2) -> list[Issue]:
    issues: list[Issue] = []
    known = known_named(doc)
    top_level = doc.get("actions") or []

    def _check(item: dict[str, Any], path: str) -> None:
        if is_branch(item):
            on = item.get("on")
            if isinstance(on, str) and on not in ctx.action_ids:
                issues.append(make_issue("REF_BRANCH_ON_UNKNOWN", f"{path}/on", {"ref": on}))
            return
        for key in _ENTITY_KEYS:
            ref = item.get(key)
            if isinstance(ref, str) and ref not in ctx.entity_refs:
                issues.append(make_issue("REF_ENTITY_UNKNOWN", f"{path}/{key}", {"ref": ref}))
        ball_id = item.get("ball_id")
        if isinstance(ball_id, str) and ball_id not in ctx.ball_ids:
            issues.append(make_issue("REF_BALL_UNKNOWN", f"{path}/ball_id", {"ref": ball_id}))
        ball_ids = item.get("ball_ids")
        if isinstance(ball_ids, list):
            for i, bid in enumerate(ball_ids):
                if isinstance(bid, str) and bid not in ctx.ball_ids:
                    issues.append(make_issue("REF_BALL_UNKNOWN", f"{path}/ball_ids/{i}", {"ref": bid}))
        trigger = item.get("trigger")
        if isinstance(trigger, dict):
            ref = trigger.get("ref")
            if isinstance(ref, str) and ref not in ctx.action_ids:
                issues.append(make_issue("REF_TRIGGER_ACTION_UNKNOWN", f"{path}/trigger/ref", {"ref": ref}))
        _walk_named(item.get("moves"), f"{path}/moves", known, ctx.entity_refs, issues)

        side_effects = item.get("side_effects")
        if isinstance(side_effects, list):
            for i, se in enumerate(side_effects):
                on_ref = se.get("on") if isinstance(se, dict) else None
                if isinstance(on_ref, str) and on_ref not in ctx.entity_refs:
                    issues.append(make_issue("REF_ENTITY_UNKNOWN", f"{path}/side_effects/{i}/on", {"ref": on_ref}))

    walk_actions(top_level, _check)
    return issues
```

Check `named_positions.py`'s actual exported function signature before assuming `known_named(doc)` matches (it was read in full during planning — `known_named` takes the whole `doc`, confirmed from the v1 `rules.py`'s usage `known_named(doc)` at the top of `reference_rules`). This matches; no fix needed.

**Second fix required, found by the same review pass as the move_step one above:** `side_effect.on` (a required `entity_ref`) is present in `side_effects[]` on every v2 action type in the real schema (`schema/v1.json:245`, referenced from ~12 action definitions), but was completely unchecked in the original TS implementation — same bug class as the move_step gap, fixed in TS commit `c7be0f3`. The Python code above already includes this fix (the `side_effects` block just before `walk_actions(top_level, _check)`); do not omit it.

Also add these two tests to `test_rules.py` (mirroring the TS regression tests added in commits `eeb94c9`/`c7be0f3` after Task 8 shipped without move_step- and side_effects-level checking):

```python
def test_flags_unknown_entity_in_side_effects_on():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "dribble", "ball_id": "ball_1",
             "moves": [{"to": {"x": 1, "y": 1}}],
             "side_effects": [{"type": "screen", "on": "defense_9"}]},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_ENTITY_UNKNOWN" and "side_effects" in i.path for i in issues)


def test_accepts_known_entity_in_side_effects_on():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "defense", "nr": 1, "x": 0, "y": 6}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "dribble", "ball_id": "ball_1",
             "moves": [{"to": {"x": 1, "y": 1}}],
             "side_effects": [{"type": "screen", "on": "defense_1"}]},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert not any(i.code == "REF_ENTITY_UNKNOWN" for i in issues)
```

```python
def test_flags_unknown_around_player_inside_move_step():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "dribble", "ball_id": "ball_1",
             "moves": [{"to": {"x": 1, "y": 1}, "around_player": "offense_9"}]},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert any(i.code == "REF_ENTITY_UNKNOWN" and "around_player" in i.path for i in issues)


def test_accepts_known_around_player_inside_move_step():
    doc = {
        "entities": [{"type": "offense", "nr": 1, "x": 0, "y": 5}, {"type": "defense", "nr": 1, "x": 0, "y": 6}],
        "actions": [
            {"id": "a1", "player": "offense_1", "type": "dribble", "ball_id": "ball_1",
             "moves": [{"to": {"x": 1, "y": 1}, "around_player": "defense_1"}]},
        ],
    }
    issues = reference_rules_v2(doc, build_context_v2(doc))
    assert not any(i.code == "REF_ENTITY_UNKNOWN" for i in issues)
```

Expected test count after this task: **8 tests** (the original 6 plus these 2), not 6 as an earlier draft of this task said.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/py && python -m pytest tests/v2/test_rules.py -v
```

Expected: PASS (all 10 tests — the original 6, plus 2 move_step-entity-ref tests, plus 2 side_effects-entity-ref tests, all added above).

- [ ] **Step 5: Commit**

```bash
git add packages/py/ocf_validator/v2/rules.py packages/py/tests/v2/test_rules.py
git commit -m "feat(py): v2 reference rules (entity/ball/named-position/trigger/branch-on resolution)"
```

---

### Task 10: Build v2 possession rules (TypeScript) — actor-chain-based, no frame-scoped carrier map

**Files:**
- Modify: `packages/ts/src/v2/rules/references.ts` is separate; create `packages/ts/src/v2/rules/possession.ts`
- Test: `packages/ts/test/unit/v2/possession.test.ts`

The v1 possession model resets a "carrier map" at each frame boundary from a pre-computed per-frame snapshot (`possessionByFrame`). v2 has no frame boundaries — possession must be tracked as a SINGLE running state across the entire flat `actions[]` sequence (walked in document order via `walkActions`), seeded once from `balls[]` setup, updated after every ball-affecting action, and — per the design's confirmed decision — checked with the SAME binary per-actor rule as v1: an actor holding ANY ball may not `move`/`cut`. Two-ball dribbling (`ball_ids` with 2 entries) means the carrier map must track that BOTH ids point to the same carrier after such an action, and a would-be `move`/`cut` check for that actor must see them as holding a ball if either of their `ball_ids` is still carried by them.

Branches complicate the running state: each `branch_case`'s `actions[]` is a hypothetical alternate continuation, not a sequential extension of the SAME timeline — the carrier state entering EACH case must be a copy of the state as of the branch's `on` action, not accumulated across cases (a `miss` case must not see effects from the `make` case, since only one of them ever happens for a given ball). Recursion into a case must fork the carrier map, not share it.

- [ ] **Step 1: Write the failing test**

Create `packages/ts/test/unit/v2/possession.test.ts`:

```typescript
import { test, expect } from "vitest";
import { possessionRulesV2 } from "../../../src/v2/rules/possession.js";
import { buildContextV2 } from "../../../src/v2/context.js";

function run(doc: Record<string, unknown>) {
  return possessionRulesV2(doc, buildContextV2(doc));
}

test("flags a move by the current ball carrier", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    actions: [{ id: "a1", player: "offense_1", type: "move", moves: [{ to: { x: 1, y: 1 } }] }],
  };
  const issues = run(doc);
  expect(issues.some((i) => i.code === "BALL_CARRIER_MISMATCH" || i.code === "POSSESSION_INVALID_MOVE")).toBe(true);
});

test("allows a move by a player NOT carrying the ball", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }, { type: "offense", nr: 2, x: 1, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    actions: [{ id: "a1", player: "offense_2", type: "move", moves: [{ to: { x: 2, y: 2 } }] }],
  };
  const issues = run(doc);
  expect(issues).toEqual([]);
});

test("possession transfers after a pass, and dribble by the new carrier is fine", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }, { type: "offense", nr: 2, x: 1, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    actions: [
      { id: "a1", player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
      { id: "a2", player: "offense_2", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 3, y: 3 } }],
        trigger: { type: "reception" } },
    ],
  };
  const issues = run(doc);
  expect(issues).toEqual([]);
});

test("a pass by a non-carrier is flagged", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }, { type: "offense", nr: 2, x: 1, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    actions: [{ id: "a1", player: "offense_2", type: "pass", to_player: "offense_1", ball_id: "ball_1" }],
  };
  const issues = run(doc);
  expect(issues.some((i) => i.code === "BALL_CARRIER_MISMATCH")).toBe(true);
});

test("two-ball dribble (ball_ids) is not flagged as invalid movement", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }, { id: "ball_2", carried_by: "offense_1" }],
    actions: [{ id: "a1", player: "offense_1", type: "dribble", ball_ids: ["ball_1", "ball_2"], moves: [{ to: { x: 1, y: 1 } }] }],
  };
  const issues = run(doc);
  expect(issues).toEqual([]);
});

test("a branch's miss case does not see the make case's carrier changes", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }, { type: "offense", nr: 2, x: 1, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    actions: [
      { id: "a1", player: "offense_1", type: "shoot", ball_id: "ball_1" },
      {
        id: "branch_1", on: "a1",
        cases: {
          make: {
            actions: [{ id: "a2", player: "offense_2", type: "pass", to_player: "offense_1", ball_id: "ball_1" }],
            then: null,
          },
          miss: {
            // offense_1 still "shot" the ball (possession-wise, ball left them on shoot),
            // so offense_2 passing ball_1 here (which they never had) should ALSO be flagged
            // as BALL_CARRIER_MISMATCH -- proving miss's state is independent of make's.
            actions: [{ id: "a3", player: "offense_2", type: "pass", to_player: "offense_1", ball_id: "ball_1" }],
            then: null,
          },
        },
      },
    ],
  };
  const issues = run(doc);
  const missIssue = issues.find((i) => i.code === "BALL_CARRIER_MISMATCH" && i.path.includes("a3"));
  expect(missIssue).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/ts && npx vitest run test/unit/v2/possession.test.ts
```

Expected: FAIL — `v2/rules/possession.ts` doesn't exist.

- [ ] **Step 3: Write `packages/ts/src/v2/rules/possession.ts`**

```typescript
import type { Issue } from "../../types.js";
import { walkActions, isBranch, type DocContextV2 } from "../context.js";
import { makeIssue } from "../../codes.js";

const BALL_DEPENDENT = new Set(["pass", "shoot", "dribble"]);
const PICKUP = new Set(["pickup", "rebound"]);
const NO_BALL_MOVEMENT = new Set(["move", "cut"]);

type CarrierMap = Map<string, string | null>; // ball_id -> carrying player, or null if loose/dead
type LooseSet = Set<string>;

function resolveBallIds(action: Record<string, unknown>): string[] {
  if (typeof action.ball_id === "string") return [action.ball_id];
  if (Array.isArray(action.ball_ids)) return action.ball_ids.filter((b): b is string => typeof b === "string");
  return [];
}

function playerHoldsAnyBall(player: string, carrier: CarrierMap): boolean {
  for (const holder of carrier.values()) if (holder === player) return true;
  return false;
}

function applyEffect(
  type: string,
  player: string,
  action: Record<string, unknown>,
  ballIds: string[],
  carrier: CarrierMap,
  loose: LooseSet,
): void {
  for (const ball of ballIds) {
    switch (type) {
      case "pass": {
        const to = action.to_player;
        carrier.set(ball, typeof to === "string" ? to : null);
        loose.delete(ball);
        break;
      }
      case "shoot":
        carrier.set(ball, null);
        loose.delete(ball);
        break;
      case "pickup":
      case "rebound":
        carrier.set(ball, player);
        loose.delete(ball);
        break;
      // dribble: carrier unchanged
    }
  }
}

export function possessionRulesV2(doc: Record<string, unknown>, ctx: DocContextV2): Issue[] {
  const issues: Issue[] = [];

  const carrier: CarrierMap = new Map();
  const loose: LooseSet = new Set();
  for (const b of ((doc.balls ?? []) as Record<string, unknown>[])) {
    const id = b.id;
    if (typeof id !== "string") continue;
    carrier.set(id, typeof b.carried_by === "string" ? b.carried_by : null);
    if (b.at !== undefined) loose.add(id);
  }

  function checkAndApply(item: Record<string, unknown>, path: string, localCarrier: CarrierMap, localLoose: LooseSet): void {
    if (isBranch(item)) {
      const cases = (item.cases ?? {}) as Record<string, { actions?: Record<string, unknown>[] }>;
      for (const [outcome, branchCase] of Object.entries(cases)) {
        // Fork state per case: each outcome is a hypothetical alternate
        // continuation, not a sequential extension shared with sibling cases.
        const forkedCarrier = new Map(localCarrier);
        const forkedLoose = new Set(localLoose);
        const nested = branchCase.actions ?? [];
        nested.forEach((child, i) => checkAndApply(child, `${path}/cases/${outcome}/actions/${i}`, forkedCarrier, forkedLoose));
      }
      return;
    }

    const type = item.type as string;
    const player = item.player as string;

    if (NO_BALL_MOVEMENT.has(type) && playerHoldsAnyBall(player, localCarrier)) {
      issues.push(makeIssue("BALL_CARRIER_MISMATCH", path, { player, action: type }));
      return;
    }

    if (BALL_DEPENDENT.has(type)) {
      const ballIds = resolveBallIds(item);
      for (const ball of ballIds) {
        if (localCarrier.get(ball) !== player) {
          issues.push(makeIssue("BALL_CARRIER_MISMATCH", path, { player, action: type, ball_id: ball }));
        }
      }
      if (ctx.entityRefs.get(player)?.type === "defense") {
        issues.push(makeIssue("ACTION_UNUSUAL_CARRIER", path, { player, action: type }));
      }
      applyEffect(type, player, item, ballIds, localCarrier, localLoose);
    } else if (PICKUP.has(type)) {
      const ballIds = resolveBallIds(item);
      for (const ball of ballIds) {
        if (!localLoose.has(ball)) {
          issues.push(makeIssue("BALL_NOT_AT_LOCATION", path, { player, action: type }));
        } else {
          applyEffect(type, player, item, [ball], localCarrier, localLoose);
        }
      }
    }
  }

  const topLevel = ((doc.actions ?? []) as Record<string, unknown>[]);
  topLevel.forEach((item, i) => checkAndApply(item, `/actions/${i}`, carrier, loose));

  return issues;
}
```

Note: this deliberately drops the v1 `BALL_AMBIGUOUS` check (resolving a ball_id when it's omitted and multiple balls exist) — v2's `resolveBallIds` returns an empty array when neither `ball_id` nor `ball_ids` is present, meaning a ball-dependent action with no ball reference at all produces NO possession check rather than an ambiguity error. Confirm this is acceptable: check whether the v2 schema (Plan 1) makes `ball_id`/`ball_ids` required on ball-dependent action types — if it does, this gap can't occur in a schema-valid document and the omission is fine; if `ball_id` remains OPTIONAL on `pass`/`shoot`/`dribble` in the v2 schema (it does — Plan 1 did not change this), then port the v1 `BALL_AMBIGUOUS` behavior here too:

```bash
grep -A5 '"action_pass"' /Users/oliver-marcuseder/01-vibe-coding/00-Basektball/open-coaching-format/spec-frameless-action-model/schema/v1.json | grep required
```

If `ball_id` is confirmed still optional (it is, per Plan 1 — only `to_player` is required on `action_pass`), add the `BALL_AMBIGUOUS` check back before finalizing this file: change `resolveBallIds` to return a sentinel or have the caller check `ctx.ballIds.size` when the action provides neither `ball_id` nor `ball_ids`, mirroring the v1 `resolveBallId` function's exact logic (single ball in doc → assume it; zero balls → no check; 2+ balls → `BALL_AMBIGUOUS`). Update the test file to add this case back (mirroring v1's `possession-rules.test.ts`, which was not re-read in this plan but should be checked for its exact `BALL_AMBIGUOUS` test shape before writing the v2 equivalent) before moving to Step 4.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/ts && npx vitest run test/unit/v2/possession.test.ts
```

Expected: PASS (all 6 tests, plus the `BALL_AMBIGUOUS` test if added per Step 3's note).

- [ ] **Step 5: Commit**

```bash
git add packages/ts/src/v2/rules/possession.ts packages/ts/test/unit/v2/possession.test.ts
git commit -m "feat(ts): v2 possession rules (running carrier state, branch-case forking, two-ball support)"
```

---

### Task 11: Mirror Task 10 in Python

**Files:**
- Create: `packages/py/ocf_validator/v2/possession_rules.py`
- Test: `packages/py/tests/v2/test_possession_rules.py`

- [ ] **Step 1: Write the failing tests**

Create `packages/py/tests/v2/test_possession_rules.py` — mirror every test from Task 10 Step 1 exactly, translated to pytest/dict syntax (same 6 test cases: carrier-move-flagged, non-carrier-move-allowed, pass-then-dribble-by-new-carrier, pass-by-non-carrier-flagged, two-ball-dribble-not-flagged, branch-case-state-forking). Use `from ocf_validator.v2.possession_rules import possession_rules_v2` and `from ocf_validator.v2.context import build_context_v2`.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/py && python -m pytest tests/v2/test_possession_rules.py -v
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write `packages/py/ocf_validator/v2/possession_rules.py`**

Direct Python translation of Task 10 Step 3's TypeScript, following the same structure (`_resolve_ball_ids`, `_player_holds_any_ball`, `_apply_effect`, `possession_rules_v2` with a nested `_check_and_apply` closure that forks `carrier`/`loose` per branch case via `dict(carrier)`/`set(loose)` copies). Apply the SAME `BALL_AMBIGUOUS` decision made in Task 10 Step 3 (port it if TS did; skip if TS didn't) — keep both languages' behavior identical.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/py && python -m pytest tests/v2/test_possession_rules.py -v
```

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add packages/py/ocf_validator/v2/possession_rules.py packages/py/tests/v2/test_possession_rules.py
git commit -m "feat(py): v2 possession rules (running carrier state, branch-case forking, two-ball support)"
```

---

### Task 12: Build v2 branch-terminal and continuum rules (both languages)

**Files:**
- Create: `packages/ts/src/v2/rules/branch.ts`, `packages/ts/test/unit/v2/branch.test.ts`
- Create: `packages/py/ocf_validator/v2/branch_rules.py`, `packages/py/tests/v2/test_branch_rules.py`

The schema (Plan 2, Task 1) already requires `then` on every `branch_case` (can't be schema-absent), so a "missing then" is already a `SCHEMA_INVALID` case, not a new semantic rule. What the schema CANNOT check: whether a `branch_case.then` value (when not `null`) resolves to a real action id, and — for `continuum: true` documents — whether the document's terminal state actually loops back to setup (or a designated anchor). This task covers the `then`-resolution check now; full continuum tolerance checking is explicitly OUT of scope (per the design doc's own deferral) — this task only adds a structural check that a continuum document has at least one branch case or top-level terminal that plausibly loops (a `then` pointing at an EARLIER action id, i.e. backwards in the flat sequence), as a first approximation, and emits a warning (not an error) if `continuum: true` is set but no `then` in the entire document points backwards — since a fuller check requires resolving actual positions, deferred to a future task per the design doc's own scoping.

**Files:**
- Create: `packages/ts/src/v2/rules/branch.ts`
- Test: `packages/ts/test/unit/v2/branch.test.ts`

- [ ] **Step 1: Add a new error code for unresolved `then`**

Add to `shared/error-codes.json` (same file, same convention as Task 7):

```json
    "REF_BRANCH_THEN_UNKNOWN": {
      "severity": "error",
      "category": "reference",
      "message": "branch case 'then' references unknown action '{ref}'.",
      "spec_ref": "frameless-action-model-design §Branching"
    },
    "CONTINUUM_NO_LOOP_BACK": {
      "severity": "warning",
      "category": "coherence",
      "message": "Document is marked continuum but no branch case's 'then' points to an earlier action id — this play may not actually loop.",
      "spec_ref": "frameless-action-model-design §Continuum (Looping Plays)"
    },
```

- [ ] **Step 2: Write the failing TypeScript test**

Create `packages/ts/test/unit/v2/branch.test.ts`:

```typescript
import { test, expect } from "vitest";
import { branchRulesV2 } from "../../../src/v2/rules/branch.js";
import { buildContextV2 } from "../../../src/v2/context.js";

function run(doc: Record<string, unknown>) {
  return branchRulesV2(doc, buildContextV2(doc));
}

test("flags a then pointing at an unknown action id", () => {
  const doc = {
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: "does_not_exist" } } },
    ],
  };
  const issues = run(doc);
  expect(issues.some((i) => i.code === "REF_BRANCH_THEN_UNKNOWN")).toBe(true);
});

test("accepts then: null (explicit terminal)", () => {
  const doc = {
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: null } } },
    ],
  };
  expect(run(doc)).toEqual([]);
});

test("accepts then pointing at a real, earlier action id (loop anchor)", () => {
  const doc = {
    actions: [
      { id: "a0", player: "offense_1", type: "move", moves: [{ to: { x: 0, y: 0 } }] },
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: "a0" } } },
    ],
  };
  expect(run(doc)).toEqual([]);
});

test("warns when continuum:true but nothing loops backward", () => {
  const doc = {
    continuum: true,
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: null }, miss: { actions: [], then: null } } },
    ],
  };
  const issues = run(doc);
  expect(issues.some((i) => i.code === "CONTINUUM_NO_LOOP_BACK")).toBe(true);
});

test("no warning when continuum:true and a then loops backward", () => {
  const doc = {
    continuum: true,
    actions: [
      { id: "a0", player: "offense_1", type: "move", moves: [{ to: { x: 0, y: 0 } }] },
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: "a0" }, miss: { actions: [], then: null } } },
    ],
  };
  const issues = run(doc);
  expect(issues.some((i) => i.code === "CONTINUUM_NO_LOOP_BACK")).toBe(false);
});

test("no warning when continuum is absent/false", () => {
  const doc = {
    actions: [
      { id: "a1", player: "offense_1", type: "shoot" },
      { id: "branch_1", on: "a1", cases: { make: { actions: [], then: null } } },
    ],
  };
  expect(run(doc).some((i) => i.code === "CONTINUUM_NO_LOOP_BACK")).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/ts && npx vitest run test/unit/v2/branch.test.ts
```

Expected: FAIL — `v2/rules/branch.ts` doesn't exist.

- [ ] **Step 4: Write `packages/ts/src/v2/rules/branch.ts`**

```typescript
import type { Issue } from "../../types.js";
import { walkActions, isBranch, type DocContextV2 } from "../context.js";
import { makeIssue } from "../../codes.js";

/**
 * Position of every action id in flat document order (top-level only; a
 * nested branch-case action's "position" for loop-direction purposes is
 * defined as the position of the branch that contains it, since a loop
 * target is always compared against where a case's OWN branch sits).
 */
function topLevelPositions(topLevel: Record<string, unknown>[]): Map<string, number> {
  const positions = new Map<string, number>();
  topLevel.forEach((item, i) => {
    if (typeof item.id === "string") positions.set(item.id, i);
  });
  return positions;
}

export function branchRulesV2(doc: Record<string, unknown>, ctx: DocContextV2): Issue[] {
  const issues: Issue[] = [];
  const topLevel = ((doc.actions ?? []) as Record<string, unknown>[]);
  const positions = topLevelPositions(topLevel);
  let anyLoopsBackward = false;

  walkActions(topLevel, (item, path) => {
    if (!isBranch(item)) return;
    const branchPos = positions.get(item.id as string);
    const cases = (item.cases ?? {}) as Record<string, { then?: string | null }>;
    for (const [outcome, branchCase] of Object.entries(cases)) {
      const then = branchCase.then;
      if (then === null || then === undefined) continue;
      if (!ctx.actionIds.has(then)) {
        issues.push(makeIssue("REF_BRANCH_THEN_UNKNOWN", `${path}/cases/${outcome}/then`, { ref: then }));
        continue;
      }
      const targetPos = positions.get(then);
      if (branchPos !== undefined && targetPos !== undefined && targetPos < branchPos) {
        anyLoopsBackward = true;
      }
    }
  });

  if (doc.continuum === true && !anyLoopsBackward) {
    issues.push(makeIssue("CONTINUUM_NO_LOOP_BACK", "/continuum", {}));
  }

  return issues;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/ts && npx vitest run test/unit/v2/branch.test.ts
```

Expected: PASS (all 6 tests).

- [ ] **Step 6: Commit**

```bash
git add shared/error-codes.json packages/ts/src/v2/rules/branch.ts packages/ts/test/unit/v2/branch.test.ts
git commit -m "feat(ts): v2 branch rules (then resolution, continuum loop-back heuristic)"
```

---

### Task 13: Mirror Task 12 in Python

**Files:**
- Create: `packages/py/ocf_validator/v2/branch_rules.py`
- Test: `packages/py/tests/v2/test_branch_rules.py`

- [ ] **Step 1: Write the failing tests**

Mirror all 6 tests from Task 12 Step 2 in `packages/py/tests/v2/test_branch_rules.py`, using `from ocf_validator.v2.branch_rules import branch_rules_v2`.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/py && python -m pytest tests/v2/test_branch_rules.py -v
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write `packages/py/ocf_validator/v2/branch_rules.py`**

Direct Python translation of Task 12 Step 4's TypeScript (`_top_level_positions`, `branch_rules_v2` with the same walk-and-check-then, then the `continuum`/`any_loops_backward` check at the end).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/py && python -m pytest tests/v2/test_branch_rules.py -v
```

Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/py/ocf_validator/v2/branch_rules.py packages/py/tests/v2/test_branch_rules.py
git commit -m "feat(py): v2 branch rules (then resolution, continuum loop-back heuristic)"
```

---

### Task 14: Wire up `v2/validate.ts` and dispatch from the top-level `validate()`

**Files:**
- Create: `packages/ts/src/v2/validate.ts`
- Modify: `packages/ts/src/validate-file.ts` (or wherever the single public `validate`/`validateFile` entry point lives — read it first)

- [ ] **Step 1: Read the current top-level entry point**

```bash
cat packages/ts/src/index.ts
cat packages/ts/src/validate-file.ts
```

(`validate-file.ts` was referenced by the conformance test but not read in full during planning — read it now to see its exact current shape before modifying.)

- [ ] **Step 2: Write `packages/ts/src/v2/validate.ts`**

```typescript
import type { Issue, Result, OcfDoc, SchemaBlock } from "../types.js";
import { buildContextV2 } from "./context.js";
import { referenceRulesV2 } from "./rules/references.js";
import { possessionRulesV2 } from "./rules/possession.js";
import { branchRulesV2 } from "./rules/branch.js";

export function assembleV2(issues: Issue[], schema: SchemaBlock): Result {
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

export function validateV2(doc: OcfDoc, schemaBlock: SchemaBlock): Result {
  const ctx = buildContextV2(doc as Record<string, unknown>);
  const issues: Issue[] = [
    ...referenceRulesV2(doc as Record<string, unknown>, ctx),
    ...possessionRulesV2(doc as Record<string, unknown>, ctx),
    ...branchRulesV2(doc as Record<string, unknown>, ctx),
  ];
  return assembleV2(issues, schemaBlock);
}
```

Note: v2 has no `qualityRules`/`coherenceRules` equivalent yet — `quality.ts`'s checks (off-court entities, WCAG contrast, `EMPTY_FRAME`) are either sport/court-geometry checks that don't depend on the frame model at all (off-court, contrast — these should be ported as-is, they don't reference `frames`) or are frame-specific and structurally obsolete (`EMPTY_FRAME` — no longer meaningful since an empty top-level `actions[]` is valid per Plan 2's finding). `coherence.ts`'s two checks (`END_STATE_DISAGREE`, `START_STATE_DISCONTINUITY`) are ENTIRELY obsolete — there is no `end_state`/`start_state` in v2 at all. This task does NOT port quality/coherence — flagged as a follow-up (see Plan 3 completion checklist) rather than silently ported wrong; the important reference/possession/branch coverage is what this plan delivers.

- [ ] **Step 3: Modify the top-level entry point to dispatch on major version**

Read whichever file currently calls `validate()` from `./validate.js` (likely `validate-file.ts` and/or `index.ts`, confirmed by Step 1's read) and change it to import BOTH `validate` (now at `./v1/validate.js`, per Task 3) and the new `validateV2`, dispatching via `effectiveMajorOf(doc)` from `schema-version.js` (added in Task 1):

The exact edit depends on what Step 1's read shows — the general shape is: wherever the old code did

```typescript
import { validate } from "./validate.js";
// ...
const result = validate(doc);
```

it becomes:

```typescript
import { validate as validateV1 } from "./v1/validate.js";
import { validateV2 } from "./v2/validate.js";
import { schemaCheck, effectiveMajorOf } from "./schema-version.js";
// ...
const major = effectiveMajorOf(doc);
const check = schemaCheck(doc);
if (check.majorUnsupported) {
  // existing majorUnsupported short-circuit, unchanged
}
const result = major === "v1" ? validateV1(doc) : validateV2(doc, check.block);
```

Apply this pattern to the ACTUAL file structure found in Step 1 — do not assume the exact function/variable names match this sketch; read the real file and adapt precisely, preserving every existing behavior for the v1 path (the `outdated`/`VALIDATOR_MAYBE_OUTDATED` warning injection, the `majorUnsupported` short-circuit, the `level0`/schema-level early-return) since `validateV1` (the renamed old `validate`) already has all of that logic internally — the dispatch layer's job is ONLY to choose which of `validateV1`/`validateV2` runs, not to duplicate their internals.

- [ ] **Step 4: Run the full test suite**

```bash
cd packages/ts && npx vitest run
```

Expected: PASS for everything except the v2 conformance suite (Task 16 hasn't migrated the v2 fixtures yet — if `conformance.test.ts` already tries to read a `v2/` directory that doesn't exist yet, that's expected; it's addressed in Task 16). All v1 conformance tests must still pass unchanged (this is the load-bearing regression check for the whole plan: v1 behavior must be untouched).

- [ ] **Step 5: Commit**

```bash
git add packages/ts/src/v2/validate.ts packages/ts/src/validate-file.ts packages/ts/src/index.ts
git commit -m "feat(ts): dispatch validate() to v1 or v2 rule set based on declared schema major"
```

---

### Task 15: Mirror Task 14 in Python

**Files:**
- Create: `packages/py/ocf_validator/v2/validate.py`
- Modify: `packages/py/ocf_validator/__init__.py` (or wherever the public `validate`/`validate_file` entry point lives)

- [ ] **Step 1: Write `packages/py/ocf_validator/v2/validate.py`**

```python
from ..types import Issue, Result
from .branch_rules import branch_rules_v2
from .context import build_context_v2
from .possession_rules import possession_rules_v2
from .rules import reference_rules_v2


def _assemble_v2(issues: list[Issue], schema_block: dict) -> Result:
    errors = [i for i in issues if i.severity == "error"]
    warnings = [i for i in issues if i.severity == "warning"]
    return Result(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        summary={"errors": len(errors), "warnings": len(warnings)},
        schema=schema_block,
    )


def validate_v2(doc: dict, schema_block: dict) -> Result:
    ctx = build_context_v2(doc)
    issues: list[Issue] = []
    issues.extend(reference_rules_v2(doc, ctx))
    issues.extend(possession_rules_v2(doc, ctx))
    issues.extend(branch_rules_v2(doc, ctx))
    return _assemble_v2(issues, schema_block)
```

- [ ] **Step 2: Read and modify the top-level Python entry point**

```bash
cat packages/py/ocf_validator/__init__.py
```

Apply the same dispatch pattern as Task 14 Step 3, adapted to this file's actual current shape (import `validate` as `validate_v1` from `.v1.validate`, import `validate_v2` from `.v2.validate`, import `effective_major_of`/`schema_check` from `.schema_version`, dispatch on `effective_major_of(doc)`).

- [ ] **Step 3: Run the full test suite**

```bash
cd packages/py && python -m pytest
```

Expected: same as Task 14 Step 4 — PASS for everything except v2 conformance (not yet wired, Task 16).

- [ ] **Step 4: Commit**

```bash
git add packages/py/ocf_validator/v2/validate.py packages/py/ocf_validator/__init__.py
git commit -m "feat(py): dispatch validate() to v1 or v2 rule set based on declared schema major"
```

---

### Task 16: Split conformance fixtures into `v1/`/`v2/`, migrate v2 fixtures, update both conformance test runners

**Files:**
- Create: `shared/conformance/v1/` (move all existing files here, unchanged), `shared/conformance/v2/` (new, migrated fixtures)
- Modify: `packages/ts/test/conformance.test.ts`, `packages/py/tests/test_conformance.py`
- Delete: old flat `shared/conformance/{valid,invalid,warn}/` and `shared/conformance/cases.json` (moved into `v1/`)

- [ ] **Step 1: Move existing conformance fixtures under `v1/`**

```bash
mkdir -p shared/conformance/v1
git mv shared/conformance/valid shared/conformance/v1/valid
git mv shared/conformance/invalid shared/conformance/v1/invalid
git mv shared/conformance/warn shared/conformance/v1/warn
git mv shared/conformance/cases.json shared/conformance/v1/cases.json
```

Every fixture in `v1/valid/*.ocf.json` needs an explicit `"$schema": "https://opencoachingformat.org/schema/v1.json"` added if it doesn't already have one (since v2 is now the no-`$schema` default per Task 1's design note) — check each:

```bash
grep -L '"\$schema"' shared/conformance/v1/valid/*.json shared/conformance/v1/warn/*.json
```

For every file listed (missing `$schema`), add `"$schema": "https://opencoachingformat.org/schema/v1.json",` as the first key. Do the same check for `v1/invalid/*.json` — EXCEPT `invalid/malformed.json` (not valid JSON at all, don't touch) and `invalid/schema-major-v2.json` (its whole point is testing an UNSUPPORTED major, currently v2 — since v2 IS now supported, this fixture's premise is broken; see Step 2).

- [ ] **Step 2: Fix `v1/invalid/schema-major-v2.json`'s now-obsolete premise**

This fixture declared `$schema: .../v2.json` to test the "unsupported major" path — but v2 is now supported. Change it to test a genuinely unsupported major, `v3`:

```json
{
  "$schema": "https://opencoachingformat.org/schema/v3.json",
  "meta": { "id": "00000000-0000-4000-8000-000000000001", "title": "future major" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 } ],
  "frames": [ { "id": "f1", "actions": [], "end_state": { "offense_1": { "x": 0, "y": 5 } } } ]
}
```

Rename the file to reflect this:

```bash
git mv shared/conformance/v1/invalid/schema-major-v2.json shared/conformance/v1/invalid/schema-major-v3.json
```

Update `shared/conformance/v1/cases.json`'s matching entry's `"file"` value from `"invalid/schema-major-v2.json"` to `"invalid/schema-major-v3.json"`.

- [ ] **Step 3: Create `shared/conformance/v2/` with migrated fixtures**

```bash
mkdir -p shared/conformance/v2/valid shared/conformance/v2/invalid shared/conformance/v2/warn
```

Copy the already-migrated equivalents from the `spec` repo's Plan 2 output where they exist (these are the SAME underlying plays, already correctly migrated — reuse rather than re-migrate):

```bash
SPEC=/Users/oliver-marcuseder/01-vibe-coding/00-Basektball/open-coaching-format/spec-frameless-action-model
cp "$SPEC/examples/pick-and-roll.ocf.json" shared/conformance/v2/valid/pick-and-roll.ocf.json
cp "$SPEC/examples/3-man-weave.ocf.json" shared/conformance/v2/valid/3-man-weave.ocf.json
cp "$SPEC/examples/transition-3v2.ocf.json" shared/conformance/v2/valid/transition-3v2.ocf.json
cp "$SPEC/examples/quick-mode.ocf.json" shared/conformance/v2/valid/quick-mode.ocf.json
cp "$SPEC/examples/based-on-references.ocf.json" shared/conformance/v2/valid/external-references.ocf.json
```

For `action-intensity-physicality.json` (no `spec` repo equivalent — it's conformance-suite-only), migrate it by hand following the established pattern:

```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-000000000010", "title": "intensity and physicality fields" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [
    { "type": "offense", "nr": 1, "x": 0, "y": 5 },
    { "type": "offense", "nr": 2, "x": 1, "y": 5 },
    { "type": "defense", "nr": 1, "x": 0.5, "y": 5 }
  ],
  "balls": [ { "id": "ball_1", "carried_by": "offense_1" } ],
  "actions": [
    { "id": "a1", "player": "offense_2", "type": "screen", "for_player": "offense_1", "on_player": "defense_1", "variant": "ball_screen", "at": { "x": 0.5, "y": 6 }, "physicality": "aggressive" },
    { "id": "a2", "player": "offense_1", "type": "move", "moves": [ { "to": { "x": 0, "y": 6 } } ], "intensity": "explosive" },
    { "id": "a3", "player": "offense_1", "type": "pass", "to_player": "offense_2", "ball_id": "ball_1", "variant": "chest", "intensity": "hard" },
    { "id": "a4", "player": "offense_2", "type": "shoot", "ball_id": "ball_1", "variant": "layup", "result": "make", "intensity": "soft", "trigger": { "type": "reception" } }
  ]
}
```

Add `"$schema": "https://opencoachingformat.org/schema/v2.json"` to every one of the 5 copied files if not already present (the `spec` repo's migrated examples may or may not carry an explicit `$schema` — check and add if missing, matching this repo's convention of always declaring it explicitly in conformance fixtures).

- [ ] **Step 4: Create v2 invalid fixtures**

Migrate each `sem-*` fixture (read in full during planning) to the new shape, preserving each one's exact intended violation:

`shared/conformance/v2/invalid/sem-entity-unknown.json`:
```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-0000000000b1", "title": "action references unknown entity" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 } ],
  "actions": [ { "id": "a1", "player": "offense_9", "type": "cut", "moves": [ { "to": { "named": "basket" } } ] } ]
}
```

`shared/conformance/v2/invalid/sem-ball-unknown.json`:
```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-0000000000b2", "title": "action references unknown ball" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 }, { "type": "offense", "nr": 2, "x": 2, "y": 5 } ],
  "balls": [ { "id": "ball_1", "carried_by": "offense_1" } ],
  "actions": [ { "id": "a1", "player": "offense_1", "type": "pass", "to_player": "offense_2", "ball_id": "ball_9" } ]
}
```

`shared/conformance/v2/invalid/sem-named-pos-unknown.json`:
```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-0000000000b3", "title": "unknown named position" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 } ],
  "actions": [ { "id": "a1", "player": "offense_1", "type": "cut", "moves": [ { "to": { "named": "the_moon" } } ] } ]
}
```

`shared/conformance/v2/invalid/sem-ball-not-at-location.json`:
```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-0000000000b4", "title": "pickup of a non-loose ball" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 }, { "type": "offense", "nr": 2, "x": 2, "y": 5 } ],
  "balls": [ { "id": "ball_1", "carried_by": "offense_1" } ],
  "actions": [ { "id": "a1", "player": "offense_2", "type": "pickup", "ball_id": "ball_1" } ]
}
```

`shared/conformance/v2/invalid/sem-pass-non-carrier.json`:
```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-0000000000a2", "title": "pass by non-carrier" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 }, { "type": "offense", "nr": 2, "x": 2, "y": 5 } ],
  "balls": [ { "id": "ball_1", "carried_by": "offense_1" } ],
  "actions": [ { "id": "a1", "player": "offense_2", "type": "pass", "to_player": "offense_1", "ball_id": "ball_1" } ]
}
```

`shared/conformance/v2/invalid/sem-branch-target-missing.json` (adapted: the old `branches: {make: "does_not_exist"}` frame-target concept becomes a `branch.cases.make.then` pointing nowhere):
```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-0000000000a1", "title": "branch to nowhere" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 } ],
  "balls": [ { "id": "ball_1", "carried_by": "offense_1" } ],
  "actions": [
    { "id": "a1", "player": "offense_1", "type": "shoot", "ball_id": "ball_1" },
    { "id": "branch_1", "on": "a1", "cases": { "make": { "actions": [], "then": "does_not_exist" } } }
  ]
}
```
This now exercises `REF_BRANCH_THEN_UNKNOWN` (Task 12), not the old `REF_BRANCH_TARGET_UNKNOWN`.

`shared/conformance/v2/invalid/schema-major-v3.json` (v2's version of the unsupported-major check, mirroring Step 2's v1 fix):
```json
{
  "$schema": "https://opencoachingformat.org/schema/v3.json",
  "meta": { "id": "00000000-0000-4000-8000-000000000001", "title": "future major" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 } ],
  "actions": []
}
```

`shared/conformance/v2/invalid/malformed.json` (identical premise, copy as-is):
```json
{ "meta": { "id": "x"  "title": broken }
```

`shared/conformance/v2/invalid/action-bad-movement-intensity.json`, `sem-ball-ambiguous.json`, `ball-carried-and-at.json`, `action-intensity-on-screen.json`, `action-pass-missing-receiver.json`, `action-unknown-type.json`: apply the same JSON-Schema-only-violation migration pattern already fully demonstrated in the `spec` repo's Plan 2 Task 12 for the equivalent files — copy that reasoning directly (schema violations don't need new v2-specific semantics, only the `frames[]`→`actions[]` wrapper change). Skip `frame-missing-end-state.json`, `frame-bad-branch-key.json` (already handled via `sem-branch-target-missing.json`'s replacement above), and `state-bad-ball-key.json`'s old form (superseded by this repo's own re-targeting, following the SAME reasoning as `spec` repo Plan 2 Task 12's `state-bad-ball-key.json` re-targeting — an invalid `ball_id` on an action, not a stray `end_state.balls` key).

Two fixtures need `MODEL_LEGACY` handling — reread `model-legacy.json` (already read in full during planning) and decide: this fixture tests `entity_states`/`lines` (the pre-v1.0.0 geometric format) being rejected. This detection is presumably in `schema_level.py`/`schema-level.ts` (not `rules.py`), which was NOT read in full during this plan — before writing this fixture's v2 copy, read `packages/ts/src/schema-level.ts` and `packages/py/ocf_validator/schema_level.py` to confirm `MODEL_LEGACY` detection doesn't depend on any v1-specific structure that would need updating; if it's purely "does the doc have `entity_states`/`lines` fields", it needs no v2-specific change and the fixture copies over with only `$schema` updated to `.../v2.json`.

- [ ] **Step 5: Create `shared/conformance/v2/cases.json`**

```json
{
  "valid": [
    { "file": "valid/pick-and-roll.ocf.json" },
    { "file": "valid/3-man-weave.ocf.json" },
    { "file": "valid/transition-3v2.ocf.json" },
    { "file": "valid/quick-mode.ocf.json" },
    { "file": "valid/action-intensity-physicality.json" },
    { "file": "valid/external-references.ocf.json" }
  ],
  "invalid": [
    { "file": "invalid/action-pass-missing-receiver.json", "codes": ["SCHEMA_INVALID"] },
    { "file": "invalid/action-unknown-type.json", "codes": ["SCHEMA_INVALID"] },
    { "file": "invalid/action-bad-movement-intensity.json", "codes": ["SCHEMA_INVALID"] },
    { "file": "invalid/action-intensity-on-screen.json", "codes": ["SCHEMA_INVALID"] },
    { "file": "invalid/ball-carried-and-at.json", "codes": ["SCHEMA_INVALID"] },
    { "file": "invalid/sem-branch-target-missing.json", "codes": ["REF_BRANCH_THEN_UNKNOWN"] },
    { "file": "invalid/sem-pass-non-carrier.json", "codes": ["BALL_CARRIER_MISMATCH"] },
    { "file": "invalid/malformed.json", "codes": ["JSON_PARSE"] },
    { "file": "invalid/model-legacy.json", "codes": ["MODEL_LEGACY"] },
    { "file": "invalid/sem-entity-unknown.json", "codes": ["REF_ENTITY_UNKNOWN"] },
    { "file": "invalid/sem-ball-unknown.json", "codes": ["REF_BALL_UNKNOWN"] },
    { "file": "invalid/sem-named-pos-unknown.json", "codes": ["REF_NAMED_POS_UNKNOWN"] },
    { "file": "invalid/sem-ball-not-at-location.json", "codes": ["BALL_NOT_AT_LOCATION"] },
    { "file": "invalid/sem-ball-ambiguous.json", "codes": ["BALL_AMBIGUOUS"] },
    { "file": "invalid/schema-major-v3.json", "codes": ["SCHEMA_MAJOR_UNSUPPORTED"] }
  ],
  "warn": [
    { "file": "warn/action-unusual-carrier.json", "warnings": ["ACTION_UNUSUAL_CARRIER"] },
    { "file": "warn/contrast-low.json", "warnings": ["CONTRAST_LOW"] },
    { "file": "warn/entity-offcourt.json", "warnings": ["ENTITY_OFFCOURT"] },
    { "file": "warn/min-schema-newer.json", "warnings": ["VALIDATOR_MAYBE_OUTDATED"] }
  ]
}
```

Note: `EMPTY_FRAME` and `START_STATE_DISCONTINUITY` have NO v2 entries — those fixtures/codes are structurally obsolete in v2 (no frames, no start_state) and are intentionally dropped, not migrated. This is a deliberate, permanent difference between v1 and v2's conformance surface, not an oversight.

- [ ] **Step 6: Migrate the 4 warn fixtures that DO carry forward** (`action-unusual-carrier`, `contrast-low`, `entity-offcourt`, `min-schema-newer`)

`shared/conformance/v2/warn/action-unusual-carrier.json`:
```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-0000000000c1", "title": "defense carries and passes" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "defense", "nr": 1, "x": 0, "y": 5 }, { "type": "defense", "nr": 2, "x": 2, "y": 5 } ],
  "balls": [ { "id": "ball_1", "carried_by": "defense_1" } ],
  "actions": [ { "id": "a1", "player": "defense_1", "type": "pass", "to_player": "defense_2", "ball_id": "ball_1" } ]
}
```

`shared/conformance/v2/warn/contrast-low.json`:
```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-0000000000c3", "title": "low contrast color scheme" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "color_scheme": { "offense_fill": "#fefefe", "offense_stroke": "#ffffff" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 } ],
  "actions": [ { "id": "a1", "player": "offense_1", "type": "cut", "moves": [ { "to": { "x": 1, "y": 1 } } ] } ]
}
```

`shared/conformance/v2/warn/entity-offcourt.json`:
```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-0000000000c4", "title": "entity off the court" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 99, "y": 5 } ],
  "actions": [ { "id": "a1", "player": "offense_1", "type": "cut", "moves": [ { "to": { "x": 1, "y": 1 } } ] } ]
}
```

`shared/conformance/v2/warn/min-schema-newer.json`:
```json
{
  "$schema": "https://opencoachingformat.org/schema/v2.json",
  "meta": { "id": "00000000-0000-4000-8000-000000000001", "title": "needs newer", "min_schema_version": "9.9.9" },
  "court": { "ruleset": "fiba", "type": "half_court" },
  "entities": [ { "type": "offense", "nr": 1, "x": 0, "y": 5 } ],
  "balls": [ { "id": "ball_1", "carried_by": "offense_1" } ],
  "actions": [ { "id": "a1", "player": "offense_1", "type": "shoot", "ball_id": "ball_1" } ]
}
```

Note: `entity-offcourt.json` and `contrast-low.json` require the currently-unported `qualityRules`/`quality_rules` to run under v2 (Task 14/15's note flagged this as NOT yet ported). Since these two warn fixtures depend on it, this task's cases.json entries for them will FAIL until quality rules are ported. Either (a) port the two quality checks that don't depend on frames (`ENTITY_OFFCOURT`, `CONTRAST_LOW` — confirmed frame-independent by inspection during planning: `quality_rules` in `rules.py` computes `ENTITY_OFFCOURT` from `doc.entities` directly and `CONTRAST_LOW` from `doc.color_scheme` directly, neither touches frames) into `v2/quality_rules.py`/`v2/rules/quality.ts` as part of this task before wiring them into `v2/validate.ts`/`validate.py` (Task 14/15), or (b) leave these two v2 warn fixtures out of `v2/cases.json` for now and track porting quality rules as a follow-up. Given the checks are confirmed frame-independent and this task already has full context on the file, prefer (a): port `quality_rules_v2`/`qualityRulesV2` now (a straight copy of the `ENTITY_OFFCOURT` and `CONTRAST_LOW` blocks from `v1/rules/quality.ts`/`v1/rules.py`, dropping the `EMPTY_FRAME` block entirely since it's obsolete), add it to `v2/validate.ts`/`validate.py`'s issue list, and keep both warn fixtures in `v2/cases.json` as written above.

- [ ] **Step 7: Update `packages/ts/test/conformance.test.ts` to run both v1 and v2 suites**

Replace its entire contents:

```typescript
import { test, expect, describe } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFile } from "../src/validate-file.js";

const sharedRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..", "shared", "conformance");

type CaseSet = {
  valid: { file: string }[];
  invalid: { file: string; codes: string[]; warnings?: string[] }[];
  warn: { file: string; warnings: string[] }[];
};

function loadCases(version: "v1" | "v2"): CaseSet {
  const root = join(sharedRoot, version);
  return JSON.parse(readFileSync(join(root, "cases.json"), "utf8")) as CaseSet;
}

for (const version of ["v1", "v2"] as const) {
  const root = join(sharedRoot, version);
  const cases = loadCases(version);

  describe(`${version} valid fixtures pass`, () => {
    for (const c of cases.valid) {
      test(c.file, () => {
        const res = validateFile(join(root, c.file));
        expect(res.errors, JSON.stringify(res.errors)).toEqual([]);
        expect(res.valid).toBe(true);
      });
    }
  });

  describe(`${version} invalid fixtures rejected with expected codes`, () => {
    for (const c of cases.invalid) {
      test(c.file, () => {
        const res = validateFile(join(root, c.file));
        expect(res.valid).toBe(false);
        const got = new Set(res.errors.map((e) => e.code));
        for (const code of c.codes) expect(got.has(code)).toBe(true);
        if (c.warnings) {
          const gotW = new Set(res.warnings.map((w) => w.code));
          for (const w of c.warnings) expect(gotW.has(w)).toBe(true);
        }
      });
    }
  });

  describe(`${version} warn fixtures are valid but carry expected warnings`, () => {
    for (const c of cases.warn ?? []) {
      test(c.file, () => {
        const res = validateFile(join(root, c.file));
        expect(res.valid).toBe(true);
        const gotW = new Set(res.warnings.map((w) => w.code));
        for (const w of c.warnings) expect(gotW.has(w)).toBe(true);
      });
    }
  });
}
```

- [ ] **Step 8: Update `packages/py/tests/test_conformance.py` to run both v1 and v2 suites**

```python
import json
from pathlib import Path

import pytest

from ocf_validator import validate_file

SHARED_ROOT = Path(__file__).resolve().parents[3] / "shared" / "conformance"


def _load_cases(version: str) -> dict:
    return json.loads((SHARED_ROOT / version / "cases.json").read_text())


CASES = {"v1": _load_cases("v1"), "v2": _load_cases("v2")}


@pytest.mark.parametrize(
    "version,c",
    [(v, c) for v in ("v1", "v2") for c in CASES[v]["valid"]],
    ids=lambda p: p if isinstance(p, str) else None,
)
def test_valid(version, c):
    res = validate_file(str(SHARED_ROOT / version / c["file"]))
    assert res.errors == [], [e.code for e in res.errors]
    assert res.valid


@pytest.mark.parametrize(
    "version,c",
    [(v, c) for v in ("v1", "v2") for c in CASES[v]["invalid"]],
)
def test_invalid(version, c):
    res = validate_file(str(SHARED_ROOT / version / c["file"]))
    assert not res.valid
    got = {e.code for e in res.errors}
    for code in c["codes"]:
        assert code in got
    for w in c.get("warnings", []):
        assert w in {x.code for x in res.warnings}


@pytest.mark.parametrize(
    "version,c",
    [(v, c) for v in ("v1", "v2") for c in CASES[v].get("warn", [])],
)
def test_warn(version, c):
    res = validate_file(str(SHARED_ROOT / version / c["file"]))
    assert res.valid
    gotw = {w.code for w in res.warnings}
    for w in c["warnings"]:
        assert w in gotw
```

(The `ids=lambda p: ...` in the valid-cases parametrize is a placeholder that pytest will actually auto-generate reasonable ids for without it — remove that `ids=` kwarg entirely if it causes an error; pytest's default id generation from tuples is normally sufficient.)

- [ ] **Step 9: Run both full test suites**

```bash
cd packages/ts && npx vitest run
cd ../py && python -m pytest
```

Expected: PASS for both — every v1 fixture (unchanged behavior) and every v2 fixture (new behavior, built across Tasks 5-15).

- [ ] **Step 10: Commit**

```bash
git add shared/conformance/ packages/ts/test/conformance.test.ts packages/py/tests/test_conformance.py packages/ts/src/v2/rules/quality.ts packages/py/ocf_validator/v2/quality_rules.py packages/ts/src/v2/validate.ts packages/py/ocf_validator/v2/validate.py
git commit -m "$(cat <<'EOF'
feat: split conformance fixtures into v1/v2, add full v2 conformance suite

v1 fixtures moved unchanged under shared/conformance/v1/. New v2 fixtures
under shared/conformance/v2/ cover the same semantic violations via the
new actions[]/trigger/branch shape. EMPTY_FRAME and START_STATE_DISCONTINUITY
are intentionally NOT carried forward to v2 (structurally obsolete: no
frames, no start_state/end_state exist anymore). Ported the two
frame-independent quality checks (ENTITY_OFFCOURT, CONTRAST_LOW) to v2;
EMPTY_FRAME's check itself is dropped along with the concept it checked.
EOF
)"
```

---

### Task 17: Make the spec auto-sync workflow major-version-aware (prevent v2 from overwriting v1)

**Files:**
- Modify: `.github/workflows/sync-from-spec.yml`

**Why this task exists:** `sync-from-spec.yml` currently fetches `schema/v1.json` from the spec repo at a released ref and unconditionally overwrites `shared/schema/ocf-action-v1.json` (read in full — see lines 44 and 68 of the current file). The spec repo's schema file stays named `v1.json` on disk regardless of the SemVer/`x-ocf-version` value inside it (confirmed: Plans 1-2 do not rename the file even once its content becomes 2.0.0). Without this task, the next `spec_released` dispatch after a real v2.0.0 tag would silently replace the actual v1 schema this plan spent 16 tasks preserving — destroying v1 support in one automated, unreviewed-until-merge PR. The fix must (a) determine which major version the fetched content actually is (not assume it from the fetched filename), (b) write it to the CORRECT vendored path (`ocf-action-v1.json` vs `ocf-action-v2.json`) based on that, and (c) never let a same-major sync accidentally revert the OTHER major's file.

- [ ] **Step 1: Add a step that determines the fetched schema's actual major version from its own content**

In `.github/workflows/sync-from-spec.yml`, after the existing "Sanity-check downloaded schema is valid JSON" step and before "Diff against vendored copy", insert a new step:

```yaml
      - name: Determine fetched schema's actual major version
        id: fetched-major
        run: |
          MAJOR=$(python3 -c "
          import json
          d = json.load(open('/tmp/new-schema.json'))
          v = d.get('x-ocf-version', '0.0.0')
          print('v' + v.split('.')[0])
          ")
          if [ "$MAJOR" != "v1" ] && [ "$MAJOR" != "v2" ]; then
            echo "::error::fetched schema declares unsupported x-ocf-version major '$MAJOR' — this workflow only knows how to sync v1 and v2. Add support for $MAJOR before this can proceed automatically."
            exit 1
          fi
          echo "major=$MAJOR" >> "$GITHUB_OUTPUT"
```

This fails the workflow run LOUDLY (no PR opened, red X in Actions) rather than silently mis-filing an unrecognized future major — matching the existing "fails loudly instead of silently writing wrong content" philosophy already documented in this workflow's comments for the schema-fetch step.

- [ ] **Step 2: Make the vendored-path resolution dynamic instead of hardcoded**

Replace the "Diff against vendored copy" step:

```yaml
      - name: Diff against vendored copy
        id: diff
        run: |
          if diff -q /tmp/new-schema.json shared/schema/ocf-action-v1.json > /dev/null 2>&1; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
          else
            echo "changed=true" >> "$GITHUB_OUTPUT"
          fi
```

with:

```yaml
      - name: Diff against vendored copy
        id: diff
        env:
          MAJOR: ${{ steps.fetched-major.outputs.major }}
        run: |
          TARGET="shared/schema/ocf-action-${MAJOR}.json"
          echo "target=$TARGET" >> "$GITHUB_OUTPUT"
          if [ -f "$TARGET" ] && diff -q /tmp/new-schema.json "$TARGET" > /dev/null 2>&1; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
          else
            echo "changed=true" >> "$GITHUB_OUTPUT"
          fi
```

(A missing `$TARGET` — the very first sync of a brand-new major, e.g. the first-ever v2 sync before this plan's Task 1 manual copy ever ran in a real release — is treated as "changed", so it gets created rather than erroring on a nonexistent diff target.)

- [ ] **Step 3: Make the "Update vendored schema + provenance" step target the resolved path, and write a per-major provenance file**

Replace:

```yaml
      - name: Update vendored schema + provenance
        if: steps.diff.outputs.changed == 'true'
        env:
          VERSION: ${{ steps.vars.outputs.version }}
        run: |
          cp /tmp/new-schema.json shared/schema/ocf-action-v1.json
          {
            echo "# Schema provenance"
            echo
            echo "\`ocf-action-v1.json\` is copied verbatim from the spec repo:"
            echo "\`opencoachingformat/spec\` -> \`schema/v1.json\` @ \`$VERSION\`."
            echo "Synced automatically by \`.github/workflows/sync-from-spec.yml\`"
            echo "on $(date -u +%Y-%m-%dT%H:%M:%SZ) from a \`spec_released\` dispatch event."
            echo "Re-sync deliberately; do not hand-edit."
          } > shared/schema/PROVENANCE.md
```

with:

```yaml
      - name: Update vendored schema + provenance
        if: steps.diff.outputs.changed == 'true'
        env:
          VERSION: ${{ steps.vars.outputs.version }}
          MAJOR: ${{ steps.fetched-major.outputs.major }}
          TARGET: ${{ steps.diff.outputs.target }}
        run: |
          cp /tmp/new-schema.json "$TARGET"
          {
            echo "# Schema provenance"
            echo
            echo "This file is regenerated by the sync workflow for EACH supported major"
            echo "version independently — see the per-file note below for which major"
            echo "was most recently synced by this run."
            echo
            echo "\`ocf-action-${MAJOR}.json\` is copied verbatim from the spec repo:"
            echo "\`opencoachingformat/spec\` -> \`schema/v1.json\` (note: the spec repo's"
            echo "on-disk filename does not change across majors; only its content/"
            echo "\`x-ocf-version\` does — this workflow determines the ACTUAL major from"
            echo "content, not from that filename) @ \`$VERSION\`."
            echo "Synced automatically by \`.github/workflows/sync-from-spec.yml\`"
            echo "on $(date -u +%Y-%m-%dT%H:%M:%SZ) from a \`spec_released\` dispatch event."
            echo "Re-sync deliberately; do not hand-edit."
          } >> shared/schema/PROVENANCE.md
```

Note the `>>` (append) instead of `>` (overwrite) on the last line — with two majors now vendored, a single shared `PROVENANCE.md` needs to accumulate an entry per major synced over time rather than each sync erasing the other major's provenance note. If `PROVENANCE.md` doesn't already exist when this first runs (e.g. right after Task 1's manual v2 copy, if that copy didn't also hand-write a provenance note), `>>` creates it fine.

- [ ] **Step 4: Update the PR body to state which major was synced**

In the "Open pull request" step, change the `commit-message`, `title`, and `body` to include the major:

```yaml
      - name: Open pull request
        if: steps.diff.outputs.changed == 'true'
        uses: peter-evans/create-pull-request@v6
        with:
          token: ${{ github.token }}
          commit-message: "chore: sync ${{ steps.fetched-major.outputs.major }} schema to ${{ steps.vars.outputs.version }} + bump validator patch"
          title: "chore: sync ${{ steps.fetched-major.outputs.major }} schema to ${{ steps.vars.outputs.version }} + bump validator patch"
          body: |
            Automated sync from `opencoachingformat/spec` @ `${{ steps.vars.outputs.version }}`,
            triggered by a `spec_released` repository_dispatch event.

            **This release's declared major version: `${{ steps.fetched-major.outputs.major }}`**
            (determined from the fetched schema's own `x-ocf-version` field, not from the
            spec repo's on-disk filename — the filename does not change across majors).

            Updated `${{ steps.diff.outputs.target }}` only. The OTHER supported major's
            vendored schema file is untouched by this PR.

            Rebuilds the browser bundle and **bumps the validator patch version** so
            merging this PR auto-publishes a new validator release (via the
            `auto-tag-on-sync-merge` workflow). CI must pass before merging — please
            review the schema diff (in particular any new `required` fields or removed
            enum values, which would need matching validator code changes and therefore
            a deliberate non-patch release) before approving. If this PR is for a major
            version this workflow has never synced before (a brand-new `ocf-action-vN.json`
            appearing for the first time), a validator code change to actually SUPPORT
            that major (new v*/ rule modules, dispatch wiring) is almost certainly needed
            before merging — the sync workflow only vendors the schema file, it cannot
            author new rule modules.
          branch: "auto/schema-sync-${{ steps.fetched-major.outputs.major }}-${{ steps.vars.outputs.version }}"
          delete-branch: true
```

Note the branch name now includes the major (`auto/schema-sync-v2-2.1.0` vs `auto/schema-sync-v1-1.5.0`) so two syncs for different majors landing close together never collide on the same branch name.

- [ ] **Step 5: Manually validate the workflow YAML is well-formed**

```bash
cd /Users/oliver-marcuseder/01-vibe-coding/00-Basektball/open-coaching-format/ocf-validator-frameless-action-model
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/sync-from-spec.yml'))" && echo "valid YAML"
```

Expected: `valid YAML`. (If `pyyaml` isn't installed: `pip install pyyaml` first, or use `python3 -c "import json,sys; sys.exit(0)"`-style ad hoc check is insufficient for YAML — actually install pyyaml rather than skip this check, since a workflow syntax error would only surface on a real GitHub Actions run otherwise, far too late.)

- [ ] **Step 6: Document the manual-first-sync gap for the maintainer**

This task cannot be end-to-end tested without an actual v2.0.0 `spec_released` dispatch event, which requires the real spec repo to actually tag and publish a v2.0.0 release (outside this plan's scope — that's the `spec` repo's own release process, gated on Plans 1-2 shipping). Add a note to this repo's own follow-up tracking (wherever `validator-autosync-pending`-equivalent notes live for this repo, or a new `docs/` note if none exists) stating: the FIRST real v2.0.0 sync should be watched manually end-to-end (the workflow run, the resulting PR's diff, and specifically that `ocf-action-v1.json` is untouched in that PR's file list) before trusting subsequent v2.x syncs to run unattended the way v1.x syncs already do per `[[validator-autosync-pending]]`.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/sync-from-spec.yml
git commit -m "$(cat <<'EOF'
fix(ci): make sync-from-spec major-version-aware, stop hardcoding v1 target

The workflow previously wrote every synced schema to the hardcoded path
shared/schema/ocf-action-v1.json regardless of the fetched content's
actual major version. Since the spec repo's schema file keeps the
filename schema/v1.json even after a v2.0.0 release changes its content,
the very next sync after v2.0.0 ships would have silently overwritten
the real v1 schema this plan spent its other 16 tasks preserving.

Now determines the actual major from the fetched content's own
x-ocf-version field, writes to the matching ocf-action-vN.json path,
and refuses (loudly, no PR) if it encounters a major it doesn't know
how to route (v3+, until this workflow is extended again).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Plan 3 completion checklist

- [x] v2 schema vendored (`shared/schema/ocf-action-v2.json`), version-aware dispatch in `schema-version.ts`/`.py`
- [x] v1 rule modules moved to `v1/` subdirectories (TS + Python), zero behavior change, confirmed by full regression pass
- [x] v2 `context` module (branch-aware entity/ball/action-id collection)
- [x] v2 reference rules (entity/ball/named-position/trigger-ref/branch-on resolution) — two new error codes added
- [x] v2 possession rules (running carrier state across the flat sequence, branch-case state forking, two-ball `ball_ids` support)
- [x] v2 branch rules (`then` resolution, `continuum` loop-back heuristic) — two new error codes added
- [x] v2 quality rules (ported: `ENTITY_OFFCOURT`, `CONTRAST_LOW`; deliberately dropped: `EMPTY_FRAME`)
- [x] Top-level `validate()`/`validate_file()` dispatch on declared schema major (both languages)
- [x] Conformance fixtures split `v1/`/`v2/`, both test runners updated, full parity confirmed
- [x] `sync-from-spec.yml` made major-version-aware: determines actual major from fetched content (not filename), writes to the matching `ocf-action-vN.json`, refuses loudly on an unrecognized major, never lets a same-run sync clobber the other major's vendored file
- [ ] NOT done here (explicitly deferred, flagged in Task 12): full continuum tolerance/anchor validation (only a heuristic "does anything loop backward" warning exists)
- [ ] NOT done here: v2 coherence rules — `END_STATE_DISAGREE`/`START_STATE_DISCONTINUITY` have no v2 equivalent because `end_state`/`start_state` don't exist in v2; there is currently no v2 check that an action's stated movement endpoint is internally consistent with anything else, because in v2 there is nothing else to disagree with (no redundant end_state to compare against) — this is a structural simplification, not a gap, but worth a sentence in the eventual release notes so nobody goes looking for a "v2 coherence rules" module that was never needed.
- [ ] NOT done here: variant-dependency constraints (e.g. `cut.curl` requiring a coupled `screen`) — tracked as its own follow-up in the `spec` repo's Plan 2 companion open-questions doc, likely shares a mechanism with the future `affects`-roles RFC.
