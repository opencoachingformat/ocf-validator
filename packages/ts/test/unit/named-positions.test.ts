import { test, expect } from "vitest";
import { buildContext } from "../../src/context.js";
import { referenceRules } from "../../src/rules/references.js";

test("a named coordinate not in the registry is flagged", () => {
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "move",
                 moves: [{ to: { named: "not_a_real_spot" } }] }],
      end_state: {} }],
  };
  expect(referenceRules(doc, buildContext(doc))
    .some((i) => i.code === "REF_NAMED_POS_UNKNOWN")).toBe(true);
});

test("a document-declared named position is accepted", () => {
  // named_positions.custom is an object whose keys are the position names.
  const doc = {
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }], balls: [],
    court: { ruleset: "fiba", type: "half_court" },
    named_positions: { custom: { my_spot: { x: 1, y: 1 } } },
    frames: [{ id: "f1",
      actions: [{ player: "offense_1", type: "move",
                 moves: [{ to: { named: "my_spot" } }] }],
      end_state: {} }],
  };
  expect(referenceRules(doc, buildContext(doc))
    .some((i) => i.code === "REF_NAMED_POS_UNKNOWN")).toBe(false);
});

test("standard ruleset positions from the catalog are accepted", () => {
  const names = ["top_of_the_key", "left_elbow", "basket", "right_block", "right_wing", "right_corner", "left_wing"];
  for (const n of names) {
    const doc = {
      entities: [{ type: "offense", nr: 1, x: 0, y: 5 }], balls: [],
      court: { ruleset: "fiba", type: "half_court" },
      frames: [{ id: "f1",
        actions: [{ player: "offense_1", type: "move", moves: [{ to: { named: n } }] }],
        end_state: {} }],
    };
    const issues = referenceRules(doc, buildContext(doc));
    expect(issues.some((i) => i.code === "REF_NAMED_POS_UNKNOWN"),
      `${n} should be accepted`).toBe(false);
  }
});
