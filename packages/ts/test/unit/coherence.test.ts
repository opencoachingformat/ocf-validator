import { test, expect } from "vitest";
import { buildContext } from "../../src/context.js";
import { coherenceRules } from "../../src/rules/coherence.js";

test("end_state contradicting an explicit move endpoint is flagged", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "move", moves: [{ to: { x: 5, y: 5 } }] }],
      end_state: { offense_1: { x: 1, y: 1 } } }],
  };
  expect(coherenceRules(doc, buildContext(doc))
    .some((i) => i.code === "END_STATE_DISAGREE")).toBe(true);
});

test("variant move without explicit `to` is skipped (no false positive)", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "move", moves: [{ variant: "speed" }] }],
      end_state: { offense_1: { x: 9, y: 9 } } }],
  };
  expect(coherenceRules(doc, buildContext(doc))
    .some((i) => i.code === "END_STATE_DISAGREE")).toBe(false);
});

test("start_state differing from prior end_state is warned", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [
      { id: "f1", actions: [], end_state: { offense_1: { x: 3, y: 3 } } },
      { id: "f2", start_state: { offense_1: { x: 9, y: 9 } },
        actions: [], end_state: { offense_1: { x: 9, y: 9 } } },
    ],
  };
  const issues = coherenceRules(doc, buildContext(doc));
  expect(issues.some((i) => i.code === "START_STATE_DISCONTINUITY")).toBe(true);
  expect(issues.find((i) => i.code === "START_STATE_DISCONTINUITY")?.path)
    .toBe("/frames/1/start_state/offense_1");
});

test("a named-vs-xy endpoint pair is not flagged as disagreement", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 0 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "move", moves: [{ to: { named: "top_of_the_key" } }] }],
      end_state: { offense_1: { x: 0, y: 5.68 } } }],
  };
  const issues = coherenceRules(doc, buildContext(doc));
  expect(issues.some((i) => i.code === "END_STATE_DISAGREE")).toBe(false);
});
