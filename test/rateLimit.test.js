import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithinCooldown, pruneWindow } from "../src/services/rateLimit.js";

test("isWithinCooldown is false when there's no prior call", () => {
  assert.equal(isWithinCooldown(null, 1000, 5000), false);
});

test("isWithinCooldown is true inside the cooldown window", () => {
  assert.equal(isWithinCooldown(1000, 3000, 5000), true);
});

test("isWithinCooldown is false once the cooldown has elapsed", () => {
  assert.equal(isWithinCooldown(1000, 7000, 5000), false);
});

test("pruneWindow drops timestamps outside the window", () => {
  assert.deepEqual(pruneWindow([1000, 4000, 9000], 10000, 5000), [9000]);
});

test("pruneWindow keeps everything still inside the window", () => {
  assert.deepEqual(pruneWindow([9000, 9500], 10000, 5000), [9000, 9500]);
});
