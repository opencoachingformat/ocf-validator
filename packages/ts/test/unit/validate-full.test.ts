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
