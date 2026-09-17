import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the queue");

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);

  if (!player || !player.queue.tracks.length) {
    await interaction.reply({ content: "There's nothing queued to shuffle.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await player.queue.shuffle();
    await interaction.reply("🔀 Shuffled the queue.");
  } catch (err) {
    logError("shuffle command failed:", err);
    await interaction.reply({ content: "Couldn't shuffle the queue.", flags: MessageFlags.Ephemeral });
  }
}
