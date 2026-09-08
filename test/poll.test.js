import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePollOptions } from "../src/commands/poll.js";

test("splits comma-separated options and trims whitespace", () => {
  assert.deepEqual(parsePollOptions("Cats, Dogs ,Birds"), ["Cats", "Dogs", "Birds"]);
});

test("filters out empty entries", () => {
  assert.deepEqual(parsePollOptions("A,,B,"), ["A", "B"]);
});

test("caps at 10 options", () => {
  const raw = Array.from({ length: 15 }, (_, i) => `opt${i}`).join(",");
  assert.equal(parsePollOptions(raw).length, 10);
});
