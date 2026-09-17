import { SlashCommandBuilder, MessageFlags } from "discord.js";
import * as db from "../services/db.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder().setName("triviascore").setDescription("Show the trivia leaderboard");

export async function execute(interaction) {
  try {
    const leaderboard = await db.getTriviaLeaderboard(interaction.guildId, 10);
    if (!leaderboard.length) {
      await interaction.reply({ content: "No trivia scores yet — play a round with /trivia!", flags: MessageFlags.Ephemeral });
      return;
    }

    const lines = leaderboard.map((row, i) => `${i + 1}. <@${row.user_id}> — ${row.correct_count} correct`);
    await interaction.reply(`🏆 **Trivia Leaderboard**\n${lines.join("\n")}`);
  } catch (err) {
    logError("triviascore command failed:", err);
    await interaction.reply({ content: "Couldn't fetch the trivia leaderboard.", flags: MessageFlags.Ephemeral });
  }
}
