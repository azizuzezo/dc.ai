import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";

export const data = new SlashCommandBuilder()
  .setName("nowplaying")
  .setDescription("Show the currently playing song");

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);
  const track = player?.queue.current;

  if (!track) {
    await interaction.reply({ content: "Nothing is playing right now.", flags: MessageFlags.Ephemeral });
    return;
  }

  const durationLabel = track.info.isStream ? "LIVE" : formatMs(track.info.duration);
  await interaction.reply(`🎶 **${track.info.title}** — ${formatMs(player.position)} / ${durationLabel}`);
}
