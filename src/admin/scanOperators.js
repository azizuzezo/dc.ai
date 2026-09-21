import * as db from "../services/db.js";
import { env } from "../config/env.js";
import { layout } from "./layout.js";
import { escapeHtml } from "./htmlEscape.js";

export async function handleScanOperatorsPage(req, res) {
  const operators = await db.listScanOperators();

  const rows = operators
    .map(
      (o) => `<tr>
        <td class="mono">${escapeHtml(o.discord_user_id)}</td>
        <td>${escapeHtml(o.added_by || "")}</td>
        <td>${new Date(o.created_at).toLocaleString()}</td>
        <td><form method="post" action="/scan-operators/${o.discord_user_id}/delete">
          <button type="submit" class="btn-danger btn-sm">Remove</button></form></td>
      </tr>`
    )
    .join("");

  res.send(
    layout(
      `
      <h1>Scan Operators</h1>
      <p class="lede">Discord user IDs allowed to run <code>/scan</code>, in addition to the bot owner
        (<code>OWNER_DISCORD_ID</code>). Global, applies across every guild the bot is in.</p>

      ${
        operators.length
          ? `<table><tr><th>Discord User ID</th><th>Added by</th><th>Added</th><th></th></tr>${rows}</table>`
          : `<div class="empty">No extra operators, only the bot owner can run /scan right now.</div>`
      }

      <h2>Add operator</h2>
      <form class="card" method="post" action="/scan-operators">
        <label for="discordUserId">Discord User ID</label>
        <input id="discordUserId" name="discordUserId" required />
        <div class="actions"><button type="submit" class="btn-primary">Add</button></div>
      </form>
    `,
      { active: "scan-operators" }
    )
  );
}

export async function handleScanOperatorsAdd(req, res) {
  const { discordUserId } = req.body;
  if (discordUserId) {
    await db.addScanOperator(discordUserId.trim(), env.adminUsername || "admin");
  }
  res.redirect("/scan-operators");
}

export async function handleScanOperatorsDelete(req, res) {
  const { discordUserId } = req.params;
  await db.removeScanOperator(discordUserId);
  res.redirect("/scan-operators");
}
