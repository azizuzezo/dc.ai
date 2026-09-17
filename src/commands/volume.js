import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("volume")
  .setDescription("Set playback volume")
  .addIntegerOption((opt) => opt.setName("level").setDescription("0-150").setRequired(true));

export async function execute(interaction) {
  const level = interaction.options.getInteger("level", true);
  if (level < 0 || level > 150) {
    await interaction.reply({ content: "Volume must be between 0 and 150.", flags: MessageFlags.Ephemeral });
    return;
  }

  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);
  if (!player) {
    await interaction.reply({ content: "I'm not playing anything here.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await player.setVolume(level);
    await interaction.reply(`🔊 Volume set to ${level}%.`);
  } catch (err) {
    logError("volume command failed:", err);
    await interaction.reply({ content: "Couldn't change the volume.", flags: MessageFlags.Ephemeral });
  }
}
