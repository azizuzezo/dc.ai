import { SlashCommandBuilder, EmbedBuilder, ChannelType, MessageFlags } from "discord.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder().setName("serverstats").setDescription("Show stats about this server");

export async function execute(interaction) {
  const guild = interaction.guild;

  try {
    const owner = await guild.fetchOwner().catch(() => null);
    const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;

    const embed = new EmbedBuilder()
      .setTitle(`${guild.name} — Server Stats`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: "Members", value: `${guild.memberCount}`, inline: true },
        { name: "Roles", value: `${guild.roles.cache.size}`, inline: true },
        { name: "Boosts", value: `${guild.premiumSubscriptionCount ?? 0} (tier ${guild.premiumTier})`, inline: true },
        { name: "Text channels", value: `${textChannels}`, inline: true },
        { name: "Voice channels", value: `${voiceChannels}`, inline: true },
        { name: "Owner", value: owner ? `<@${owner.id}>` : "Unknown", inline: true },
        { name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true }
      )
      .setColor(0x5865f2);

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logError("serverstats command failed:", err);
    await interaction.reply({ content: "Couldn't fetch server stats.", flags: MessageFlags.Ephemeral });
  }
}
