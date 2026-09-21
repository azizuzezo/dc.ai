import { SlashCommandBuilder, MessageFlags } from "discord.js";
import * as db from "../services/db.js";
import { env } from "../config/env.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("donate")
  .setDescription("Get this server's donation link");

export async function execute(interaction) {
  try {
    const settings = await db.getDonationSettings(interaction.guildId);
    if (!settings?.gateway_url) {
      await interaction.reply({
        content:
          "Donasi belum diaktifkan di server ini. Admin bisa setup lewat dashboard admin → pilih server → Donations.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!env.publicBaseUrl) {
      await interaction.reply({
        content: "Cek halaman Donation Settings di dashboard admin untuk link lengkapnya.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply(`💛 Dukung server ini: ${env.publicBaseUrl}/donate/${interaction.guildId}`);
  } catch (err) {
    logError("donate command failed:", err);
    await interaction.reply({ content: "Couldn't fetch the donation link.", flags: MessageFlags.Ephemeral });
  }
}
