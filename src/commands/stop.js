import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("stop")
  .setDescription("Stop playback and clear the queue (stays in the voice channel)");

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);

  if (!player) {
    await interaction.reply({ content: "I'm not playing anything here.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await player.stopPlaying(true, false);
    await interaction.reply("⏹️ Stopped playback and cleared the queue.");
  } catch (err) {
    logError("stop command failed:", err);
    await interaction.reply({ content: "Couldn't stop playback.", flags: MessageFlags.Ephemeral });
  }
}
