import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { isChannelAllowed } from "../services/channelAllowlist.js";
import { runAiChat } from "../services/aiChatPipeline.js";
import { replyChunked } from "../services/discordReply.js";
import { checkRateLimit } from "../services/rateLimit.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("chat")
  .setDescription("Ask the AI a question")
  .addStringOption((opt) => opt.setName("message").setDescription("Your message").setRequired(true));

export async function execute(interaction) {
  const allowed = await isChannelAllowed(interaction.guildId, interaction.channelId);
  if (!allowed) {
    await interaction.reply({ content: "AI chat isn't enabled in this channel.", flags: MessageFlags.Ephemeral });
    return;
  }

  const rate = checkRateLimit(interaction.user.id);
  if (!rate.allowed) {
    await interaction.reply({
      content: `Please wait a bit before asking again (~${Math.ceil(rate.retryAfterMs / 1000)}s).`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Defer immediately: gemini-web2api latency can exceed Discord's 3s window.
  await interaction.deferReply();

  const userMessage = interaction.options.getString("message", true);

  try {
    const reply = await runAiChat({
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      userMessage,
    });
    await replyChunked(interaction, reply);
  } catch (err) {
    logError("chat command failed:", err);
    await interaction.editReply("Sorry, I couldn't get a response right now. Please try again shortly.");
  }
}
