// Runs on YOUR OWN computer only — never deploy this to Railway.
// Unlike the bot, Discord Rich Presence talks to the Discord *desktop app*
// over a local IPC socket, so it only works while both this script and
// Discord desktop are running on the same machine. See docs/rich-presence.md
// for setup (art assets, etc).
import "dotenv/config";
import { Client } from "@xhayper/discord-rpc";
import { env } from "../src/config/env.js";

const PRESETS = {
  dzikir: {
    details: "📿 Sedang berdzikir",
    state: "Jangan diganggu dulu ya",
    largeImageKey: "dzikir",
    largeImageText: "Dzikir",
  },
  shalat: {
    details: "🕌 Sedang shalat",
    state: "Jangan diganggu dulu ya",
    largeImageKey: "shalat",
    largeImageText: "Shalat",
  },
};

function parseArgs(argv) {
  const [preset, ...rest] = argv;
  const activity = { startTimestamp: new Date() };

  if (preset && preset !== "custom") {
    if (!PRESETS[preset]) {
      console.error(`Unknown preset "${preset}". Available: ${Object.keys(PRESETS).join(", ")}, custom`);
      process.exit(1);
    }
    Object.assign(activity, PRESETS[preset]);
    return activity;
  }

  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i]?.replace(/^--/, "");
    const value = rest[i + 1];
    if (!flag || value === undefined) continue;
    if (flag === "details") activity.details = value;
    if (flag === "state") activity.state = value;
    if (flag === "image") activity.largeImageKey = value;
    if (flag === "imageText") activity.largeImageText = value;
  }
  if (!activity.details) {
    console.error(
      'Usage: node scripts/rich-presence.mjs <dzikir|shalat> OR custom --details "..." --state "..." [--image key] [--imageText "..."]'
    );
    process.exit(1);
  }
  return activity;
}

const activity = parseArgs(process.argv.slice(2));

if (!env.richPresenceClientId) {
  console.error("Missing RICH_PRESENCE_CLIENT_ID (or DISCORD_CLIENT_ID) in .env");
  process.exit(1);
}

const client = new Client({ clientId: env.richPresenceClientId });

client.on("ready", async () => {
  await client.user?.setActivity(activity);
  console.log(`Presence set: ${activity.details}${activity.state ? " — " + activity.state : ""}`);
  console.log("Leave this running. Press Ctrl+C to clear the presence and exit.");
});

async function shutdown() {
  try {
    await client.user?.clearActivity();
  } catch {
    // Discord may already be closed — nothing to clean up.
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

client.login().catch((err) => {
  console.error("Failed to connect to Discord desktop app. Is Discord running?", err.message);
  process.exit(1);
});
