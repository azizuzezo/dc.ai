import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNucleiOutput } from "../src/services/nucleiParser.js";

test("returns zeroed counts for empty output", () => {
  const { counts, findings } = parseNucleiOutput("");
  assert.deepEqual(counts, { critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0, total: 0 });
  assert.deepEqual(findings, []);
});

test("counts findings by severity across jsonl lines", () => {
  const lines = [
    JSON.stringify({ "template-id": "t1", info: { name: "SQLi", severity: "critical" }, "matched-at": "https://x/a" }),
    JSON.stringify({ "template-id": "t2", info: { name: "XSS", severity: "medium" }, "matched-at": "https://x/b" }),
    JSON.stringify({ "template-id": "t3", info: { name: "Info leak", severity: "info" }, "matched-at": "https://x/c" }),
  ].join("\n");
  const { counts, findings } = parseNucleiOutput(lines);
  assert.equal(counts.critical, 1);
  assert.equal(counts.medium, 1);
  assert.equal(counts.info, 1);
  assert.equal(counts.total, 3);
  assert.equal(findings.length, 3);
  assert.equal(findings[0].templateId, "t1");
});

test("skips blank lines and non-JSON stray output", () => {
  const lines = [
    "",
    "   ",
    "[INF] Using Nuclei Engine",
    JSON.stringify({ "template-id": "t1", info: { name: "Test", severity: "low" } }),
  ].join("\n");
  const { counts } = parseNucleiOutput(lines);
  assert.equal(counts.low, 1);
  assert.equal(counts.total, 1);
});

test("buckets an unrecognized/missing severity as unknown", () => {
  const lines = [
    JSON.stringify({ "template-id": "t1", info: { name: "Weird", severity: "banana" } }),
    JSON.stringify({ "template-id": "t2", info: { name: "No severity field" } }),
  ].join("\n");
  const { counts } = parseNucleiOutput(lines);
  assert.equal(counts.unknown, 2);
  assert.equal(counts.total, 2);
});
