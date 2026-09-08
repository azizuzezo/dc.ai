import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("unmute")
  .setDescription("Remove a member's timeout")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((opt) => opt.setName("user").setDescription("Member to unmute").setRequired(true));

export async function execute(interaction) {
  const target = interaction.options.getUser("user", true);

  try {
    const member = await interaction.guild.members.fetch(target.id);
    await member.timeout(null);
    await interaction.reply(`🔊 ${target.tag} has been unmuted.`);
  } catch (err) {
    logError("unmute command failed:", err);
    await interaction.reply({ content: "I couldn't unmute that member.", flags: MessageFlags.Ephemeral });
  }
}
