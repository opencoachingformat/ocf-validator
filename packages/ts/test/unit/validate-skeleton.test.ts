import { test, expect } from "vitest";
import { validate } from "../../src/validate.js";

const MINIMAL_VALID_DOC = {
  $schema: "https://opencoachingformat.org/schema/v1.json",
  meta: { id: "00000000-0000-4000-8000-000000000001", title: "t" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
  frames: [{ id: "f1", actions: [], end_state: { offense_1: { x: 0, y: 5 } } }],
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
