import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import { env } from "../config/env.js";
import { logInfo, logError } from "./logger.js";
import { parseSarifSummary } from "./sarifSummary.js";

const RUN_DIR_PATTERN = /Output\s+(strix_runs\/\S+)/;

// The Strix installer only adds ~/.strix/bin to PATH via ~/.bashrc, which a
// process started as a service (not an interactive login shell) never
// sources — spawn would otherwise fail with ENOENT even though `strix`
// works fine from a terminal.
const STRIX_BIN_DIR = join(homedir(), ".strix", "bin");

let state = null; // { target, mode, startedAt, channelId, requestedBy }

export function getRunningScan() {
  return state;
}

export function startScan({ target, mode, channel, requestedBy }) {
  if (state) {
    throw new Error("A scan is already running");
  }

  state = { target, mode, startedAt: Date.now(), channelId: channel.id, requestedBy };
  logInfo(`Starting Strix scan: target=${target} mode=${mode} requestedBy=${requestedBy}`);

  const child = spawn(
    "strix",
    ["-n", "-t", target, "-m", mode, "--max-budget", String(env.strixMaxBudgetUsd), "--max-turns", String(env.strixMaxTurns)],
    {
      env: {
        ...process.env,
        PATH: `${STRIX_BIN_DIR}:${process.env.PATH || ""}`,
        STRIX_LLM: env.strixLlmModel,
        LLM_API_KEY: env.strixGeminiApiKey,
      },
    }
  );

  let output = "";
  let runDir = null;

  const captureChunk = (chunk) => {
    const text = chunk.toString();
    output += text;
    if (!runDir) {
      const match = RUN_DIR_PATTERN.exec(text);
      if (match) runDir = match[1];
    }
  };
  child.stdout.on("data", captureChunk);
  child.stderr.on("data", captureChunk);

  const timeout = setTimeout(() => {
    logError(`Scan for ${target} exceeded ${env.strixScanTimeoutMs}ms timeout, killing`);
    child.kill("SIGKILL");
  }, env.strixScanTimeoutMs);
  timeout.unref?.();

  child.on("close", async (code) => {
    clearTimeout(timeout);
    const finished = state;
    state = null;
    try {
      await postResults({ channel, target, mode, startedAt: finished.startedAt, code, output, runDir });
    } catch (err) {
      logError("Failed to post scan results:", err);
    }
  });

  child.on("error", (err) => {
    clearTimeout(timeout);
    state = null;
    logError("Failed to spawn strix:", err);
    channel.send(`Scan failed to start: ${err.message}`).catch(() => {});
  });

  return true;
}

async function postResults({ channel, target, mode, startedAt, code, output, runDir }) {
  const durationSec = Math.round((Date.now() - startedAt) / 1000);

  let summary = null;
  let sarifPath = null;
  if (runDir) {
    sarifPath = join(process.cwd(), runDir, "findings.sarif");
    if (existsSync(sarifPath)) {
      try {
        const raw = await readFile(sarifPath, "utf8");
        summary = parseSarifSummary(JSON.parse(raw));
      } catch (err) {
        logError("Failed to parse findings.sarif:", err);
        sarifPath = null;
      }
    } else {
      sarifPath = null;
    }
  }

  const logPath = join(process.cwd(), runDir || "strix_runs", runDir ? "scan.log" : `scan-${Date.now()}.log`);
  try {
    await writeFile(logPath, output, "utf8");
  } catch (err) {
    logError("Failed to write scan log:", err);
  }

  const embed = new EmbedBuilder()
    .setTitle("Strix scan complete")
    .addFields(
      { name: "Target", value: target },
      { name: "Mode", value: mode, inline: true },
      { name: "Duration", value: `${durationSec}s`, inline: true },
      { name: "Exit code", value: String(code), inline: true },
      {
        name: "Findings",
        value: summary
          ? `Critical: ${summary.error} · Warning: ${summary.warning} · Info: ${summary.note} (${summary.total} total)`
          : "No findings report available (scan may have failed or timed out before producing results).",
      }
    );

  const files = [];
  if (sarifPath) files.push(new AttachmentBuilder(sarifPath, { name: "findings.sarif" }));
  if (existsSync(logPath)) files.push(new AttachmentBuilder(logPath, { name: "scan.log" }));

  await channel.send({ embeds: [embed], files });
}
