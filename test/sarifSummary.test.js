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

test("excludes level:none coverage/pass markers from every count", () => {
  // Strix emits these for "this area was checked, nothing found" — not a
  // vulnerability, so a clean scan shouldn't show a nonzero total.
  const sarif = { runs: [{ results: [{ level: "none", kind: "pass" }, { level: "error" }] }] };
  assert.deepEqual(parseSarifSummary(sarif), { error: 1, warning: 0, note: 0, total: 1 });
});

test("a scan with only coverage markers reports zero total findings", () => {
  const sarif = { runs: [{ results: [{ level: "none", kind: "pass" }] }] };
  assert.deepEqual(parseSarifSummary(sarif), { error: 0, warning: 0, note: 0, total: 0 });
});
