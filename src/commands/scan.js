import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { env } from "../config/env.js";
import * as db from "../services/db.js";
import { isValidTargetUrl } from "../services/targetUrl.js";
import { getRunningScan, startScan } from "../services/nucleiScan.js";
import { logError } from "../services/logger.js";

// Strix (autonomous AI agent) is temporarily off — it needs Docker, which
// only this local dev machine has. src/services/strixScan.js is untouched
// and ready to be wired back in here once a VPS with Docker is available.

export const data = new SlashCommandBuilder()
  .setName("scan")
  .setDescription("Run a DC.Security pentest scan (Nuclei) against a URL you're authorized to test")
  .addStringOption((opt) => opt.setName("target").setDescription("URL to scan").setRequired(true));

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
    await interaction.reply({ content: "You're not authorized to use this command.", flags: MessageFlags.Ephemeral });
    return;
  }

  const target = interaction.options.getString("target", true);

  if (!isValidTargetUrl(target)) {
    await interaction.reply({ content: "That doesn't look like a valid http(s) URL.", flags: MessageFlags.Ephemeral });
    return;
  }

  const running = getRunningScan();
  if (running) {
    await interaction.reply({
      content: `A scan is already running (target: ${running.target}). Try again once it finishes.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    startScan({ target, channel: interaction.channel, requestedBy: interaction.user.id });
    await interaction.reply(`Scan started: \`${target}\`. I'll post results here when it's done.`);
  } catch (err) {
    logError("Failed to start scan:", err);
    await interaction.reply({ content: "Something went wrong starting that scan.", flags: MessageFlags.Ephemeral });
  }
}
