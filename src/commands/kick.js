import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Kick a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((opt) => opt.setName("user").setDescription("Member to kick").setRequired(true))
  .addStringOption((opt) => opt.setName("reason").setDescription("Reason").setRequired(false));

export async function execute(interaction) {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") || "No reason provided";

  try {
    const member = await interaction.guild.members.fetch(target.id);
    await member.kick(reason);
    await interaction.reply(`👢 ${target.tag} has been kicked. Reason: ${reason}`);
  } catch (err) {
    logError("kick command failed:", err);
    await interaction.reply({
      content: "I couldn't kick that member — check that my role is above theirs and I have Kick Members permission.",
      ephemeral: true,
    });
  }
}
