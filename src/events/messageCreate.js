import { isChannelAllowed } from "../services/channelAllowlist.js";
import { runAiChat } from "../services/aiChatPipeline.js";
import { sendChunkedReply } from "../services/discordReply.js";
import { checkRateLimit } from "../services/rateLimit.js";
import { logError } from "../services/logger.js";

export async function execute(message) {
  if (message.author.bot) return;
  if (!message.guildId) return; // DMs out of scope for Phase 1
  if (!message.mentions.has(message.client.user)) return;

  const allowed = await isChannelAllowed(message.guildId, message.channelId);
  if (!allowed) return;

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
      userMessage,
    });
    await sendChunkedReply(message, reply);
  } catch (err) {
    logError("mention-trigger chat failed:", err);
    await message.reply("Sorry, I couldn't get a response right now. Please try again shortly.").catch(() => {});
  }
}
