import { test } from "node:test";
import assert from "node:assert/strict";
import { extractYouTubeId } from "../src/services/youtube.js";

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
