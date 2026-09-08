import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration, parseDurationMs, MAX_TIMEOUT_MS } from "../src/services/duration.js";

test("parses seconds/minutes/hours/days", () => {
  assert.equal(parseDuration("30s"), 30_000);
  assert.equal(parseDuration("10m"), 10 * 60_000);
  assert.equal(parseDuration("1h"), 60 * 60_000);
  assert.equal(parseDuration("1d"), 24 * 60 * 60_000);
});

test("caps at Discord's 28-day timeout limit", () => {
  assert.equal(parseDuration("60d"), MAX_TIMEOUT_MS);
});

test("returns null for invalid input", () => {
  assert.equal(parseDuration("abc"), null);
  assert.equal(parseDuration(""), null);
  assert.equal(parseDuration("0m"), null);
  assert.equal(parseDuration("10x"), null);
  assert.equal(parseDuration(null), null);
});

test("parseDurationMs is not capped (for reminders, unlike /mute)", () => {
  assert.equal(parseDurationMs("60d"), 60 * 86_400_000);
});
