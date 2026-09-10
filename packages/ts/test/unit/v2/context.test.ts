import { test, expect, describe } from "vitest";
import { buildContextV2, walkActions, isBranch } from "../../../src/v2/context.js";

const SAMPLE_DOC = {
  court: { court_profile: "fiba" },
  entities: [
    { type: "offense", nr: 1, x: 0, y: 5 },
    { type: "offense", nr: 2, x: 1, y: 5 },
  ],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  actions: [
    { id: "a1", player: "offense_1", type: "pass", to_player: "offense_2" },
    {
      id: "branch_1",
      on: "a1",
      cases: {
        make: { actions: [{ id: "a2", player: "offense_2", type: "shoot" }], then: null },
        miss: { actions: [], then: null },
      },
    },
  ],
};

describe("buildContextV2", () => {
  test("collects entity refs, ball ids, court_profile", () => {
    const ctx = buildContextV2(SAMPLE_DOC);
    expect(ctx.entityRefs.has("offense_1")).toBe(true);
    expect(ctx.entityRefs.has("offense_2")).toBe(true);
    expect(ctx.ballIds.has("ball_1")).toBe(true);
    expect(ctx.courtProfile).toBe("fiba");
  });

  test("collects every action id, including ones nested inside branch cases", () => {
    const ctx = buildContextV2(SAMPLE_DOC);
    expect(ctx.actionIds.has("a1")).toBe(true);
    expect(ctx.actionIds.has("a2")).toBe(true);
    expect(ctx.actionIds.has("branch_1")).toBe(true);
  });
});

describe("isBranch", () => {
  test("distinguishes a branch item from a plain action", () => {
    expect(isBranch(SAMPLE_DOC.actions[0])).toBe(false);
    expect(isBranch(SAMPLE_DOC.actions[1])).toBe(true);
  });
});

describe("walkActions", () => {
  test("visits every action in document order, recursing into branch cases", () => {
    const visited: string[] = [];
    walkActions(SAMPLE_DOC.actions as Record<string, unknown>[], (action, path) => {
      visited.push(`${path}:${action.id}`);
    });
    expect(visited).toEqual([
      "/actions/0:a1",
      "/actions/1:branch_1",
      "/actions/1/cases/make/actions/0:a2",
    ]);
  });
});
