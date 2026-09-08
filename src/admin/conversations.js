import * as db from "../services/db.js";
import { layout } from "./layout.js";

export async function handleConversationsPage(req, res) {
  const { guildId } = req.params;
  const channels = await db.listConversationChannels(guildId);
  const rows = channels
    .sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at))
    .map(
      (c) => `<tr>
        <td>${c.channel_id}</td>
        <td>${c.message_count}</td>
        <td>${new Date(c.last_message_at).toLocaleString()}</td>
        <td><a href="/guilds/${guildId}/conversations/${c.channel_id}">View</a></td>
      </tr>`
    )
    .join("");

  res.send(
    layout(`
      <h2>Conversations — ${guildId}</h2>
      <table border="1" cellpadding="6">
        <tr><th>Channel ID</th><th>Messages</th><th>Last Activity</th><th></th></tr>
        ${rows}
      </table>
      <p><a href="/guilds">Back to guilds</a></p>
    `)
  );
}

export async function handleConversationDetailPage(req, res) {
  const { guildId, channelId } = req.params;
  const messages = await db.getConversationMessages(channelId, 100);
  const lines = messages
    .map((m) => `<p><strong>${m.role}</strong> (${new Date(m.created_at).toLocaleString()}):<br/>${m.content}</p>`)
    .join("");

  res.send(
    layout(`
      <h2>Conversation — channel ${channelId}</h2>
      ${lines || "<p>No messages found.</p>"}
      <p><a href="/guilds/${guildId}/conversations">Back to conversations</a></p>
    `)
  );
}
