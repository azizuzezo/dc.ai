import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { parseDuration } from "../services/duration.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Timeout a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((opt) => opt.setName("user").setDescription("Member to mute").setRequired(true))
  .addStringOption((opt) => opt.setName("duration").setDescription("e.g. 10m, 1h, 1d").setRequired(true))
  .addStringOption((opt) => opt.setName("reason").setDescription("Reason").setRequired(false));

export async function execute(interaction) {
  const target = interaction.options.getUser("user", true);
  const durationInput = interaction.options.getString("duration", true);
  const reason = interaction.options.getString("reason") || "No reason provided";

  const ms = parseDuration(durationInput);
  if (!ms) {
    await interaction.reply({ content: "Invalid duration. Use formats like 10m, 1h, or 1d.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    const member = await interaction.guild.members.fetch(target.id);
    await member.timeout(ms, reason);
    await interaction.reply(`🔇 ${target.tag} has been muted for ${durationInput}. Reason: ${reason}`);
  } catch (err) {
    logError("mute command failed:", err);
    await interaction.reply({
      content:
        "I couldn't mute that member — check that my role is above theirs and I have Moderate Members permission.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
