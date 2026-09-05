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
