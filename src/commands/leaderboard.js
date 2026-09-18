import { SlashCommandBuilder, MessageFlags } from "discord.js";
import * as db from "../services/db.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show the top chat levels in this server");

export async function execute(interaction) {
  try {
    const rows = await db.getLeaderboard(interaction.guildId, 10);
    if (!rows.length) {
      await interaction.reply({ content: "No one has earned XP yet.", flags: MessageFlags.Ephemeral });
      return;
    }
    const medals = ["🥇", "🥈", "🥉"];
    const lines = rows.map((row, i) => `${medals[i] ?? `${i + 1}.`} <@${row.user_id}> — level ${row.level} (${row.xp} XP)`);
    await interaction.reply(lines.join("\n"));
  } catch (err) {
    logError("leaderboard command failed:", err);
    await interaction.reply({ content: "Couldn't fetch the leaderboard.", flags: MessageFlags.Ephemeral });
  }
}
