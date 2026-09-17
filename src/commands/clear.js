import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Clear the upcoming queue (keeps the current song playing)");

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);

  if (!player || !player.queue.tracks.length) {
    await interaction.reply({ content: "The queue is already empty.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    const cleared = player.queue.tracks.length;
    await player.queue.splice(0, cleared);
    await interaction.reply(`🧹 Cleared **${cleared}** track(s) from the queue.`);
  } catch (err) {
    logError("clear command failed:", err);
    await interaction.reply({ content: "Couldn't clear the queue.", flags: MessageFlags.Ephemeral });
  }
}
