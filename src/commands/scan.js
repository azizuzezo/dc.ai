import { SlashCommandBuilder } from "discord.js";
import { env } from "../config/env.js";
import * as db from "../services/db.js";
import { isValidTargetUrl } from "../services/targetUrl.js";
import { getRunningScan as getRunningStrixScan, startScan as startStrixScan } from "../services/strixScan.js";
import { getRunningScan as getRunningNucleiScan, startScan as startNucleiScan } from "../services/nucleiScan.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("scan")
  .setDescription("Run a DC.Security pentest scan against a URL you're authorized to test")
  .addStringOption((opt) => opt.setName("target").setDescription("URL to scan").setRequired(true))
  .addStringOption((opt) =>
    opt
      .setName("engine")
      .setDescription("Scan engine")
      .setRequired(true)
      .addChoices(
        { name: "Nuclei (template-based, runs anywhere)", value: "nuclei" },
        { name: "Strix (autonomous AI agent, needs Docker — local machine only)", value: "strix" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("mode")
      .setDescription("Scan depth (Strix only — ignored for Nuclei)")
      .setRequired(false)
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
  const engine = interaction.options.getString("engine", true);
  const mode = interaction.options.getString("mode") || "quick";

  if (!isValidTargetUrl(target)) {
    await interaction.reply({ content: "That doesn't look like a valid http(s) URL.", ephemeral: true });
    return;
  }

  const getRunningScan = engine === "strix" ? getRunningStrixScan : getRunningNucleiScan;
  const startScan = engine === "strix" ? startStrixScan : startNucleiScan;

  const running = getRunningScan();
  if (running) {
    await interaction.reply({
      content: `A ${engine} scan is already running (target: ${running.target}). Try again once it finishes.`,
      ephemeral: true,
    });
    return;
  }

  try {
    startScan({ target, mode, channel: interaction.channel, requestedBy: interaction.user.id });
    await interaction.reply(`Scan started: \`${target}\` (engine: ${engine}). I'll post results here when it's done.`);
  } catch (err) {
    logError("Failed to start scan:", err);
    await interaction.reply({ content: "Something went wrong starting that scan.", ephemeral: true });
  }
}
