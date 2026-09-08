import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { logWarn } from "./logger.js";

const supabase =
  env.supabaseUrl && env.supabaseServiceRoleKey
    ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const isPersistent = Boolean(supabase);

if (!isPersistent) {
  logWarn(
    "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — running in in-memory-only mode (no persistence across restarts)."
  );
}

// In-memory fallback stores. Callers never see which backend is active —
// every exported function below picks a branch internally.
const memHistory = new Map(); // channelId -> [{ role, content, created_at }]
const memAllowlist = new Map(); // guildId -> string[]
const memGuilds = new Map(); // guildId -> { guild_id, guild_name, updated_at }
const memWarnings = new Map(); // `${guildId}:${userId}` -> [{ moderator_id, reason, created_at }]
const memReminders = []; // [{ id, guild_id, channel_id, user_id, message, remind_at, delivered }]
const memNotes = new Map(); // guildId -> [{ id, author_id, content, created_at }]
const memDisabledCommands = new Map(); // guildId -> string[]
const memKnowledge = new Map(); // guildId -> [{ id, title, content, created_at, updated_at }]
const memScanOperators = new Map(); // discord_user_id -> { discord_user_id, added_by, created_at }
let memReminderIdSeq = 1;
let memNoteIdSeq = 1;
let memKnowledgeIdSeq = 1;
let memGlobalAiSettings = { model: null, baseUrl: null, apiKey: null };

// ---- conversation history ----

export async function fetchHistory(channelId, limit) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_conversation_history")
      .select("role, content, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(limit * 2);
    if (error) throw error;
    return (data || []).reverse();
  }
  const rows = memHistory.get(channelId) || [];
  return rows.slice(-limit * 2);
}

export async function saveHistoryTurn(channelId, guildId, role, content) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_conversation_history")
      .insert({ channel_id: channelId, guild_id: guildId, role, content });
    if (error) throw error;
    return;
  }
  const rows = memHistory.get(channelId) || [];
  rows.push({ guild_id: guildId, role, content, created_at: new Date().toISOString() });
  memHistory.set(channelId, rows);
}

export async function trimHistory(channelId, limit) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_conversation_history")
      .select("id")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const idsToDelete = (data || []).slice(limit * 2).map((row) => row.id);
    if (idsToDelete.length) {
      const { error: deleteError } = await supabase
        .from("bot_conversation_history")
        .delete()
        .in("id", idsToDelete);
      if (deleteError) throw deleteError;
    }
    return;
  }
  const rows = memHistory.get(channelId);
  if (rows && rows.length > limit * 2) {
    memHistory.set(channelId, rows.slice(-limit * 2));
  }
}

// ---- per-guild channel allowlist ----

export async function getAllowlist(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_guild_settings")
      .select("allowed_channel_ids")
      .eq("guild_id", guildId)
      .maybeSingle();
    if (error) throw error;
    return data?.allowed_channel_ids || [];
  }
  return memAllowlist.get(guildId) || [];
}

export async function setAllowlist(guildId, channelIds) {
  if (supabase) {
    const { error } = await supabase.from("bot_guild_settings").upsert({
      guild_id: guildId,
      allowed_channel_ids: channelIds,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }
  memAllowlist.set(guildId, channelIds);
}

// ---- guilds the bot has joined ----

export async function upsertGuild(guildId, guildName) {
  if (supabase) {
    const { error } = await supabase.from("bot_guild_settings").upsert({
      guild_id: guildId,
      guild_name: guildName,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }
  const existing = memGuilds.get(guildId) || {};
  memGuilds.set(guildId, {
    ...existing,
    guild_id: guildId,
    guild_name: guildName,
    updated_at: new Date().toISOString(),
  });
}

export async function listGuilds() {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_guild_settings")
      .select("guild_id, guild_name, updated_at")
      .order("guild_name");
    if (error) throw error;
    return data || [];
  }
  return Array.from(memGuilds.values());
}

// ---- global AI settings (live override, no redeploy needed) ----

export async function getGlobalAiSettings() {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_global_ai_settings")
      .select("ai_model, ai_base_url, ai_api_key")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw error;
    return {
      model: data?.ai_model || null,
      baseUrl: data?.ai_base_url || null,
      apiKey: data?.ai_api_key || null,
    };
  }
  return memGlobalAiSettings;
}

export async function setGlobalAiSettings(patch) {
  if (supabase) {
    const row = { id: "default", updated_at: new Date().toISOString() };
    if (patch.model !== undefined) row.ai_model = patch.model;
    if (patch.baseUrl !== undefined) row.ai_base_url = patch.baseUrl;
    if (patch.apiKey !== undefined) row.ai_api_key = patch.apiKey;
    const { error } = await supabase.from("bot_global_ai_settings").upsert(row);
    if (error) throw error;
    return;
  }
  memGlobalAiSettings = { ...memGlobalAiSettings, ...patch };
}

// ---- moderation warnings ----

export async function addWarning(guildId, userId, moderatorId, reason) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_user_warnings")
      .insert({ guild_id: guildId, user_id: userId, moderator_id: moderatorId, reason });
    if (error) throw error;
    return;
  }
  const key = `${guildId}:${userId}`;
  const rows = memWarnings.get(key) || [];
  rows.push({ moderator_id: moderatorId, reason, created_at: new Date().toISOString() });
  memWarnings.set(key, rows);
}

export async function listWarnings(guildId, userId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_user_warnings")
      .select("reason, moderator_id, created_at")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  return (memWarnings.get(`${guildId}:${userId}`) || []).slice().reverse();
}

// ---- reminders ----

export async function createReminder({ guildId, channelId, userId, message, remindAt }) {
  if (supabase) {
    const { error } = await supabase.from("bot_reminders").insert({
      guild_id: guildId,
      channel_id: channelId,
      user_id: userId,
      message,
      remind_at: remindAt.toISOString(),
    });
    if (error) throw error;
    return;
  }
  memReminders.push({
    id: memReminderIdSeq++,
    guild_id: guildId,
    channel_id: channelId,
    user_id: userId,
    message,
    remind_at: remindAt.toISOString(),
    delivered: false,
  });
}

export async function getDueReminders(now = new Date()) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_reminders")
      .select("id, guild_id, channel_id, user_id, message, remind_at")
      .eq("delivered", false)
      .lte("remind_at", now.toISOString())
      .limit(20);
    if (error) throw error;
    return data || [];
  }
  return memReminders.filter((r) => !r.delivered && new Date(r.remind_at) <= now).slice(0, 20);
}

export async function markReminderDelivered(id) {
  if (supabase) {
    const { error } = await supabase.from("bot_reminders").update({ delivered: true }).eq("id", id);
    if (error) throw error;
    return;
  }
  const row = memReminders.find((r) => r.id === id);
  if (row) row.delivered = true;
}

// ---- shared guild notes ----

export async function addNote(guildId, authorId, content) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_notes")
      .insert({ guild_id: guildId, author_id: authorId, content })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
  const rows = memNotes.get(guildId) || [];
  const id = memNoteIdSeq++;
  rows.push({ id, author_id: authorId, content, created_at: new Date().toISOString() });
  memNotes.set(guildId, rows);
  return id;
}

export async function listNotes(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_notes")
      .select("id, author_id, content, created_at")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  return (memNotes.get(guildId) || []).slice().reverse();
}

export async function getNote(guildId, id) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_notes")
      .select("id, author_id, content")
      .eq("guild_id", guildId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
  return (memNotes.get(guildId) || []).find((n) => n.id === id) || null;
}

export async function deleteNote(guildId, id) {
  if (supabase) {
    const { error } = await supabase.from("bot_notes").delete().eq("guild_id", guildId).eq("id", id);
    if (error) throw error;
    return;
  }
  const rows = memNotes.get(guildId) || [];
  memNotes.set(
    guildId,
    rows.filter((n) => n.id !== id)
  );
}

// ---- per-guild disabled commands (feature toggle) ----

export async function getDisabledCommands(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_guild_settings")
      .select("disabled_commands")
      .eq("guild_id", guildId)
      .maybeSingle();
    if (error) throw error;
    return data?.disabled_commands || [];
  }
  return memDisabledCommands.get(guildId) || [];
}

export async function setDisabledCommands(guildId, commandNames) {
  if (supabase) {
    const { error } = await supabase.from("bot_guild_settings").upsert({
      guild_id: guildId,
      disabled_commands: commandNames,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }
  memDisabledCommands.set(guildId, commandNames);
}

// ---- knowledge base (whole-entry injection, no embeddings — see ENGINEERING.md) ----

export async function addKnowledge(guildId, title, content) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_knowledge")
      .insert({ guild_id: guildId, title, content })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
  const rows = memKnowledge.get(guildId) || [];
  const id = memKnowledgeIdSeq++;
  const now = new Date().toISOString();
  rows.push({ id, title, content, created_at: now, updated_at: now });
  memKnowledge.set(guildId, rows);
  return id;
}

export async function listKnowledge(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_knowledge")
      .select("id, title, content, created_at, updated_at")
      .eq("guild_id", guildId)
      .order("title");
    if (error) throw error;
    return data || [];
  }
  return (memKnowledge.get(guildId) || []).slice();
}

export async function updateKnowledge(guildId, id, { title, content }) {
  if (supabase) {
    const row = { updated_at: new Date().toISOString() };
    if (title !== undefined) row.title = title;
    if (content !== undefined) row.content = content;
    const { error } = await supabase.from("bot_knowledge").update(row).eq("guild_id", guildId).eq("id", id);
    if (error) throw error;
    return;
  }
  const rows = memKnowledge.get(guildId) || [];
  const entry = rows.find((k) => k.id === id);
  if (entry) {
    if (title !== undefined) entry.title = title;
    if (content !== undefined) entry.content = content;
    entry.updated_at = new Date().toISOString();
  }
}

export async function deleteKnowledge(guildId, id) {
  if (supabase) {
    const { error } = await supabase.from("bot_knowledge").delete().eq("guild_id", guildId).eq("id", id);
    if (error) throw error;
    return;
  }
  const rows = memKnowledge.get(guildId) || [];
  memKnowledge.set(
    guildId,
    rows.filter((k) => k.id !== id)
  );
}

// ---- conversation viewer (admin dashboard, read-only) ----

export async function listConversationChannels(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_conversation_history")
      .select("channel_id, created_at")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const seen = new Map();
    for (const row of data || []) {
      if (!seen.has(row.channel_id)) {
        seen.set(row.channel_id, { channel_id: row.channel_id, last_message_at: row.created_at, message_count: 0 });
      }
      seen.get(row.channel_id).message_count += 1;
    }
    return Array.from(seen.values());
  }
  const seen = new Map();
  for (const [channelId, rows] of memHistory.entries()) {
    const guildRows = rows.filter((r) => r.guild_id === guildId);
    if (guildRows.length === 0) continue;
    seen.set(channelId, {
      channel_id: channelId,
      last_message_at: guildRows[guildRows.length - 1].created_at,
      message_count: guildRows.length,
    });
  }
  return Array.from(seen.values());
}

export async function getConversationMessages(channelId, limit = 50) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_conversation_history")
      .select("role, content, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).reverse();
  }
  return (memHistory.get(channelId) || []).slice(-limit);
}

// ---- /scan operator allowlist (global, not per-guild) ----

export async function isApprovedScanOperator(discordUserId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_scan_operators")
      .select("discord_user_id")
      .eq("discord_user_id", discordUserId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  return memScanOperators.has(discordUserId);
}

export async function addScanOperator(discordUserId, addedBy) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_scan_operators")
      .upsert({ discord_user_id: discordUserId, added_by: addedBy });
    if (error) throw error;
    return;
  }
  memScanOperators.set(discordUserId, {
    discord_user_id: discordUserId,
    added_by: addedBy,
    created_at: new Date().toISOString(),
  });
}

export async function removeScanOperator(discordUserId) {
  if (supabase) {
    const { error } = await supabase.from("bot_scan_operators").delete().eq("discord_user_id", discordUserId);
    if (error) throw error;
    return;
  }
  memScanOperators.delete(discordUserId);
}

export async function listScanOperators() {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_scan_operators")
      .select("discord_user_id, added_by, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  return Array.from(memScanOperators.values());
}
