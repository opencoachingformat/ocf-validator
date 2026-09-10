import { test, expect } from "vitest";
import { validateText } from "../../src/validate-text.js";

test("validateText parses and validates a v2 document", () => {
  const res = validateText(JSON.stringify({
    $schema: "https://opencoachingformat.org/schema/v2.json",
    sport: "basketball",
    meta: { id: "00000000-0000-4000-8000-000000000001", title: "t" },
    court: { court_profile: "fiba", type: "half_court" },
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    actions: [{ id: "a1", player: "offense_1", type: "shoot", ball_id: "ball_1" }],
  }));
  expect(res.valid).toBe(true);
});

test("validateText parses and validates a v1 document", () => {
  const res = validateText(JSON.stringify({
    $schema: "https://opencoachingformat.org/schema/v1.json",
    meta: { id: "00000000-0000-4000-8000-000000000001", title: "t" },
    court: { ruleset: "fiba", type: "half_court" },
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    frames: [{ id: "f1", actions: [{ player: "offense_1", type: "shoot", ball_id: "ball_1" }], end_state: { offense_1: { x: 0, y: 5 } } }],
  }));
  expect(res.valid).toBe(true);
});

test("validateText surfaces malformed JSON as JSON_PARSE, not a thrown error", () => {
  const res = validateText("{ not json ");
  expect(res.valid).toBe(false);
  expect(res.errors[0].code).toBe("JSON_PARSE");
});

test("validateText surfaces a JSON array as JSON_PARSE, not a thrown TypeError", () => {
  const res = validateText("[1, 2, 3]");
  expect(res.valid).toBe(false);
  expect(res.errors[0].code).toBe("JSON_PARSE");
});

test("validateText surfaces a JSON primitive as JSON_PARSE, not a thrown TypeError", () => {
  const res = validateText("42");
  expect(res.valid).toBe(false);
  expect(res.errors[0].code).toBe("JSON_PARSE");
});

test("validateText surfaces null as JSON_PARSE, not a thrown TypeError", () => {
  const res = validateText("null");
  expect(res.valid).toBe(false);
  expect(res.errors[0].code).toBe("JSON_PARSE");
});
