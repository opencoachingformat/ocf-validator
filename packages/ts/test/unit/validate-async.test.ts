import { test, expect } from "vitest";
import { validateAsync } from "../../src/validate-async.js";

const base = {
  $schema: "https://opencoachingformat.org/schema/v1.json",
  meta: { id: "00000000-0000-4000-8000-000000000001", title: "t", min_schema_version: "9.9.9" },
  court: { ruleset: "fiba", type: "half_court" },
  entities: [{ type: "offense", nr: 1, x: 0, y: 5 }],
  balls: [{ id: "ball_1", carried_by: "offense_1" }],
  frames: [{ id: "f1",
    actions: [{ player: "offense_1", type: "shoot", ball_id: "ball_1" }],
    end_state: { offense_1: { x: 0, y: 5 } } }],
};

test("fetch success: validates against fetched newer schema, no outdated warning", async () => {
  // Fake fetch returns a permissive schema whose x-ocf-version is 9.9.9.
  const newerSchema = { $id: "https://opencoachingformat.org/schema/v1.json", "x-ocf-version": "9.9.9", type: "object" };
  const fakeFetch = (async () => ({ ok: true, json: async () => newerSchema })) as unknown as typeof fetch;
  const res = await validateAsync(base, { fetchLatestSchema: true, fetchImpl: fakeFetch });
  expect(res.schema.validatedAgainst).toBe("9.9.9");
  expect(res.warnings.map((w) => w.code)).not.toContain("VALIDATOR_MAYBE_OUTDATED");
});

test("fetch failure: falls back to bundled + outdated warning", async () => {
  const fakeFetch = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
  const res = await validateAsync(base, { fetchLatestSchema: true, fetchImpl: fakeFetch });
  expect(res.warnings.map((w) => w.code)).toContain("VALIDATOR_MAYBE_OUTDATED");
});

test("fetchLatestSchema false: behaves like sync validate", async () => {
  const res = await validateAsync(base, { fetchLatestSchema: false });
  expect(res.warnings.map((w) => w.code)).toContain("VALIDATOR_MAYBE_OUTDATED");
});
