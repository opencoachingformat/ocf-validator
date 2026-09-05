import { test, expect } from "vitest";
import {
  bundledSchemaInfo, bundledSchemaInfoFor, parseMajor, cmpSemver, schemaCheck,
} from "../../src/schema-version.js";

test("bundledSchemaInfo reads x-ocf-version from the vendored schema", () => {
  expect(typeof bundledSchemaInfo.version).toBe("string");
  expect(bundledSchemaInfo.major).toBe("v1");
  expect(bundledSchemaInfo.id).toBe("https://opencoachingformat.org/schema/v1.json");
});

test("bundledSchemaInfoFor('v2') reports major v2", () => {
  const info = bundledSchemaInfoFor("v2");
  expect(info.major).toBe("v2");
  expect(info.id).toBe("https://opencoachingformat.org/schema/v2.json");
});

test("bundledSchemaInfoFor('v1') still reports major v1 (unchanged)", () => {
  const info = bundledSchemaInfoFor("v1");
  expect(info.major).toBe("v1");
});

test("parseMajor extracts the major token from a schema URL", () => {
  expect(parseMajor("https://opencoachingformat.org/schema/v1.json")).toBe("v1");
  expect(parseMajor("https://opencoachingformat.org/schema/v2.json")).toBe("v2");
  expect(parseMajor(undefined)).toBe(null);
});

test("cmpSemver orders versions numerically", () => {
  expect(cmpSemver("1.2.0", "1.10.0")).toBeLessThan(0);
  expect(cmpSemver("1.4.0", "1.4.0")).toBe(0);
  expect(cmpSemver("2.0.0", "1.9.9")).toBeGreaterThan(0);
});

test("schemaCheck: matching major, no min -> ok, no issues", () => {
  const r = schemaCheck({ $schema: "https://opencoachingformat.org/schema/v1.json" });
  expect(r.majorUnsupported).toBe(false);
  expect(r.outdated).toBe(false);
  expect(r.block.match).toBe(true);
});

test("schemaCheck: v2 is a supported major (dual-version support)", () => {
  const r = schemaCheck({ $schema: "https://opencoachingformat.org/schema/v2.json" });
  expect(r.majorUnsupported).toBe(false);
  expect(r.declaredMajor).toBe("v2");
  expect(r.block.match).toBe(true);
});

test("schemaCheck: unrecognized major -> majorUnsupported", () => {
  const r = schemaCheck({ $schema: "https://opencoachingformat.org/schema/v3.json" });
  expect(r.majorUnsupported).toBe(true);
  expect(r.block.match).toBe(false);
});

test("schemaCheck: no $schema declared -> defaults to v2 (deliberate default flip)", () => {
  const r = schemaCheck({});
  expect(r.majorUnsupported).toBe(false);
  expect(r.declaredMajor).toBe(null);
  expect(r.block.validatedAgainst).toBe(bundledSchemaInfoFor("v2").version);
});

test("schemaCheck: min_schema_version above bundled -> outdated", () => {
  const r = schemaCheck({ meta: { min_schema_version: "9.9.9" } });
  expect(r.outdated).toBe(true);
  expect(r.block.requiredByDoc).toBe("9.9.9");
});

test("schemaCheck: min_schema_version at/below bundled -> not outdated", () => {
  const r = schemaCheck({ meta: { min_schema_version: "1.0.0" } });
  expect(r.outdated).toBe(false);
});
