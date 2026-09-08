import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSarifSummary } from "../src/services/sarifSummary.js";

test("returns null for missing runs array", () => {
  assert.equal(parseSarifSummary({}), null);
  assert.equal(parseSarifSummary(null), null);
  assert.equal(parseSarifSummary(undefined), null);
});

test("counts results by severity level across runs", () => {
  const sarif = {
    runs: [
      { results: [{ level: "error" }, { level: "warning" }, { level: "warning" }] },
      { results: [{ level: "note" }] },
    ],
  };
  assert.deepEqual(parseSarifSummary(sarif), { error: 1, warning: 2, note: 1, total: 4 });
});

test("handles missing/empty results gracefully", () => {
  assert.deepEqual(parseSarifSummary({ runs: [{}] }), { error: 0, warning: 0, note: 0, total: 0 });
  assert.deepEqual(parseSarifSummary({ runs: [] }), { error: 0, warning: 0, note: 0, total: 0 });
});

test("counts unrecognized levels toward total but not a named bucket", () => {
  const sarif = { runs: [{ results: [{ level: "none" }, { level: "error" }] }] };
  assert.deepEqual(parseSarifSummary(sarif), { error: 1, warning: 0, note: 0, total: 2 });
});
