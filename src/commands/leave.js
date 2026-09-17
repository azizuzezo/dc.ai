import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("Leave the voice channel");

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);

  if (!player) {
    await interaction.reply({ content: "I'm not in a voice channel here.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await player.destroy();
    await interaction.reply("👋 Left the voice channel.");
  } catch (err) {
    logError("leave command failed:", err);
    await interaction.reply({ content: "Couldn't leave the voice channel.", flags: MessageFlags.Ephemeral });
  }
}
