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

test("a grandchild branch case does not see a sibling grandchild's or great-uncle case's carrier changes", () => {
  const doc = {
    entities: [
      { type: "offense", nr: 1, x: 0, y: 5 }, { type: "offense", nr: 2, x: 1, y: 5 },
      { type: "offense", nr: 3, x: 2, y: 5 },
    ],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    actions: [
      { id: "a1", player: "offense_1", type: "pass", to_player: "offense_2", ball_id: "ball_1" },
      {
        id: "branch_1", on: "a1",
        cases: {
          make: {
            actions: [
              {
                id: "branch_2", on: "a1",
                cases: {
                  hit: {
                    actions: [{ id: "a3", player: "offense_2", type: "pass", to_player: "offense_3", ball_id: "ball_1" }],
                    then: null,
                  },
                  miss: {
                    // Both grandchild cases fork from the same post-a1 state (offense_2
                    // holds ball_1 after the pass), so this dribble is valid too. What
                    // must NOT leak across is the sibling "hit" case's post-fork mutation
                    // (the pass to offense_3) -- if state were shared instead of forked,
                    // this dribble would incorrectly see ball_1 as no longer offense_2's.
                    actions: [{ id: "a4", player: "offense_2", type: "dribble", ball_id: "ball_1", moves: [] }],
                    then: null,
                  },
                },
              },
            ],
            then: null,
          },
          miss: {
            // The "miss" great-uncle case still forks from a1's own post-pass state
            // (offense_2 holds ball_1), same as "make" -- so this dribble is ALSO valid.
            // It exists to prove branch_1's "miss" gets its own independent fork rather
            // than accidentally sharing branch_2's nested state.
            actions: [{ id: "a5", player: "offense_2", type: "dribble", ball_id: "ball_1", moves: [] }],
            then: null,
          },
        },
      },
    ],
  };
  const issues = run(doc);
  // All three leaf actions (a3 pass, a4 dribble, a5 dribble) see offense_2 holding
  // ball_1 from their shared ancestor a1 -- none should be flagged, since each
  // fork independently derives from the same pre-branch state, not from a sibling.
  // This genuinely discriminates forking from shared-reference state: verified
  // (via a throwaway local mutation of the implementation under test) that
  // sharing localCarrier/localLoose by reference instead of copying makes a3's
  // pass-away-from-offense_2 leak into BOTH a4 (sibling grandchild) and a5
  // (great-uncle), incorrectly flagging both as BALL_CARRIER_MISMATCH.
  expect(issues.some((i) => i.path === "/actions/1/cases/make/actions/0/cases/hit/actions/0")).toBe(false);
  expect(issues.some((i) => i.path === "/actions/1/cases/make/actions/0/cases/miss/actions/0")).toBe(false);
  expect(issues.some((i) => i.path === "/actions/1/cases/miss/actions/0")).toBe(false);
  expect(issues).toEqual([]);
});

test("a successful pickup transfers a loose ball to the picking player", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", at: { x: 0, y: 5 } }],
    actions: [
      { id: "a1", player: "offense_1", type: "pickup", ball_id: "ball_1", moves: [] },
      { id: "a2", player: "offense_1", type: "dribble", ball_id: "ball_1", moves: [{ to: { x: 1, y: 1 } }] },
    ],
  };
  const issues = run(doc);
  expect(issues).toEqual([]);
});

test("two-ball dribble where the balls are held by different players is flagged per-ball", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }, { type: "offense", nr: 2, x: 1, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }, { id: "ball_2", carried_by: "offense_2" }],
    actions: [{ id: "a1", player: "offense_1", type: "dribble", ball_ids: ["ball_1", "ball_2"], moves: [{ to: { x: 1, y: 1 } }] }],
  };
  const issues = run(doc);
  const mismatch = issues.find((i) => i.code === "BALL_CARRIER_MISMATCH" && i.path === "/actions/0");
  expect(mismatch).toBeDefined();
  expect(mismatch?.data).toMatchObject({ ball_id: "ball_2" });
  // ball_1 (correctly held by offense_1) must not ALSO be flagged.
  expect(issues.filter((i) => i.code === "BALL_CARRIER_MISMATCH")).toHaveLength(1);
});
