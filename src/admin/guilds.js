import * as db from "../services/db.js";
import { layout } from "./layout.js";
import { escapeHtml } from "./htmlEscape.js";

export async function handleGuildsPage(req, res) {
  const guilds = await db.listGuilds();

  const rows = guilds
    .map(
      (g) => `<tr>
        <td>${escapeHtml(g.guild_name || "(unknown)")}</td>
        <td class="mono">${escapeHtml(g.guild_id)}</td>
        <td>
          <a class="btn btn-sm" href="/guilds/${g.guild_id}/features">Features</a>
          <a class="btn btn-sm" href="/guilds/${g.guild_id}/allowlist">Allowlist</a>
          <a class="btn btn-sm" href="/guilds/${g.guild_id}/knowledge">Knowledge</a>
          <a class="btn btn-sm" href="/guilds/${g.guild_id}/conversations">Conversations</a>
          <a class="btn btn-sm" href="/guilds/${g.guild_id}/donations">Donations</a>
        </td>
      </tr>`
    )
    .join("");

  res.send(
    layout(
      `
      <h1>Guilds</h1>
      <p class="lede">Every Discord server this bot is a member of. Pick one to manage its features, knowledge base, and donation settings.</p>
      ${
        guilds.length
          ? `<table><tr><th>Name</th><th>ID</th><th></th></tr>${rows}</table>`
          : `<div class="empty">No guilds yet, invite the bot to a Discord server first.</div>`
      }
    `,
      { active: "guilds" }
    )
  );
}
