import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import * as db from "../services/db.js";
import { layout } from "./layout.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const commandsDir = join(__dirname, "..", "commands");

/** Scans src/commands/ live (mirrors scripts/register-commands.mjs) so this list can't drift. */
async function listCommandNames() {
  const names = [];
  for (const file of readdirSync(commandsDir).filter((f) => f.endsWith(".js"))) {
    const mod = await import(pathToFileURL(join(commandsDir, file)).href);
    if (mod.data?.name) names.push(mod.data.name);
  }
  return names.sort();
}

export async function handleFeaturesPage(req, res) {
  const { guildId } = req.params;
  const [allNames, disabled] = await Promise.all([listCommandNames(), db.getDisabledCommands(guildId)]);

  const rows = allNames
    .map((name) => {
      const isDisabled = disabled.includes(name);
      return `<label style="display:block"><input type="checkbox" name="enabled" value="${name}" ${isDisabled ? "" : "checked"} /> /${name}</label>`;
    })
    .join("");

  res.send(
    layout(`
      <h2>Features — ${guildId}</h2>
      <p>Uncheck a command to disable it in this server.</p>
      <form method="post" action="/guilds/${guildId}/features">
        ${rows}
        <br/><button type="submit">Save</button>
      </form>
      <p><a href="/guilds">Back to guilds</a></p>
    `)
  );
}

export async function handleFeaturesUpdate(req, res) {
  const { guildId } = req.params;
  const allNames = await listCommandNames();
  const enabled = [].concat(req.body.enabled || []);
  const disabled = allNames.filter((name) => !enabled.includes(name));
  await db.setDisabledCommands(guildId, disabled);
  res.redirect(`/guilds/${guildId}/features`);
}
