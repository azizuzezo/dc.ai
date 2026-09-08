import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import * as db from "../services/db.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Warn a member")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((opt) => opt.setName("user").setDescription("Member to warn").setRequired(true))
  .addStringOption((opt) => opt.setName("reason").setDescription("Reason").setRequired(false));

export async function execute(interaction) {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason") || "No reason provided";

  try {
    await db.addWarning(interaction.guildId, target.id, interaction.user.id, reason);
    const warnings = await db.listWarnings(interaction.guildId, target.id);
    await interaction.reply(
      `⚠️ ${target.tag} has been warned. Reason: ${reason}\nTotal warnings: ${warnings.length}`
    );
  } catch (err) {
    logError("warn command failed:", err);
    await interaction.reply({ content: "Something went wrong recording that warning.", ephemeral: true });
  }
}
