import * as db from "../services/db.js";
import { env } from "../config/env.js";
import { layout } from "./layout.js";
import { escapeHtml } from "./htmlEscape.js";

export async function handleSettingsPage(req, res) {
  const current = await db.getGlobalAiSettings();
  res.send(
    layout(
      `
      <h1>Global AI Settings</h1>
      <p class="lede">Overrides the .env defaults for every guild. Leave a field blank to fall back to it.</p>
      <form class="card" method="post" action="/settings">
        <label for="model">Model</label>
        <input id="model" name="model" value="${escapeHtml(current.model || "")}" placeholder="${escapeHtml(env.aiModel)}" />
        <p class="hint">env default: <code>${escapeHtml(env.aiModel)}</code></p>

        <label for="baseUrl">Base URL</label>
        <input id="baseUrl" name="baseUrl" value="${escapeHtml(current.baseUrl || "")}" />
        <p class="hint">env default: <code>${escapeHtml(env.aiBaseUrl || "(unset)")}</code></p>

        <label for="apiKey">API Key override</label>
        <input id="apiKey" name="apiKey" value="${escapeHtml(current.apiKey || "")}" />

        <div class="actions"><button type="submit" class="btn-primary">Save</button></div>
      </form>
    `,
      { active: "settings" }
    )
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
