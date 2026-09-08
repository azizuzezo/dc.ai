import { SlashCommandBuilder } from "discord.js";
import { env } from "../config/env.js";
import * as db from "../services/db.js";
import { isValidTargetUrl } from "../services/targetUrl.js";
import { getRunningScan, startScan } from "../services/strixScan.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("scan")
  .setDescription("Run a Strix pentest scan against a URL you're authorized to test")
  .addStringOption((opt) => opt.setName("target").setDescription("URL to scan").setRequired(true))
  .addStringOption((opt) =>
    opt
      .setName("mode")
      .setDescription("Scan depth")
      .setRequired(true)
      .addChoices({ name: "Quick", value: "quick" }, { name: "Standard", value: "standard" }, { name: "Deep", value: "deep" })
  );

async function isAuthorized(userId) {
  if (env.ownerDiscordId && userId === env.ownerDiscordId) return true;
  try {
    return await db.isApprovedScanOperator(userId);
  } catch (err) {
    logError("Failed to check scan operator allowlist:", err);
    return false;
  }
}

export async function execute(interaction) {
  if (!(await isAuthorized(interaction.user.id))) {
    await interaction.reply({ content: "You're not authorized to use this command.", ephemeral: true });
    return;
  }

  const target = interaction.options.getString("target", true);
  const mode = interaction.options.getString("mode", true);

  if (!isValidTargetUrl(target)) {
    await interaction.reply({ content: "That doesn't look like a valid http(s) URL.", ephemeral: true });
    return;
  }

  const running = getRunningScan();
  if (running) {
    await interaction.reply({
      content: `A scan is already running (target: ${running.target}, mode: ${running.mode}). Try again once it finishes.`,
      ephemeral: true,
    });
    return;
  }

  try {
    startScan({ target, mode, channel: interaction.channel, requestedBy: interaction.user.id });
    await interaction.reply(`Scan started: \`${target}\` (mode: ${mode}). I'll post results here when it's done.`);
  } catch (err) {
    logError("Failed to start scan:", err);
    await interaction.reply({ content: "Something went wrong starting that scan.", ephemeral: true });
  }
}
