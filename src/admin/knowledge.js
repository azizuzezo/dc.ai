import * as db from "../services/db.js";
import { layout, guildTabs, crumbs } from "./layout.js";
import { escapeHtml } from "./htmlEscape.js";

export async function handleKnowledgePage(req, res) {
  const { guildId } = req.params;
  const entries = await db.listKnowledge(guildId);

  const rows = entries
    .map((e) => {
      const preview = e.content.length > 80 ? `${e.content.slice(0, 80)}…` : e.content;
      return `<tr>
        <td>${escapeHtml(e.title)}</td>
        <td>${escapeHtml(preview)}</td>
        <td><form method="post" action="/guilds/${guildId}/knowledge/${e.id}/delete">
          <button type="submit" class="btn-danger btn-sm">Delete</button></form></td>
      </tr>`;
    })
    .join("");

  res.send(
    layout(
      `
      ${crumbs(guildId)}
      <h1>Knowledge Base</h1>
      ${guildTabs(guildId, "knowledge")}
      <p class="lede">Every entry here is added verbatim to the AI's system prompt for this server (no
        retrieval, keep this small and curated, like an FAQ).</p>

      ${
        entries.length
          ? `<table><tr><th>Title</th><th>Content</th><th></th></tr>${rows}</table>`
          : `<div class="empty">No knowledge entries yet.</div>`
      }

      <h2>Add entry</h2>
      <form class="card" method="post" action="/guilds/${guildId}/knowledge">
        <label for="title">Title</label>
        <input id="title" name="title" required />
        <label for="content">Content</label>
        <textarea id="content" name="content" rows="5" required></textarea>
        <div class="actions"><button type="submit" class="btn-primary">Add</button></div>
      </form>
    `,
      { active: "guilds" }
    )
  );
}

export async function handleKnowledgeAdd(req, res) {
  const { guildId } = req.params;
  const { title, content } = req.body;
  if (title && content) {
    await db.addKnowledge(guildId, title, content);
  }
  res.redirect(`/guilds/${guildId}/knowledge`);
}

export async function handleKnowledgeDelete(req, res) {
  const { guildId, id } = req.params;
  await db.deleteKnowledge(guildId, Number(id));
  res.redirect(`/guilds/${guildId}/knowledge`);
}
