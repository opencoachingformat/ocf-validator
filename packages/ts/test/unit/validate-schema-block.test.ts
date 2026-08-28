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
