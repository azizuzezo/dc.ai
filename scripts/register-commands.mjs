import "dotenv/config";
import { REST, Routes } from "discord.js";
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { env, assertRequiredEnv } from "../src/config/env.js";

assertRequiredEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const commandsDir = join(__dirname, "..", "src", "commands");

const commands = [];
for (const file of readdirSync(commandsDir).filter((f) => f.endsWith(".js"))) {
  const mod = await import(pathToFileURL(join(commandsDir, file)).href);
  if (mod.data) commands.push(mod.data.toJSON());
}

const rest = new REST().setToken(env.discordToken);

try {
  console.log(`Registering ${commands.length} global command(s)...`);
  await rest.put(Routes.applicationCommands(env.discordClientId), { body: commands });
  console.log("Done. Global commands can take up to an hour to propagate.");
} catch (err) {
  console.error("Failed to register commands:", err);
  process.exit(1);
}
