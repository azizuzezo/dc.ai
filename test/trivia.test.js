import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTriviaResponse } from "../src/services/trivia.js";

test("parses a valid JSON trivia response", () => {
  const raw = JSON.stringify({ question: "2+2?", options: ["1", "2", "3", "4"], correctIndex: 3 });
  assert.deepEqual(parseTriviaResponse(raw), { question: "2+2?", options: ["1", "2", "3", "4"], correctIndex: 3 });
});

test("strips markdown code fences before parsing", () => {
  const raw = "```json\n" + JSON.stringify({ question: "Q", options: ["a", "b", "c", "d"], correctIndex: 0 }) + "\n```";
  const parsed = parseTriviaResponse(raw);
  assert.equal(parsed.question, "Q");
});

test("returns null for malformed JSON", () => {
  assert.equal(parseTriviaResponse("not json"), null);
});

test("returns null when options length isn't 4", () => {
  const raw = JSON.stringify({ question: "Q", options: ["a", "b"], correctIndex: 0 });
  assert.equal(parseTriviaResponse(raw), null);
});

test("returns null when correctIndex is out of range", () => {
  const raw = JSON.stringify({ question: "Q", options: ["a", "b", "c", "d"], correctIndex: 5 });
  assert.equal(parseTriviaResponse(raw), null);
});
