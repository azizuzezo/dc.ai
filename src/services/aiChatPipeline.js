import { resolveAiConfig, chatCompletion } from "./geminiClient.js";
import { buildMessages, recordTurn } from "./conversationHistory.js";
import { getKnowledgeBlock } from "./knowledge.js";
import { SYSTEM_PROMPT } from "../config/constants.js";

/** Shared by /chat and the mention-trigger path so there is exactly one AI-call code path. */
export async function runAiChat({ channelId, guildId, userMessage }) {
  const { model, baseUrl, apiKey } = await resolveAiConfig();
  const knowledgeBlock = await getKnowledgeBlock(guildId);
  const systemPrompt = knowledgeBlock ? `${SYSTEM_PROMPT}\n\n${knowledgeBlock}` : SYSTEM_PROMPT;
  const messages = await buildMessages(channelId, systemPrompt, userMessage);
  const reply = await chatCompletion({ baseUrl, apiKey, model, messages });
  await recordTurn(channelId, guildId, userMessage, reply);
  return reply;
}
