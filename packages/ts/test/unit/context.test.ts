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
