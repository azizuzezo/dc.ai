import * as db from "../services/db.js";
import { layout } from "./layout.js";

export async function handleKnowledgePage(req, res) {
  const { guildId } = req.params;
  const entries = await db.listKnowledge(guildId);
  const rows = entries
    .map(
      (e) => `<tr>
        <td>${e.title}</td>
        <td>${e.content.length > 80 ? `${e.content.slice(0, 80)}…` : e.content}</td>
        <td><form method="post" action="/guilds/${guildId}/knowledge/${e.id}/delete">
          <button type="submit">Delete</button></form></td>
      </tr>`
    )
    .join("");

  res.send(
    layout(`
      <h2>Knowledge Base — ${guildId}</h2>
      <p>Every entry here is added verbatim to the AI's system prompt for this server (no retrieval —
        keep this small and curated, like an FAQ).</p>
      <table border="1" cellpadding="6"><tr><th>Title</th><th>Content</th><th></th></tr>${rows}</table>
      <h3>Add entry</h3>
      <form method="post" action="/guilds/${guildId}/knowledge">
        <input name="title" placeholder="Title" required /><br/><br/>
        <textarea name="content" rows="6" cols="50" placeholder="Content" required></textarea><br/><br/>
        <button type="submit">Add</button>
      </form>
      <p><a href="/guilds">Back to guilds</a></p>
    `)
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
