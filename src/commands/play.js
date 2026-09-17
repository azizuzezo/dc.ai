import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Play a song in your voice channel")
  .addStringOption((opt) => opt.setName("query").setDescription("Song name or URL").setRequired(true));

export async function execute(interaction) {
  const manager = getManager();
  if (!manager) {
    await interaction.reply({ content: "Music isn't configured on this bot yet.", flags: MessageFlags.Ephemeral });
    return;
  }

  const voiceChannel = interaction.member.voice?.channel;
  if (!voiceChannel) {
    await interaction.reply({ content: "Join a voice channel first.", flags: MessageFlags.Ephemeral });
    return;
  }

  const query = interaction.options.getString("query", true);
  await interaction.deferReply();

  let player = manager.getPlayer(interaction.guildId);

  try {
    if (!player) {
      player = manager.createPlayer({
        guildId: interaction.guildId,
        voiceChannelId: voiceChannel.id,
        textChannelId: interaction.channelId,
        selfDeaf: true,
      });
    }

    if (!player.connected) await player.connect();

    const result = await player.search(query, interaction.user);

    if (!result.tracks.length) {
      await interaction.editReply("No results found for that query.");
      return;
    }

    if (result.loadType === "playlist") {
      player.queue.add(result.tracks);
      await interaction.editReply(
        `Added **${result.tracks.length}** tracks from playlist **${result.playlist?.name ?? "playlist"}** to the queue.`
      );
    } else {
      const track = result.tracks[0];
      player.queue.add(track);
      await interaction.editReply(`Added **${track.info.title}** to the queue.`);
    }

    if (!player.playing && !player.paused) await player.play();
  } catch (err) {
    logError("play command failed:", err);
    await interaction.editReply("Something went wrong trying to play that.").catch(() => {});
  }
}
