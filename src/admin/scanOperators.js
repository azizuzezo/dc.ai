import * as db from "../services/db.js";
import { env } from "../config/env.js";
import { layout } from "./layout.js";

export async function handleScanOperatorsPage(req, res) {
  const operators = await db.listScanOperators();
  const rows = operators
    .map(
      (o) => `<tr>
        <td>${o.discord_user_id}</td>
        <td>${o.added_by || ""}</td>
        <td>${new Date(o.created_at).toLocaleString()}</td>
        <td><form method="post" action="/scan-operators/${o.discord_user_id}/delete">
          <button type="submit">Remove</button></form></td>
      </tr>`
    )
    .join("");

  res.send(
    layout(`
      <h2>Scan Operators</h2>
      <p>Discord user IDs allowed to run /scan, in addition to the bot owner (OWNER_DISCORD_ID).
        Global — applies across every guild the bot is in.</p>
      <table border="1" cellpadding="6"><tr><th>Discord User ID</th><th>Added by</th><th>Added</th><th></th></tr>${rows}</table>
      <h3>Add operator</h3>
      <form method="post" action="/scan-operators">
        <input name="discordUserId" placeholder="Discord User ID" required /><br/><br/>
        <button type="submit">Add</button>
      </form>
    `)
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
