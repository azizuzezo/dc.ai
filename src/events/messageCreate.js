import { isChannelAllowed } from "../services/channelAllowlist.js";
import { runAiChat } from "../services/aiChatPipeline.js";
import { sendChunkedReply } from "../services/discordReply.js";
import { checkRateLimit } from "../services/rateLimit.js";
import { awardMessageXp } from "../services/leveling.js";
import * as db from "../services/db.js";
import { logError } from "../services/logger.js";

export async function execute(message) {
  if (message.author.bot) return;
  if (!message.guildId) return; // DMs out of scope for Phase 1

  // Fire-and-forget: XP is unrelated to a mention reply, so it shouldn't add
  // its own DB round trip to that critical path.
  awardMessageXp(message.guildId, message.author.id)
    .then((levelUp) => {
      if (levelUp) {
        return message.channel.send(`🎉 GG ${message.author}, kamu naik ke **level ${levelUp.level}**!`).catch(() => {});
      }
    })
    .catch((err) => logError("Failed to award message XP:", err));

  if (!message.mentions.has(message.client.user)) return;

  // isChannelAllowed and the dedup claim are independent lookups — run them
  // concurrently instead of back-to-back so a mention reply only pays for
  // one DB round trip's worth of latency, not two.
  //
  // Dedup guard: a plain message has no single-winner ack the way a slash-command
  // interaction does, so if two bot instances are briefly connected at once (e.g.
  // during a Railway rolling deploy) both would otherwise reply to the same mention.
  // Claiming the message's own unique ID means only the instance whose insert wins
  // actually replies — everyone else bails out right here.
  const [allowed, claimed] = await Promise.all([
    isChannelAllowed(message.guildId, message.channelId),
    db.claimProcessedMessage(message.id).catch((err) => {
      logError("Failed to claim message for dedup — proceeding anyway:", err);
      return true;
    }),
  ]);
  if (!allowed || !claimed) return;

  const userMessage = message.content
    .replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "")
    .trim();
  if (!userMessage) return;

  const rate = checkRateLimit(message.author.id);
  if (!rate.allowed) {
    await message
      .reply(`Please wait a bit before asking again (~${Math.ceil(rate.retryAfterMs / 1000)}s).`)
      .catch(() => {});
    return;
  }

  try {
    await message.channel.sendTyping();
    const reply = await runAiChat({
      channelId: message.channelId,
      guildId: message.guildId,
      userId: message.author.id,
      userMessage,
      userName: message.member?.displayName || message.author.username,
    });
    await sendChunkedReply(message, reply);
  } catch (err) {
    logError("mention-trigger chat failed:", err);
    await message.reply("Sorry, I couldn't get a response right now. Please try again shortly.").catch(() => {});
  }
}
