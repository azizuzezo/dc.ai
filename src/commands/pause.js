import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder().setName("pause").setDescription("Pause the current song");

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);

  if (!player || !player.playing || player.paused) {
    await interaction.reply({ content: "Nothing is playing right now.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await player.pause();
    await interaction.reply("⏸️ Paused.");
  } catch (err) {
    logError("pause command failed:", err);
    await interaction.reply({ content: "Couldn't pause playback.", flags: MessageFlags.Ephemeral });
  }
}
