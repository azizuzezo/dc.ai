import * as db from "../services/db.js";
import { layout } from "./layout.js";

export async function handleGuildsPage(req, res) {
  const guilds = await db.listGuilds();
  const rows = guilds
    .map(
      (g) => `<tr><td>${g.guild_name || "(unknown)"}</td><td>${g.guild_id}</td><td>
        <a href="/guilds/${g.guild_id}/allowlist">Allowlist</a> |
        <a href="/guilds/${g.guild_id}/features">Features</a> |
        <a href="/guilds/${g.guild_id}/knowledge">Knowledge</a> |
        <a href="/guilds/${g.guild_id}/conversations">Conversations</a>
      </td></tr>`
    )
    .join("");
  res.send(
    layout(`
      <h2>Guilds</h2>
      <table border="1" cellpadding="6"><tr><th>Name</th><th>ID</th><th></th></tr>${rows}</table>
    `)
  );
}
