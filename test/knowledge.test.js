import { test } from "node:test";
import assert from "node:assert/strict";
import { formatForPrompt } from "../src/services/knowledge.js";

test("returns empty string for no entries", () => {
  assert.equal(formatForPrompt([]), "");
  assert.equal(formatForPrompt(null), "");
});

test("concatenates entries as title/content blocks", () => {
  const result = formatForPrompt([
    { title: "Rules", content: "Be nice." },
    { title: "FAQ", content: "Yes, we ship weekly." },
  ]);
  assert.match(result, /## Rules\nBe nice\./);
  assert.match(result, /## FAQ\nYes, we ship weekly\./);
});
