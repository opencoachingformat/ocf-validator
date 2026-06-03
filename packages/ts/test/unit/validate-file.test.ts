import { test, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateFile } from "../../src/validate.js";

const dir = mkdtempSync(join(tmpdir(), "ocf-"));

test("validateFile parses and validates a file", () => {
  const p = join(dir, "ok.json");
  writeFileSync(p, JSON.stringify({
    $schema: "https://opencoachingformat.org/schema/v1.json",
    meta: { id: "00000000-0000-4000-8000-000000000001", title: "t" },
    court: { ruleset: "fiba", type: "half_court" },
    entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
    balls: [{ id: "ball_1", carried_by: "offense_1" }],
    frames: [{ id: "f1", actions: [{ player: "offense_1", type: "shoot", ball_id: "ball_1" }], end_state: { offense_1: { x: 0, y: 5 } } }],
  }));
  expect(validateFile(p).valid).toBe(true);
});

test("validateFile surfaces malformed JSON as JSON_PARSE", () => {
  const p = join(dir, "bad.json");
  writeFileSync(p, "{ not json ");
  const res = validateFile(p);
  expect(res.valid).toBe(false);
  expect(res.errors[0].code).toBe("JSON_PARSE");
});
