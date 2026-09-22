import { resolveAiConfig, chatCompletion } from "./geminiClient.js";
import { buildMessages, recordTurn } from "./conversationHistory.js";
import { getKnowledgeBlock } from "./knowledge.js";
import { SYSTEM_PROMPT } from "../config/constants.js";

/** Shared by /chat and the mention-trigger path so there is exactly one AI-call code path.
 * userName (the Discord display name of whoever sent this turn) gets prefixed onto the
 * stored/sent content as "Name: message" — the only signal the model has for who's who in a
 * channel where several different people can each mention/command the bot. */
export async function runAiChat({ channelId, guildId, userMessage, userName }) {
  const { model, baseUrl, apiKey } = await resolveAiConfig();
  const knowledgeBlock = await getKnowledgeBlock(guildId);
  const systemPrompt = knowledgeBlock ? `${SYSTEM_PROMPT}\n\n${knowledgeBlock}` : SYSTEM_PROMPT;
  const attributedMessage = userName ? `${userName}: ${userMessage}` : userMessage;
  const messages = await buildMessages(channelId, systemPrompt, attributedMessage);
  const reply = await chatCompletion({ baseUrl, apiKey, model, messages });
  await recordTurn(channelId, guildId, attributedMessage, reply);
  return reply;
}
