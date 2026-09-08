import "dotenv/config";
import { Client, GatewayIntentBits, Collection } from "discord.js";
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { env, assertRequiredEnv } from "./config/env.js";
import { forceIpv4Fetch } from "./config/network.js";
import { logError } from "./services/logger.js";
import { startAdminServer } from "./admin/server.js";

assertRequiredEnv();
forceIpv4Fetch();

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

async function loadCommands() {
  const dir = join(__dirname, "commands");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    if (mod.data && mod.execute) {
      client.commands.set(mod.data.name, mod);
    } else {
      logError(`Command file ${file} is missing data/execute export`);
    }
  }
}

async function loadEvents() {
  const dir = join(__dirname, "events");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
    const mod = await import(pathToFileURL(join(dir, file)).href);
    const name = file.replace(/\.js$/, "");
    if (mod.once) {
      client.once(name, (...args) => mod.execute(...args, client));
    } else {
      client.on(name, (...args) => mod.execute(...args, client));
    }
  }
}

async function main() {
  await loadCommands();
  await loadEvents();
  startAdminServer();
  await client.login(env.discordToken);
}

main().catch((err) => {
  logError("Fatal error during startup:", err);
  process.exit(1);
});
