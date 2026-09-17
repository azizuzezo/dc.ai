import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";

export const data = new SlashCommandBuilder().setName("queue").setDescription("Show the current music queue");

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);

  if (!player || (!player.queue.current && !player.queue.tracks.length)) {
    await interaction.reply({ content: "The queue is empty.", flags: MessageFlags.Ephemeral });
    return;
  }

  const lines = [`**Now playing:** ${player.queue.current?.info.title ?? "—"}`];

  const upcoming = player.queue.tracks.slice(0, 10);
  if (upcoming.length) {
    lines.push("", "**Up next:**", upcoming.map((t, i) => `${i + 1}. ${t.info.title}`).join("\n"));
    if (player.queue.tracks.length > upcoming.length) {
      lines.push(`...and ${player.queue.tracks.length - upcoming.length} more`);
    }
  }

  await interaction.reply(lines.join("\n"));
}
