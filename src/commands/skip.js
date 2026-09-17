import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder().setName("skip").setDescription("Skip the current song");

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);
  const track = player?.queue.current;

  if (!player || !track) {
    await interaction.reply({ content: "Nothing is playing right now.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.member.voice?.channelId !== player.voiceChannelId) {
    await interaction.reply({ content: "Join the voice channel to skip.", flags: MessageFlags.Ephemeral });
    return;
  }

  const requesterId = typeof track.requester === "object" ? track.requester?.id : track.requester;
  const isAdmin =
    interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
    interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
  const isRequester = requesterId === interaction.user.id;

  const voiceChannel = interaction.guild.channels.cache.get(player.voiceChannelId);
  const listenerCount = voiceChannel ? voiceChannel.members.filter((m) => !m.user.bot).size : 1;

  try {
    // Solo listeners, the requester of the current track, and admins skip
    // instantly — a vote is only needed when someone else in a shared
    // channel wants to cut off what another listener queued.
    if (isAdmin || isRequester || listenerCount <= 1) {
      player.deleteData("skipVotes");
      await player.skip();
      await interaction.reply(`⏭️ Skipped **${track.info.title}**.`);
      return;
    }

    const required = Math.ceil(listenerCount / 2);
    const votes = player.getData("skipVotes") ?? new Set();

    if (votes.has(interaction.user.id)) {
      await interaction.reply({
        content: `You already voted to skip — ${votes.size}/${required} needed.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    votes.add(interaction.user.id);

    if (votes.size >= required) {
      player.deleteData("skipVotes");
      await player.skip();
      await interaction.reply(`⏭️ Vote passed — skipped **${track.info.title}**.`);
    } else {
      player.setData("skipVotes", votes);
      await interaction.reply(`🗳️ Vote to skip **${track.info.title}**: ${votes.size}/${required}.`);
    }
  } catch (err) {
    logError("skip command failed:", err);
    await interaction.reply({ content: "Couldn't skip that.", flags: MessageFlags.Ephemeral });
  }
}
