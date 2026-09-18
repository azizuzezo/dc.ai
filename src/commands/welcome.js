import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from "discord.js";
import * as db from "../services/db.js";
import { logError } from "../services/logger.js";

const DEFAULT_WELCOME = "👋 Welcome {user} to **{server}**! We're now {membercount} members strong.";
const DEFAULT_LEAVE = "👋 **{username}** has left **{server}**. We're now {membercount} members.";

export function fillTemplate(template, member) {
  return template
    .replaceAll("{user}", `${member}`)
    .replaceAll("{username}", member.user?.username ?? member.username ?? "someone")
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{membercount}", `${member.guild.memberCount}`);
}

export const data = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Configure welcome/leave messages for this server")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommandGroup((group) =>
    group
      .setName("join")
      .setDescription("Messages posted when someone joins")
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("Enable and configure the join message")
          .addChannelOption((opt) =>
            opt
              .setName("channel")
              .setDescription("Channel to post in")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
          .addStringOption((opt) =>
            opt
              .setName("message")
              .setDescription("Use {user} {username} {server} {membercount} as placeholders")
              .setRequired(false)
          )
      )
      .addSubcommand((sub) => sub.setName("disable").setDescription("Turn off join messages"))
      .addSubcommand((sub) => sub.setName("test").setDescription("Preview the join message"))
  )
  .addSubcommandGroup((group) =>
    group
      .setName("leave")
      .setDescription("Messages posted when someone leaves")
      .addSubcommand((sub) =>
        sub
          .setName("set")
          .setDescription("Enable and configure the leave message")
          .addChannelOption((opt) =>
            opt
              .setName("channel")
              .setDescription("Channel to post in")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
          .addStringOption((opt) =>
            opt
              .setName("message")
              .setDescription("Use {username} {server} {membercount} as placeholders")
              .setRequired(false)
          )
      )
      .addSubcommand((sub) => sub.setName("disable").setDescription("Turn off leave messages"))
      .addSubcommand((sub) => sub.setName("test").setDescription("Preview the leave message"))
  );

export async function execute(interaction) {
  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();

  try {
    if (group === "join") {
      if (sub === "set") {
        const channel = interaction.options.getChannel("channel", true);
        const message = interaction.options.getString("message") ?? DEFAULT_WELCOME;
        await db.setWelcomeMessage(interaction.guildId, channel.id, message);
        await interaction.reply(`✅ Will post a welcome message in ${channel} when someone joins.`);
        return;
      }
      if (sub === "disable") {
        await db.disableWelcomeMessage(interaction.guildId);
        await interaction.reply("🔕 Join messages disabled.");
        return;
      }
      const settings = await db.getWelcomeSettings(interaction.guildId);
      if (!settings.welcome_channel_id) {
        await interaction.reply({ content: "Join messages aren't set up yet.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(fillTemplate(settings.welcome_message ?? DEFAULT_WELCOME, interaction.member));
      return;
    }

    if (group === "leave") {
      if (sub === "set") {
        const channel = interaction.options.getChannel("channel", true);
        const message = interaction.options.getString("message") ?? DEFAULT_LEAVE;
        await db.setLeaveMessage(interaction.guildId, channel.id, message);
        await interaction.reply(`✅ Will post a leave message in ${channel} when someone leaves.`);
        return;
      }
      if (sub === "disable") {
        await db.disableLeaveMessage(interaction.guildId);
        await interaction.reply("🔕 Leave messages disabled.");
        return;
      }
      const settings = await db.getWelcomeSettings(interaction.guildId);
      if (!settings.leave_channel_id) {
        await interaction.reply({ content: "Leave messages aren't set up yet.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply(fillTemplate(settings.leave_message ?? DEFAULT_LEAVE, interaction.member));
      return;
    }
  } catch (err) {
    logError("welcome command failed:", err);
    await interaction.reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral });
  }
}

export { DEFAULT_WELCOME, DEFAULT_LEAVE };
