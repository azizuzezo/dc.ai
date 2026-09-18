import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("join")
  .setDescription("Join your voice channel without playing anything");

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

  try {
    let player = manager.getPlayer(interaction.guildId);
    if (!player) {
      player = manager.createPlayer({
        guildId: interaction.guildId,
        voiceChannelId: voiceChannel.id,
        textChannelId: interaction.channelId,
        selfDeaf: true,
      });
    }
    if (!player.connected) await player.connect();
    await interaction.reply(`✅ Joined ${voiceChannel}.`);
  } catch (err) {
    logError("join command failed:", err);
    await interaction.reply({ content: "Couldn't join that voice channel.", flags: MessageFlags.Ephemeral });
  }
}
