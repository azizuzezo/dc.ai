import { env } from "../config/env.js";
import * as db from "./db.js";

// Cache-aside: per-channel history kept in memory once loaded, so repeated
// turns in the same channel don't re-fetch from Supabase every time.
const cache = new Map(); // channelId -> [{ role, content }]

/** Pure function, unit-testable without touching db.js/Supabase. */
export function trimToLimit(history, limitTurns) {
  if (!limitTurns || limitTurns <= 0) return [];
  const maxEntries = limitTurns * 2; // N user+assistant pairs
  return history.length > maxEntries ? history.slice(-maxEntries) : history;
}

export async function loadHistory(channelId) {
  if (cache.has(channelId)) return cache.get(channelId);
  const rows = await db.fetchHistory(channelId, env.aiHistoryLimit);
  const history = rows.map((row) => ({ role: row.role, content: row.content }));
  cache.set(channelId, history);
  return history;
}

export async function recordTurn(channelId, guildId, userContent, assistantContent) {
  const history = await loadHistory(channelId);
  history.push({ role: "user", content: userContent });
  history.push({ role: "assistant", content: assistantContent });
  const trimmed = trimToLimit(history, env.aiHistoryLimit);
  cache.set(channelId, trimmed);

  await db.saveHistoryTurn(channelId, guildId, "user", userContent);
  await db.saveHistoryTurn(channelId, guildId, "assistant", assistantContent);
  await db.trimHistory(channelId, env.aiHistoryLimit);
}

export async function buildMessages(channelId, systemPrompt, newUserContent) {
  const history = await loadHistory(channelId);
  return [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: newUserContent }];
}
