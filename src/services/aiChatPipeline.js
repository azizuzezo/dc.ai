import { resolveAiConfig, chatCompletion } from "./geminiClient.js";
import { loadHistory, recordTurn } from "./conversationHistory.js";
import { getKnowledgeBlock } from "./knowledge.js";
import { SYSTEM_PROMPT } from "../config/constants.js";

/** Shared by /chat and the mention-trigger path so there is exactly one AI-call code path.
 * Memory is per-person (guildId+userId), not per-channel — so a busy shared channel can't
 * push someone's own context out of it, and the bot keeps continuity with that specific
 * person across every channel in the guild. userName gets prefixed onto the stored/sent
 * content as "Name: message" so replies can address them naturally. */
export async function runAiChat({ channelId, guildId, userId, userMessage, userName }) {
  // These three each touch the DB independently (AI-config overrides, this guild's
  // knowledge base, this person's history) — running them concurrently instead of
  // one after another turns 3 round trips into 1 on the critical path.
  const [{ model, baseUrl, apiKey }, knowledgeBlock, history] = await Promise.all([
    resolveAiConfig(),
    getKnowledgeBlock(guildId),
    loadHistory(guildId, userId),
  ]);
  const systemPrompt = knowledgeBlock ? `${SYSTEM_PROMPT}\n\n${knowledgeBlock}` : SYSTEM_PROMPT;
  const attributedMessage = userName ? `${userName}: ${userMessage}` : userMessage;
  const messages = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: attributedMessage }];
  const reply = await chatCompletion({ baseUrl, apiKey, model, messages });
  await recordTurn(channelId, guildId, userId, attributedMessage, reply);
  return reply;
}
