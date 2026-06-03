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

test("a frame with only entity_states is detected as legacy", () => {
  const legacy = { ...base,
    frames: [{ id: "f1", entity_states: { offense_1: { x: 0, y: 0 } } }] };
  const res = validate(legacy);
  expect(res.errors[0].code).toBe("MODEL_LEGACY");
});

test("a frame with a stray `lines` key is NOT legacy (gets schema error instead)", () => {
  const strayLines = { ...base,
    frames: [{ id: "f1", actions: [], end_state: {}, lines: [] }] };
  const res = validate(strayLines);
  expect(res.errors.every((e) => e.code !== "MODEL_LEGACY")).toBe(true);
  // it should be rejected by the schema (additionalProperties:false) as SCHEMA_INVALID
  expect(res.errors.some((e) => e.code === "SCHEMA_INVALID")).toBe(true);
});
