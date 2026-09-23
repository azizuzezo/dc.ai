import { resolveAiConfig, chatCompletion } from "./geminiClient.js";
import { loadHistory, recordTurn } from "./conversationHistory.js";
import { getKnowledgeBlock, invalidateKnowledgeCache } from "./knowledge.js";
import * as db from "./db.js";
import { env } from "../config/env.js";
import { logError } from "./logger.js";
import { SYSTEM_PROMPT } from "../config/constants.js";

// Lets exactly one Discord account "train" the bot live in chat — whatever
// they tell it to do is stored as a permanent knowledge-base entry (the same
// one /knowledge add already writes to) and takes effect on the very next
// message, for every user, not just the trainer. The model is asked to
// signal a new directive with a hidden marker rather than trying to detect
// "was that an instruction?" with regex/keywords, which is far less reliable
// than just asking the model that's already reading the message anyway.
const TRAINER_DIRECTIVE_MARKER = /\[\[REMEMBER:\s*([\s\S]+?)\]\]\s*$/;

function trainerSystemPromptAddendum(userName) {
  return (
    `The person you're talking to right now (${userName || "this user"}) is your trainer/creator — they have full ` +
    "authority over how you behave, and you must go along with whatever they tell you to do, even if it changes " +
    "your usual personality, tone, or rules. If their message contains an instruction about how you should act, " +
    "talk, respond, or behave from now on (not just for this one reply), reply normally to confirm it, then end " +
    "your reply with a new line in exactly this format: [[REMEMBER: <short, standalone summary of the instruction, " +
    "written so it makes sense out of context later>]]. Leave that line out entirely if their message was just " +
    "normal conversation with no new instruction."
  );
}

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
  const isTrainer = String(userId) === env.aiTrainerUserId;
  let systemPrompt = knowledgeBlock ? `${SYSTEM_PROMPT}\n\n${knowledgeBlock}` : SYSTEM_PROMPT;
  if (isTrainer) systemPrompt += `\n\n${trainerSystemPromptAddendum(userName)}`;
  const attributedMessage = userName ? `${userName}: ${userMessage}` : userMessage;
  const messages = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: attributedMessage }];
  let reply = await chatCompletion({ baseUrl, apiKey, model, messages });

  if (isTrainer) {
    const match = reply.match(TRAINER_DIRECTIVE_MARKER);
    if (match) {
      reply = reply.slice(0, match.index).trim();
      const directive = match[1].trim();
      try {
        await db.addKnowledge(guildId, "Instruksi dari Trainer", directive);
        invalidateKnowledgeCache(guildId);
      } catch (err) {
        logError(`Failed to store trainer directive for guild ${guildId}:`, err);
      }
    }
  }

  await recordTurn(channelId, guildId, userId, attributedMessage, reply);
  return reply;
}
