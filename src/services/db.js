import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { logWarn } from "./logger.js";
import { aggregateLeaderboard } from "./donationLeaderboard.js";

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
const memTiktokWatches = new Map(); // `${guildId}:${tiktokUsername}` -> { id, guild_id, channel_id, tiktok_username, is_live }
const memTriviaScores = new Map(); // `${guildId}:${userId}` -> correct_count
const memWelcomeSettings = new Map(); // guildId -> { welcome_channel_id, welcome_message, leave_channel_id, leave_message }
const memLevels = new Map(); // `${guildId}:${userId}` -> { guild_id, user_id, xp, level }
const memDonationSettings = new Map(); // guildId -> { guild_id, gateway_url, gateway_api_key, alert_channel_id, overlay_token, min_amount, tts_enabled, sound_enabled, leaderboard_enabled }
const memDonations = []; // [{ id, guild_id, trx_id, donor_name, message, amount, status, expires_at, paid_at, wishlist_item_id }]
const memWishlistItems = []; // [{ id, guild_id, title, target_amount }]
let memDonationIdSeq = 1;
let memWishlistItemIdSeq = 1;
let memReminderIdSeq = 1;
let memNoteIdSeq = 1;
let memKnowledgeIdSeq = 1;
let memTiktokWatchIdSeq = 1;
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

// ---- trivia scores ----

export async function incrementTriviaScore(guildId, userId) {
  if (supabase) {
    const { data: existing, error: selectError } = await supabase
      .from("bot_trivia_scores")
      .select("correct_count")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .maybeSingle();
    if (selectError) throw selectError;
    const nextCount = (existing?.correct_count ?? 0) + 1;
    const { error } = await supabase
      .from("bot_trivia_scores")
      .upsert(
        { guild_id: guildId, user_id: userId, correct_count: nextCount, updated_at: new Date().toISOString() },
        { onConflict: "guild_id,user_id" }
      );
    if (error) throw error;
    return nextCount;
  }
  const key = `${guildId}:${userId}`;
  const nextCount = (memTriviaScores.get(key) || 0) + 1;
  memTriviaScores.set(key, nextCount);
  return nextCount;
}

export async function getTriviaLeaderboard(guildId, limit = 10) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_trivia_scores")
      .select("user_id, correct_count")
      .eq("guild_id", guildId)
      .order("correct_count", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
  return [...memTriviaScores.entries()]
    .filter(([key]) => key.startsWith(`${guildId}:`))
    .map(([key, correct_count]) => ({ user_id: key.split(":")[1], correct_count }))
    .sort((a, b) => b.correct_count - a.correct_count)
    .slice(0, limit);
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

// ---- TikTok live watches ----

export async function addTiktokWatch(guildId, channelId, tiktokUsername, mention = null) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_tiktok_watches")
      .upsert(
        { guild_id: guildId, channel_id: channelId, tiktok_username: tiktokUsername, is_live: false, mention },
        { onConflict: "guild_id,tiktok_username" }
      );
    if (error) throw error;
    return;
  }
  const key = `${guildId}:${tiktokUsername}`;
  memTiktokWatches.set(key, {
    id: memTiktokWatches.get(key)?.id ?? memTiktokWatchIdSeq++,
    guild_id: guildId,
    channel_id: channelId,
    tiktok_username: tiktokUsername,
    is_live: false,
    mention,
  });
}

export async function removeTiktokWatch(guildId, tiktokUsername) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_tiktok_watches")
      .delete()
      .eq("guild_id", guildId)
      .eq("tiktok_username", tiktokUsername)
      .select("id");
    if (error) throw error;
    return (data || []).length > 0;
  }
  return memTiktokWatches.delete(`${guildId}:${tiktokUsername}`);
}

export async function listTiktokWatchesForGuild(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_tiktok_watches")
      .select("id, guild_id, channel_id, tiktok_username, is_live, mention")
      .eq("guild_id", guildId)
      .order("tiktok_username", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  return Array.from(memTiktokWatches.values()).filter((w) => w.guild_id === guildId);
}

export async function listAllTiktokWatches() {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_tiktok_watches")
      .select("id, guild_id, channel_id, tiktok_username, is_live, mention");
    if (error) throw error;
    return data || [];
  }
  return Array.from(memTiktokWatches.values());
}

export async function setTiktokWatchLiveState(id, isLive) {
  if (supabase) {
    const { error } = await supabase.from("bot_tiktok_watches").update({ is_live: isLive }).eq("id", id);
    if (error) throw error;
    return;
  }
  const row = Array.from(memTiktokWatches.values()).find((w) => w.id === id);
  if (row) row.is_live = isLive;
}

// ---- welcome / leave messages ----

export async function getWelcomeSettings(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_guild_settings")
      .select("welcome_channel_id, welcome_message, leave_channel_id, leave_message")
      .eq("guild_id", guildId)
      .maybeSingle();
    if (error) throw error;
    return data || {};
  }
  return memWelcomeSettings.get(guildId) || {};
}

export async function setWelcomeMessage(guildId, channelId, message) {
  if (supabase) {
    const { error } = await supabase.from("bot_guild_settings").upsert({
      guild_id: guildId,
      welcome_channel_id: channelId,
      welcome_message: message,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }
  memWelcomeSettings.set(guildId, {
    ...memWelcomeSettings.get(guildId),
    welcome_channel_id: channelId,
    welcome_message: message,
  });
}

export async function disableWelcomeMessage(guildId) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_guild_settings")
      .upsert({ guild_id: guildId, welcome_channel_id: null, updated_at: new Date().toISOString() });
    if (error) throw error;
    return;
  }
  const existing = memWelcomeSettings.get(guildId);
  if (existing) existing.welcome_channel_id = null;
}

export async function setLeaveMessage(guildId, channelId, message) {
  if (supabase) {
    const { error } = await supabase.from("bot_guild_settings").upsert({
      guild_id: guildId,
      leave_channel_id: channelId,
      leave_message: message,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }
  memWelcomeSettings.set(guildId, {
    ...memWelcomeSettings.get(guildId),
    leave_channel_id: channelId,
    leave_message: message,
  });
}

export async function disableLeaveMessage(guildId) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_guild_settings")
      .upsert({ guild_id: guildId, leave_channel_id: null, updated_at: new Date().toISOString() });
    if (error) throw error;
    return;
  }
  const existing = memWelcomeSettings.get(guildId);
  if (existing) existing.leave_channel_id = null;
}

// ---- leveling ----

export async function getLevel(guildId, userId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_levels")
      .select("xp, level")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data || { xp: 0, level: 0 };
  }
  const row = memLevels.get(`${guildId}:${userId}`);
  return row ? { xp: row.xp, level: row.level } : { xp: 0, level: 0 };
}

export async function setLevel(guildId, userId, xp, level) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_levels")
      .upsert(
        { guild_id: guildId, user_id: userId, xp, level, updated_at: new Date().toISOString() },
        { onConflict: "guild_id,user_id" }
      );
    if (error) throw error;
    return;
  }
  memLevels.set(`${guildId}:${userId}`, { guild_id: guildId, user_id: userId, xp, level });
}

export async function getLeaderboard(guildId, limit = 10) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_levels")
      .select("user_id, xp, level")
      .eq("guild_id", guildId)
      .order("xp", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
  return Array.from(memLevels.values())
    .filter((row) => row.guild_id === guildId)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);
}

// ---- donations (QRIS gateway) ----

export async function getDonationSettings(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_settings")
      .select("*")
      .eq("guild_id", guildId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
  return memDonationSettings.get(guildId) || null;
}

export async function getDonationSettingsByOverlayToken(token) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_settings")
      .select("*")
      .eq("overlay_token", token)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
  return Array.from(memDonationSettings.values()).find((s) => s.overlay_token === token) || null;
}

export async function getDonationSettingsBySlug(slug) {
  if (supabase) {
    const { data, error } = await supabase.from("bot_donation_settings").select("*").eq("slug", slug).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  return Array.from(memDonationSettings.values()).find((s) => s.slug === slug) || null;
}

/** Resolves a /donate/:identifier path segment — either a custom slug or a raw guild ID. */
export async function getDonationSettingsByIdentifier(identifier) {
  return (await getDonationSettingsBySlug(identifier)) || (await getDonationSettings(identifier));
}

/** Creates default settings (with a fresh overlay token) the first time a guild's donation page is touched. */
export async function ensureDonationSettings(guildId) {
  const existing = await getDonationSettings(guildId);
  if (existing) return existing;

  const fresh = {
    guild_id: guildId,
    gateway_url: null,
    gateway_api_key: null,
    alert_channel_id: null,
    overlay_token: randomBytes(16).toString("hex"),
    min_amount: 5000,
    tts_enabled: true,
    sound_enabled: true,
    leaderboard_enabled: true,
    slug: null,
    display_name: null,
    description: null,
    avatar_data: null,
    avatar_mime: null,
  };
  if (supabase) {
    const { error } = await supabase.from("bot_donation_settings").insert(fresh);
    if (error) throw error;
    return fresh;
  }
  memDonationSettings.set(guildId, fresh);
  return fresh;
}

export async function updateDonationSettings(guildId, fields) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_donation_settings")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("guild_id", guildId);
    if (error) throw error;
    return;
  }
  const existing = memDonationSettings.get(guildId);
  if (existing) Object.assign(existing, fields);
}

export async function regenerateOverlayToken(guildId) {
  const token = randomBytes(16).toString("hex");
  if (supabase) {
    const { error } = await supabase.from("bot_donation_settings").update({ overlay_token: token }).eq("guild_id", guildId);
    if (error) throw error;
    return token;
  }
  const existing = memDonationSettings.get(guildId);
  if (existing) existing.overlay_token = token;
  return token;
}

export async function createDonation({
  guildId,
  trxId,
  donorName,
  message,
  amount,
  expiresAt,
  wishlistItemId = null,
  youtubeVideoId = null,
}) {
  if (supabase) {
    const { error } = await supabase.from("bot_donations").insert({
      guild_id: guildId,
      trx_id: trxId,
      donor_name: donorName,
      message,
      amount,
      status: "pending",
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      wishlist_item_id: wishlistItemId,
      youtube_video_id: youtubeVideoId,
    });
    if (error) throw error;
    return;
  }
  memDonations.push({
    id: memDonationIdSeq++,
    guild_id: guildId,
    trx_id: trxId,
    donor_name: donorName,
    message,
    amount,
    status: "pending",
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    paid_at: null,
    wishlist_item_id: wishlistItemId,
    youtube_video_id: youtubeVideoId,
  });
}

export async function getDonationByTrxId(trxId) {
  if (supabase) {
    const { data, error } = await supabase.from("bot_donations").select("*").eq("trx_id", trxId).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  return memDonations.find((d) => d.trx_id === trxId) || null;
}

export async function listPendingDonations() {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donations")
      .select("id, guild_id, trx_id, donor_name, message, amount, expires_at, wishlist_item_id, youtube_video_id")
      .eq("status", "pending");
    if (error) throw error;
    return data || [];
  }
  return memDonations.filter((d) => d.status === "pending");
}

export async function markDonationPaid(trxId, paidAt = new Date()) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_donations")
      .update({ status: "paid", paid_at: paidAt.toISOString() })
      .eq("trx_id", trxId);
    if (error) throw error;
    return;
  }
  const row = memDonations.find((d) => d.trx_id === trxId);
  if (row) {
    row.status = "paid";
    row.paid_at = paidAt.toISOString();
  }
}

export async function markDonationExpired(trxId) {
  if (supabase) {
    const { error } = await supabase.from("bot_donations").update({ status: "expired" }).eq("trx_id", trxId);
    if (error) throw error;
    return;
  }
  const row = memDonations.find((d) => d.trx_id === trxId);
  if (row) row.status = "expired";
}

export async function listRecentPaidDonations(guildId, limit = 10) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donations")
      .select("trx_id, donor_name, message, amount, paid_at")
      .eq("guild_id", guildId)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
  return memDonations
    .filter((d) => d.guild_id === guildId && d.status === "paid")
    .sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at))
    .slice(0, limit);
}

export async function getDonationLeaderboard(guildId, limit = 10) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donations")
      .select("donor_name, amount")
      .eq("guild_id", guildId)
      .eq("status", "paid");
    if (error) throw error;
    return aggregateLeaderboard(data || [], limit);
  }
  return aggregateLeaderboard(
    memDonations.filter((d) => d.guild_id === guildId && d.status === "paid"),
    limit
  );
}

// ---- donation wishlist / milestones ----

export async function listWishlistItems(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_wishlist_items")
      .select("id, title, target_amount, created_at")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  return memWishlistItems.filter((w) => w.guild_id === guildId);
}

export async function getWishlistItem(guildId, id) {
  const items = await listWishlistItems(guildId);
  return items.find((w) => w.id === Number(id)) || null;
}

export async function addWishlistItem(guildId, title, targetAmount) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_wishlist_items")
      .insert({ guild_id: guildId, title, target_amount: targetAmount })
      .select("id, title, target_amount, created_at")
      .single();
    if (error) throw error;
    return data;
  }
  const item = { id: memWishlistItemIdSeq++, guild_id: guildId, title, target_amount: targetAmount };
  memWishlistItems.push(item);
  return item;
}

export async function deleteWishlistItem(guildId, id) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_donation_wishlist_items")
      .delete()
      .eq("guild_id", guildId)
      .eq("id", id);
    if (error) throw error;
    return;
  }
  const idx = memWishlistItems.findIndex((w) => w.guild_id === guildId && w.id === Number(id));
  if (idx !== -1) memWishlistItems.splice(idx, 1);
}

/** Total raised + top contributors for one wishlist item, from its paid donations. */
export async function getWishlistProgress(itemId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donations")
      .select("donor_name, amount")
      .eq("wishlist_item_id", itemId)
      .eq("status", "paid");
    if (error) throw error;
    const rows = data || [];
    return { total: rows.reduce((sum, r) => sum + Number(r.amount), 0), contributors: aggregateLeaderboard(rows, 10) };
  }
  const rows = memDonations.filter((d) => d.wishlist_item_id === Number(itemId) && d.status === "paid");
  return { total: rows.reduce((sum, r) => sum + Number(r.amount), 0), contributors: aggregateLeaderboard(rows, 10) };
}

/** All wishlist items for a guild with their progress attached, for the overlay widget and admin page. */
export async function listWishlistItemsWithProgress(guildId) {
  const items = await listWishlistItems(guildId);
  return Promise.all(
    items.map(async (item) => ({ ...item, ...(await getWishlistProgress(item.id)) }))
  );
}
