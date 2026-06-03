import { test, expect } from "vitest";
import { possessionByFrame } from "../../src/possession.js";

test("initial possession comes from balls[] carried_by", () => {
  const doc = {
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    frames: [{ id: "f1", actions: [], end_state: {} }],
  };
  const states = possessionByFrame(doc);
  expect(states[0].carrierOf("ball_1")).toBe("offense_1");
  expect(states[0].ballCount).toBe(1);
});

test("end_state.balls updates possession for the next frame", () => {
  const doc = {
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    frames: [
      { id: "f1", actions: [], end_state: { balls: { ball_1: { carried_by: "offense_2" } } } },
      { id: "f2", actions: [], end_state: {} },
    ],
  };
  const states = possessionByFrame(doc);
  expect(states[0].carrierOf("ball_1")).toBe("offense_1");
  expect(states[1].carrierOf("ball_1")).toBe("offense_2");
});

test("a loose ball (at) has no carrier", () => {
  const doc = {
    balls: [{ id: "ball_1", at: { x: 0, y: 0 } }],
    frames: [{ id: "f1", actions: [], end_state: {} }],
  };
  const states = possessionByFrame(doc);
  expect(states[0].carrierOf("ball_1")).toBeNull();
  expect(states[0].looseAt("ball_1")).toEqual({ x: 0, y: 0 });
});
