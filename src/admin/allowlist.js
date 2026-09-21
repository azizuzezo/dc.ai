import * as db from "../services/db.js";
import { layout, guildTabs, crumbs } from "./layout.js";
import { escapeHtml } from "./htmlEscape.js";

export async function handleAllowlistPage(req, res) {
  const { guildId } = req.params;
  const allowed = await db.getAllowlist(guildId);

  res.send(
    layout(
      `
      ${crumbs(guildId)}
      <h1>Channel Allowlist</h1>
      ${guildTabs(guildId, "allowlist")}
      <p class="lede">Comma-separated channel IDs. Leave empty to allow all channels.</p>
      <form class="card" method="post" action="/guilds/${guildId}/allowlist">
        <label for="channelIds">Channel IDs</label>
        <textarea id="channelIds" name="channelIds" rows="5">${escapeHtml(allowed.join(", "))}</textarea>
        <div class="actions"><button type="submit" class="btn-primary">Save</button></div>
      </form>
    `,
      { active: "guilds" }
    )
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
