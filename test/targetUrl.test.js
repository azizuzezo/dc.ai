import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidTargetUrl } from "../src/services/targetUrl.js";

test("accepts http(s) URLs", () => {
  assert.equal(isValidTargetUrl("https://example.com"), true);
  assert.equal(isValidTargetUrl("http://example.com/path?q=1"), true);
});

test("rejects malformed strings", () => {
  assert.equal(isValidTargetUrl("not a url"), false);
  assert.equal(isValidTargetUrl(""), false);
});

test("rejects non-http(s) schemes", () => {
  assert.equal(isValidTargetUrl("file:///etc/passwd"), false);
  assert.equal(isValidTargetUrl("javascript:alert(1)"), false);
  assert.equal(isValidTargetUrl("ftp://example.com"), false);
});
