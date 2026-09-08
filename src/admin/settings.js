import * as db from "../services/db.js";
import { env } from "../config/env.js";
import { layout } from "./layout.js";

export async function handleSettingsPage(req, res) {
  const current = await db.getGlobalAiSettings();
  res.send(
    layout(`
      <h2>Global AI Settings</h2>
      <p>Leave a field blank to fall back to the .env default.</p>
      <form method="post" action="/settings">
        <label>Model (env default: ${env.aiModel})<br/>
          <input name="model" value="${current.model || ""}" /></label><br/><br/>
        <label>Base URL (env default: ${env.aiBaseUrl || "(unset)"})<br/>
          <input name="baseUrl" value="${current.baseUrl || ""}" size="50" /></label><br/><br/>
        <label>API Key override<br/>
          <input name="apiKey" value="${current.apiKey || ""}" size="50" /></label><br/><br/>
        <button type="submit">Save</button>
      </form>
    `)
  );
}

export async function handleSettingsUpdate(req, res) {
  const { model, baseUrl, apiKey } = req.body;
  await db.setGlobalAiSettings({
    model: model || null,
    baseUrl: baseUrl || null,
    apiKey: apiKey || null,
  });
  res.redirect("/settings");
}
