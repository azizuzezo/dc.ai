import { test } from "node:test";
import assert from "node:assert/strict";
import { extractYouTubeId, parseTimeToSeconds } from "../src/services/youtube.js";

test("extracts id from a standard watch URL", () => {
  assert.equal(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("extracts id from a watch URL with extra query params", () => {
  assert.equal(extractYouTubeId("https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s&list=PL123"), "dQw4w9WgXcQ");
});

test("extracts id from a youtu.be short link", () => {
  assert.equal(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("extracts id from a youtu.be link with a query string", () => {
  assert.equal(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ?t=5"), "dQw4w9WgXcQ");
});

test("extracts id from a shorts URL", () => {
  assert.equal(extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("extracts id from an embed URL", () => {
  assert.equal(extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("returns null for a non-YouTube URL", () => {
  assert.equal(extractYouTubeId("https://vimeo.com/12345"), null);
});

test("returns null for a malformed URL", () => {
  assert.equal(extractYouTubeId("not a url"), null);
});

test("returns null for empty input", () => {
  assert.equal(extractYouTubeId(""), null);
  assert.equal(extractYouTubeId(null), null);
});

test("parseTimeToSeconds handles mm:ss", () => {
  assert.equal(parseTimeToSeconds("1:30"), 90);
  assert.equal(parseTimeToSeconds("0:05"), 5);
});

test("parseTimeToSeconds handles h:mm:ss", () => {
  assert.equal(parseTimeToSeconds("1:02:03"), 3723);
});

test("parseTimeToSeconds handles a plain number of seconds", () => {
  assert.equal(parseTimeToSeconds("90"), 90);
  assert.equal(parseTimeToSeconds("0"), 0);
});

test("parseTimeToSeconds returns null for empty/malformed input", () => {
  assert.equal(parseTimeToSeconds(""), null);
  assert.equal(parseTimeToSeconds(null), null);
  assert.equal(parseTimeToSeconds(undefined), null);
  assert.equal(parseTimeToSeconds("abc"), null);
  assert.equal(parseTimeToSeconds("1:2:3:4"), null);
  assert.equal(parseTimeToSeconds("-5"), null);
});
