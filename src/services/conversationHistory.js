import { env } from "../config/env.js";
import * as db from "./db.js";

// Cache-aside: per-user history kept in memory once loaded, so repeated turns
// with the same person don't re-fetch from Supabase every time. Keyed by
// person, not channel — a busy shared channel would otherwise push someone's
// own context out of a channel-wide window within a few other people's
// messages. channel_id is still saved on every row (see recordTurn) purely
// for the admin "Conversations" transcript viewer, which is unrelated to
// what the AI actually uses as its own memory.
const cache = new Map(); // `${guildId}:${userId}` -> [{ role, content }]

/** Pure function, unit-testable without touching db.js/Supabase. */
export function trimToLimit(history, limitTurns) {
  if (!limitTurns || limitTurns <= 0) return [];
  const maxEntries = limitTurns * 2; // N user+assistant pairs
  return history.length > maxEntries ? history.slice(-maxEntries) : history;
}

export async function loadHistory(guildId, userId) {
  const key = `${guildId}:${userId}`;
  if (cache.has(key)) return cache.get(key);
  const rows = await db.fetchHistoryForUser(guildId, userId, env.aiHistoryLimit);
  const history = rows.map((row) => ({ role: row.role, content: row.content }));
  cache.set(key, history);
  return history;
}

export async function recordTurn(channelId, guildId, userId, userContent, assistantContent) {
  const key = `${guildId}:${userId}`;
  const history = await loadHistory(guildId, userId);
  history.push({ role: "user", content: userContent });
  history.push({ role: "assistant", content: assistantContent });
  const trimmed = trimToLimit(history, env.aiHistoryLimit);
  cache.set(key, trimmed);

  await db.saveHistoryTurn(channelId, guildId, userId, "user", userContent);
  await db.saveHistoryTurn(channelId, guildId, userId, "assistant", assistantContent);
  await db.trimHistoryForUser(guildId, userId, env.aiHistoryLimit);
  // Also bounds the per-channel rows the admin "Conversations" viewer reads —
  // otherwise dropping the old channel-based AI context path would leave that
  // table growing unbounded per channel instead of just per person.
  await db.trimHistory(channelId, env.aiHistoryLimit);
}
