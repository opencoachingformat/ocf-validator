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
