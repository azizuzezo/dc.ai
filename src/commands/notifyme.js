import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from "discord.js";
import * as db from "../services/db.js";
import { normalizeTiktokUsername } from "../services/tiktokLive.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("notifyme")
  .setDescription("Get notified in this server when a TikTok creator goes live")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Watch a TikTok creator for live notifications")
      .addStringOption((opt) => opt.setName("username").setDescription("TikTok @username").setRequired(true))
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel to post the notification in")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Stop watching a TikTok creator")
      .addStringOption((opt) => opt.setName("username").setDescription("TikTok @username").setRequired(true))
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("List watched TikTok creators in this server"));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    const username = normalizeTiktokUsername(interaction.options.getString("username", true));
    const channel = interaction.options.getChannel("channel", true);
    try {
      await db.addTiktokWatch(interaction.guildId, channel.id, username);
      await interaction.reply(`✅ Will post in ${channel} when **@${username}** goes live on TikTok.`);
    } catch (err) {
      logError("notifyme add failed:", err);
      await interaction.reply({ content: "Couldn't save that watch.", flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (sub === "remove") {
    const username = normalizeTiktokUsername(interaction.options.getString("username", true));
    try {
      const removed = await db.removeTiktokWatch(interaction.guildId, username);
      await interaction.reply(
        removed ? `🗑️ Stopped watching **@${username}**.` : `**@${username}** wasn't being watched.`
      );
    } catch (err) {
      logError("notifyme remove failed:", err);
      await interaction.reply({ content: "Couldn't remove that watch.", flags: MessageFlags.Ephemeral });
    }
    return;
  }

  try {
    const watches = await db.listTiktokWatchesForGuild(interaction.guildId);
    if (!watches.length) {
      await interaction.reply({
        content: "No TikTok creators are being watched in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const lines = watches.map(
      (w) => `- **@${w.tiktok_username}** → <#${w.channel_id}>${w.is_live ? " 🔴 live" : ""}`
    );
    await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
  } catch (err) {
    logError("notifyme list failed:", err);
    await interaction.reply({ content: "Couldn't fetch the watch list.", flags: MessageFlags.Ephemeral });
  }
}
