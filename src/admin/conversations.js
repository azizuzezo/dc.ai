import * as db from "../services/db.js";
import { layout, guildTabs, crumbs } from "./layout.js";
import { escapeHtml } from "./htmlEscape.js";

export async function handleConversationsPage(req, res) {
  const { guildId } = req.params;
  const channels = await db.listConversationChannels(guildId);

  const rows = channels
    .sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at))
    .map(
      (c) => `<tr>
        <td class="mono">${escapeHtml(c.channel_id)}</td>
        <td>${c.message_count}</td>
        <td>${new Date(c.last_message_at).toLocaleString()}</td>
        <td><a class="btn btn-sm" href="/guilds/${guildId}/conversations/${c.channel_id}">View</a></td>
      </tr>`
    )
    .join("");

  res.send(
    layout(
      `
      ${crumbs(guildId)}
      <h1>Conversations</h1>
      ${guildTabs(guildId, "conversations")}
      ${
        channels.length
          ? `<table><tr><th>Channel ID</th><th>Messages</th><th>Last Activity</th><th></th></tr>${rows}</table>`
          : `<div class="empty">No AI conversations recorded yet.</div>`
      }
    `,
      { active: "guilds" }
    )
  );
}

export async function handleConversationDetailPage(req, res) {
  const { guildId, channelId } = req.params;
  const messages = await db.getConversationMessages(channelId, 100);

  const lines = messages
    .map(
      (m) => `<div class="card" style="margin-bottom:10px">
        <span class="badge ${m.role === "assistant" ? "badge-on" : "badge-off"}">${escapeHtml(m.role)}</span>
        <span class="hint" style="margin-left:8px">${new Date(m.created_at).toLocaleString()}</span>
        <p style="margin:10px 0 0;white-space:pre-wrap">${escapeHtml(m.content)}</p>
      </div>`
    )
    .join("");

  res.send(
    layout(
      `
      ${crumbs(guildId)}
      <p class="crumbs"><a href="/guilds/${guildId}/conversations">Conversations</a> / <span class="mono">${escapeHtml(channelId)}</span></p>
      <h1>Conversation</h1>
      ${lines || `<div class="empty">No messages found.</div>`}
    `,
      { active: "guilds" }
    )
  );
}
