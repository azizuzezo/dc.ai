import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChatRequestBody, chatCompletion, GeminiRequestError } from "../src/services/geminiClient.js";

test("buildChatRequestBody produces the expected shape", () => {
  const body = buildChatRequestBody({ model: "gemini-3.6-flash", messages: [{ role: "user", content: "hi" }] });
  assert.deepEqual(body, {
    model: "gemini-3.6-flash",
    messages: [{ role: "user", content: "hi" }],
    temperature: 0.7,
    max_tokens: 1200,
  });
});

test("chatCompletion posts to {baseUrl}/chat/completions without duplicating /v1", async () => {
  let capturedUrl;
  const fetchImpl = async (url) => {
    capturedUrl = url;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
  };
  await chatCompletion({
    baseUrl: "https://api.support.duacincin.id/v1",
    apiKey: "key",
    model: "m",
    messages: [],
    fetchImpl,
  });
  assert.equal(capturedUrl, "https://api.support.duacincin.id/v1/chat/completions");
});

test("chatCompletion extracts content from a successful response", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: "hello there" } }] }),
  });
  const result = await chatCompletion({
    baseUrl: "http://example.test",
    apiKey: "key",
    model: "gemini-3.6-flash",
    messages: [],
    fetchImpl,
  });
  assert.equal(result, "hello there");
});

test("chatCompletion throws GeminiRequestError on non-ok response", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: { message: "boom" } }),
  });
  await assert.rejects(
    () => chatCompletion({ baseUrl: "http://example.test", apiKey: "key", model: "m", messages: [], fetchImpl }),
    GeminiRequestError
  );
});

test("chatCompletion throws GeminiRequestError when body has an error field despite ok:true", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ error: { message: "quota exceeded" } }),
  });
  await assert.rejects(
    () => chatCompletion({ baseUrl: "http://example.test", apiKey: "key", model: "m", messages: [], fetchImpl }),
    GeminiRequestError
  );
});

test("chatCompletion throws GeminiRequestError on network failure", async () => {
  const fetchImpl = async () => {
    throw new Error("network down");
  };
  await assert.rejects(
    () => chatCompletion({ baseUrl: "http://example.test", apiKey: "key", model: "m", messages: [], fetchImpl }),
    GeminiRequestError
  );
});
