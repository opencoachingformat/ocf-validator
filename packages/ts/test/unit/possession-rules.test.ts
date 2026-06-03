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
