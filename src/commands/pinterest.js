import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("pinterest")
  .setDescription("Get a Pinterest search link for inspiration")
  .addStringOption((opt) => opt.setName("keyword").setDescription("What to search for").setRequired(true));

export async function execute(interaction) {
  const keyword = interaction.options.getString("keyword", true);

  try {
    const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(keyword)}`;
    await interaction.reply(`📌 **${keyword}** di Pinterest:\n${url}`);
  } catch (err) {
    logError("pinterest command failed:", err);
    await interaction.reply({ content: "Couldn't build a Pinterest search link.", flags: MessageFlags.Ephemeral });
  }
}
