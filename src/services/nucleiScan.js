import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import { env } from "../config/env.js";
import { logInfo, logError } from "./logger.js";
import { parseNucleiOutput } from "./nucleiParser.js";

// Separate concurrency slot from Strix — nuclei scans are fast (seconds to a
// couple minutes) and shouldn't be blocked by a long-running Strix scan
// elsewhere, or vice versa.
let state = null; // { target, startedAt, channelId, requestedBy }

export function getRunningScan() {
  return state;
}

export function startScan({ target, channel, requestedBy }) {
  if (state) {
    throw new Error("A scan is already running");
  }

  state = { target, startedAt: Date.now(), channelId: channel.id, requestedBy };
  logInfo(`Starting DC.Security (nuclei) scan: target=${target} requestedBy=${requestedBy}`);

  // -duc: templates are baked into the Docker image at build time (see
  // Dockerfile), so skip the per-scan update check — that check alone was
  // adding noticeable latency to every single /scan invocation.
  const child = spawn("nuclei", ["-target", target, "-jsonl", "-silent", "-rate-limit", "30", "-duc"]);

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const timeout = setTimeout(() => {
    logError(`Nuclei scan for ${target} exceeded ${env.strixScanTimeoutMs}ms timeout, killing`);
    child.kill("SIGKILL");
  }, env.strixScanTimeoutMs);
  timeout.unref?.();

  child.on("close", async (code) => {
    clearTimeout(timeout);
    if (!state) return; // "error" already handled this run — see strixScan.js for why
    const finished = state;
    state = null;
    try {
      await postResults({ channel, target, startedAt: finished.startedAt, code, output });
    } catch (err) {
      logError("Failed to post nuclei scan results:", err);
    }
  });

  child.on("error", (err) => {
    clearTimeout(timeout);
    state = null;
    logError("Failed to spawn nuclei:", err);
    channel.send("DC.Security scan failed to start. Check the bot's server logs for details.").catch(() => {});
  });

  return true;
}

async function postResults({ channel, target, startedAt, code, output }) {
  const durationSec = Math.round((Date.now() - startedAt) / 1000);
  const { counts } = parseNucleiOutput(output);

  const logPath = join(process.cwd(), "strix_runs", `nuclei-scan-${Date.now()}.log`);
  try {
    await writeFile(logPath, output, "utf8");
  } catch (err) {
    logError("Failed to write nuclei scan log:", err);
  }

  const embed = new EmbedBuilder()
    .setTitle("DC.Security scan complete (Nuclei)")
    .addFields(
      { name: "Target", value: target },
      { name: "Duration", value: `${durationSec}s`, inline: true },
      { name: "Exit code", value: String(code), inline: true },
      {
        name: "Findings",
        value: `Critical: ${counts.critical} · High: ${counts.high} · Medium: ${counts.medium} · Low: ${counts.low} · Info: ${counts.info} (${counts.total} total)`,
      }
    );

  const files = existsSync(logPath) ? [new AttachmentBuilder(logPath, { name: "nuclei.log" })] : [];

  await channel.send({ embeds: [embed], files });
}
