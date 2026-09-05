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
  // Paths are positional JSON pointers (never literal action ids), so the
  // miss case's a3 action is addressed as /actions/1/cases/miss/actions/0.
  const missIssue = issues.find(
    (i) => i.code === "BALL_CARRIER_MISMATCH" && i.path === "/actions/1/cases/miss/actions/0",
  );
  expect(missIssue).toBeDefined();
});

test("omitting ball_id with two balls is BALL_AMBIGUOUS", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }, { id: "ball_2", at: { x: 3, y: 3 } }],
    actions: [{ id: "a1", player: "offense_1", type: "dribble", moves: [] }],
  };
  expect(run(doc).some((i) => i.code === "BALL_AMBIGUOUS")).toBe(true);
});
