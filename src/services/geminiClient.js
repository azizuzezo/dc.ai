import { env } from "../config/env.js";
import { DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS } from "../config/constants.js";
import * as db from "./db.js";

export class GeminiRequestError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message);
    this.name = "GeminiRequestError";
    this.status = status;
    this.cause = cause;
  }
}

export function buildChatRequestBody({ model, messages, temperature = DEFAULT_TEMPERATURE, maxTokens = DEFAULT_MAX_TOKENS }) {
  return { model, messages, temperature, max_tokens: maxTokens };
}

/**
 * Single-attempt call to gemini-web2api's OpenAI-compatible endpoint.
 * No retry here — gemini-web2api already retries upstream with
 * backoff + a 429 circuit breaker (see PRD §9).
 */
export async function chatCompletion({ baseUrl, apiKey, model, messages, fetchImpl = fetch }) {
  // AI_BASE_URL is expected to already include the /v1 prefix (matches
  // whatsapp-group-bot's convention, e.g. https://host/v1) — do not
  // append /v1 again here.
  const url = `${baseUrl}/chat/completions`;

  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildChatRequestBody({ model, messages })),
    });
  } catch (cause) {
    throw new GeminiRequestError("Network error calling gemini-web2api", { cause });
  }

  let data;
  try {
    data = await response.json();
  } catch (cause) {
    throw new GeminiRequestError("Invalid JSON response from gemini-web2api", { status: response.status, cause });
  }

  if (!response.ok || data?.error) {
    throw new GeminiRequestError(data?.error?.message || `gemini-web2api error (status ${response.status})`, {
      status: response.status,
    });
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new GeminiRequestError("gemini-web2api returned no message content", { status: response.status });
  }

  return content;
}

/** Resolves admin-dashboard overrides over env defaults, read fresh per call. */
export async function resolveAiConfig() {
  const overrides = await db.getGlobalAiSettings();
  return {
    model: overrides.model || env.aiModel,
    baseUrl: overrides.baseUrl || env.aiBaseUrl,
    apiKey: overrides.apiKey || env.aiApiKey,
  };
}
