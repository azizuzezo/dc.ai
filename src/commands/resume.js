import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder().setName("resume").setDescription("Resume the paused song");

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);

  if (!player || !player.paused) {
    await interaction.reply({ content: "Nothing is paused right now.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await player.resume();
    await interaction.reply("▶️ Resumed.");
  } catch (err) {
    logError("resume command failed:", err);
    await interaction.reply({ content: "Couldn't resume playback.", flags: MessageFlags.Ephemeral });
  }
}
