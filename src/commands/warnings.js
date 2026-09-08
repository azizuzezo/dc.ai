import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import * as db from "../services/db.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("warnings")
  .setDescription("List a member's warnings")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((opt) => opt.setName("user").setDescription("Member to check").setRequired(true));

export async function execute(interaction) {
  const target = interaction.options.getUser("user", true);

  try {
    const warnings = await db.listWarnings(interaction.guildId, target.id);
    if (warnings.length === 0) {
      await interaction.reply({ content: `${target.tag} has no warnings.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const lines = warnings
      .slice(0, 10)
      .map((w, i) => `${i + 1}. ${w.reason || "No reason"} (${new Date(w.created_at).toLocaleString()})`)
      .join("\n");
    await interaction.reply({
      content: `**${target.tag}** — ${warnings.length} warning(s):\n${lines}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    logError("warnings command failed:", err);
    await interaction.reply({ content: "Something went wrong fetching warnings.", flags: MessageFlags.Ephemeral });
  }
}
