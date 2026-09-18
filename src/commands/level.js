import { SlashCommandBuilder, MessageFlags } from "discord.js";
import * as db from "../services/db.js";
import { xpProgress } from "../services/leveling.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("level")
  .setDescription("Show your (or someone else's) chat level")
  .addUserOption((opt) => opt.setName("user").setDescription("Whose level to check").setRequired(false));

export async function execute(interaction) {
  const target = interaction.options.getUser("user") ?? interaction.user;

  try {
    const row = await db.getLevel(interaction.guildId, target.id);
    const { level, xpIntoLevel, xpNeeded } = xpProgress(row.xp);
    await interaction.reply(
      `📊 **${target.username}** is level **${level}** (${xpIntoLevel}/${xpNeeded} XP to next level)`
    );
  } catch (err) {
    logError("level command failed:", err);
    await interaction.reply({ content: "Couldn't fetch that level.", flags: MessageFlags.Ephemeral });
  }
}
