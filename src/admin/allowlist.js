import * as db from "../services/db.js";
import { layout } from "./layout.js";

export async function handleAllowlistPage(req, res) {
  const { guildId } = req.params;
  const allowed = await db.getAllowlist(guildId);
  res.send(
    layout(`
      <h2>Channel Allowlist — ${guildId}</h2>
      <p>Comma-separated channel IDs. Leave empty to allow all channels.</p>
      <form method="post" action="/guilds/${guildId}/allowlist">
        <textarea name="channelIds" rows="6" cols="50">${allowed.join(", ")}</textarea><br/><br/>
        <button type="submit">Save</button>
      </form>
      <p><a href="/guilds">Back to guilds</a></p>
    `)
  );
}

export async function handleAllowlistUpdate(req, res) {
  const { guildId } = req.params;
  const channelIds = (req.body.channelIds || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await db.setAllowlist(guildId, channelIds);
  res.redirect(`/guilds/${guildId}/allowlist`);
}
