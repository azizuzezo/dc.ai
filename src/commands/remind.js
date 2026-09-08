import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { parseDurationMs } from "../services/duration.js";
import * as db from "../services/db.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("remind")
  .setDescription("Set a reminder")
  .addStringOption((opt) => opt.setName("duration").setDescription("e.g. 10m, 1h, 1d").setRequired(true))
  .addStringOption((opt) => opt.setName("message").setDescription("What to remind you about").setRequired(true));

export async function execute(interaction) {
  const durationInput = interaction.options.getString("duration", true);
  const message = interaction.options.getString("message", true);

  const ms = parseDurationMs(durationInput);
  if (!ms) {
    await interaction.reply({ content: "Invalid duration. Use formats like 10m, 1h, or 1d.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await db.createReminder({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      message,
      remindAt: new Date(Date.now() + ms),
    });
    await interaction.reply({ content: `⏰ Got it — I'll remind you in ${durationInput}.`, flags: MessageFlags.Ephemeral });
  } catch (err) {
    logError("remind command failed:", err);
    await interaction.reply({ content: "Something went wrong scheduling that reminder.", flags: MessageFlags.Ephemeral });
  }
}
