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
