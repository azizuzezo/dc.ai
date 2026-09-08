import { test } from "node:test";
import assert from "node:assert/strict";
import { trimToLimit } from "../src/services/conversationHistory.js";

test("trimToLimit returns history unchanged when under the limit", () => {
  const history = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
  ];
  assert.deepEqual(trimToLimit(history, 5), history);
});

test("trimToLimit keeps only the most recent limit*2 entries", () => {
  const history = Array.from({ length: 10 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: String(i),
  }));
  const trimmed = trimToLimit(history, 3);
  assert.equal(trimmed.length, 6);
  assert.deepEqual(trimmed, history.slice(-6));
});

test("trimToLimit with limit 0 returns an empty array", () => {
  const history = [{ role: "user", content: "a" }];
  assert.deepEqual(trimToLimit(history, 0), []);
});
