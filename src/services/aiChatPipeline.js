import { resolveAiConfig, chatCompletion } from "./geminiClient.js";
import { buildMessages, recordTurn } from "./conversationHistory.js";
import { SYSTEM_PROMPT } from "../config/constants.js";

/** Shared by /chat and the mention-trigger path so there is exactly one AI-call code path. */
export async function runAiChat({ channelId, guildId, userMessage }) {
  const { model, baseUrl, apiKey } = await resolveAiConfig();
  const messages = await buildMessages(channelId, SYSTEM_PROMPT, userMessage);
  const reply = await chatCompletion({ baseUrl, apiKey, model, messages });
  await recordTurn(channelId, guildId, userMessage, reply);
  return reply;
}
