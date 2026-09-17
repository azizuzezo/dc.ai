import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("remove")
  .setDescription("Remove a song from the queue")
  .addIntegerOption((opt) =>
    opt.setName("position").setDescription("Position in /queue's \"Up next\" list").setRequired(true).setMinValue(1)
  );

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);

  if (!player || !player.queue.tracks.length) {
    await interaction.reply({ content: "The queue is empty.", flags: MessageFlags.Ephemeral });
    return;
  }

  const position = interaction.options.getInteger("position", true);
  const index = position - 1;
  if (index >= player.queue.tracks.length) {
    await interaction.reply({ content: `That's out of range — the queue only has ${player.queue.tracks.length} track(s).`, flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    const track = player.queue.tracks[index];
    const result = await player.queue.remove(index);
    if (!result) {
      await interaction.reply({ content: "Couldn't remove that track.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply(`🗑️ Removed **${track.info.title}** from the queue.`);
  } catch (err) {
    logError("remove command failed:", err);
    await interaction.reply({ content: "Couldn't remove that track.", flags: MessageFlags.Ephemeral });
  }
}
