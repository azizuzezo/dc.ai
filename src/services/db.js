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
const memHistoryByUser = new Map(); // `${guildId}:${userId}` -> [{ role, content, created_at }]
const memProcessedMessages = new Set(); // Discord message IDs already claimed (dedup guard)
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
const memDonationPoints = new Map(); // `${guildId}:${tiktokUser}` -> { guild_id, tiktok_user, points, first_seen_at, last_seen_at }
const memDonationActions = []; // [{ id, guild_id, name, media_url, media_type, gift_icon_key, sound_url, duration_ms, created_at }]
const memDonationEvents = []; // [{ id, guild_id, action_id, trigger_type, trigger_value, screen, active, created_at }]
const memDonationTimers = []; // [{ id, guild_id, action_id, interval_minutes, screen, active, last_fired_at, created_at }]
const memFlaggedChat = []; // [{ id, guild_id, tiktok_user, message, reason, created_at }]
const memDonationMedia = []; // [{ id, guild_id, filename, mime_type, data, size_bytes, created_at }]
const memAlertTiers = []; // [{ id, guild_id, min_amount, image_url, effect, created_at }]
const memMilestones = []; // [{ id, guild_id, metric, target, label, created_at }]
let memDonationIdSeq = 1;
let memWishlistItemIdSeq = 1;
let memDonationActionIdSeq = 1;
let memDonationEventIdSeq = 1;
let memDonationTimerIdSeq = 1;
let memFlaggedChatIdSeq = 1;
let memDonationMediaIdSeq = 1;
let memAlertTierIdSeq = 1;
let memMilestoneIdSeq = 1;
let memReminderIdSeq = 1;
let memNoteIdSeq = 1;
let memKnowledgeIdSeq = 1;
let memTiktokWatchIdSeq = 1;
let memGlobalAiSettings = { model: null, baseUrl: null, apiKey: null };

// ---- conversation history ----

export async function saveHistoryTurn(channelId, guildId, userId, role, content) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_conversation_history")
      .insert({ channel_id: channelId, guild_id: guildId, user_id: userId, role, content });
    if (error) throw error;
    return;
  }
  const rows = memHistory.get(channelId) || [];
  rows.push({ guild_id: guildId, role, content, created_at: new Date().toISOString() });
  memHistory.set(channelId, rows);

  if (userId) {
    const userKey = `${guildId}:${userId}`;
    const userRows = memHistoryByUser.get(userKey) || [];
    userRows.push({ role, content, created_at: new Date().toISOString() });
    memHistoryByUser.set(userKey, userRows);
  }
}

/** The AI's actual conversational memory: a person's own history across every
 * channel in the guild, so a busy shared channel can't push them out of it. */
export async function fetchHistoryForUser(guildId, userId, limit) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_conversation_history")
      .select("role, content, created_at")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit * 2);
    if (error) throw error;
    return (data || []).reverse();
  }
  const rows = memHistoryByUser.get(`${guildId}:${userId}`) || [];
  return rows.slice(-limit * 2);
}

export async function trimHistoryForUser(guildId, userId, limit) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_conversation_history")
      .select("id")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const idsToDelete = (data || []).slice(limit * 2).map((row) => row.id);
    if (idsToDelete.length) {
      const { error: deleteError } = await supabase.from("bot_conversation_history").delete().in("id", idsToDelete);
      if (deleteError) throw deleteError;
    }
    return;
  }
  const userKey = `${guildId}:${userId}`;
  const rows = memHistoryByUser.get(userKey);
  if (rows && rows.length > limit * 2) {
    memHistoryByUser.set(userKey, rows.slice(-limit * 2));
  }
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

// ---- message-processing dedup guard (see messageCreate.js) ----

/** Atomically claims a Discord message ID. Returns true the first time (caller should
 * proceed), false on any later call for the same ID (some instance already handled it). */
export async function claimProcessedMessage(messageId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_processed_messages")
      .upsert({ message_id: messageId }, { onConflict: "message_id", ignoreDuplicates: true })
      .select("message_id");
    if (error) throw error;
    return (data || []).length > 0;
  }
  if (memProcessedMessages.has(messageId)) return false;
  memProcessedMessages.add(messageId);
  return true;
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

/** Resolves the /:identifier path segment at the domain root — either a custom slug or a raw guild ID. */
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
    tiktok_url: null,
    instagram_url: null,
    youtube_url: null,
    twitter_url: null,
    host_username: null,
    host_password_hash: null,
    points_enabled: false,
    points_currency_name: "Poin",
    points_per_coin: 1,
    points_per_chat_message: 0,
    points_per_follow: 0,
    points_per_share: 0,
    sound_alert_map: {},
    chat_commands_enabled: false,
    chat_commands_config: {},
    wheel_config: [],
    likeathon_reduction_enabled: false,
    likeathon_reduction_percent: 10,
    points_drop_bonus: 50,
    points_drop_duration_seconds: 30,
    event_api_key: randomBytes(16).toString("hex"),
    moderation_enabled: false,
    moderation_badwords_enabled: true,
    moderation_judol_enabled: true,
    moderation_duplicate_enabled: true,
    link_preview_enabled: false,
    media_volume: 100,
    chat_bubble_style: {},
    dashboard_theme: {},
    subathon_end_at: null,
    subathon_rate_amount: 10000,
    subathon_rate_minutes: 5,
    subathon_label: "Waktu",
    subathon_started_at: null,
    subathon_max_hours: null,
    alert_appearance: {},
    leaderboard_style: {},
    likeathon_style: {},
    waktu_style: {},
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
  donorEmail = null,
  message,
  amount,
  expiresAt,
  wishlistItemId = null,
  youtubeVideoId = null,
  youtubeStartSeconds = null,
  youtubeEndSeconds = null,
}) {
  if (supabase) {
    const { error } = await supabase.from("bot_donations").insert({
      guild_id: guildId,
      trx_id: trxId,
      donor_name: donorName,
      donor_email: donorEmail,
      message,
      amount,
      status: "pending",
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      wishlist_item_id: wishlistItemId,
      youtube_video_id: youtubeVideoId,
      youtube_start_seconds: youtubeStartSeconds,
      youtube_end_seconds: youtubeEndSeconds,
    });
    if (error) throw error;
    return;
  }
  memDonations.push({
    id: memDonationIdSeq++,
    guild_id: guildId,
    trx_id: trxId,
    donor_name: donorName,
    donor_email: donorEmail,
    message,
    amount,
    status: "pending",
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    paid_at: null,
    youtube_start_seconds: youtubeStartSeconds,
    youtube_end_seconds: youtubeEndSeconds,
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
      .select(
        "id, guild_id, trx_id, donor_name, message, amount, expires_at, wishlist_item_id, youtube_video_id, youtube_start_seconds, youtube_end_seconds"
      )
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
      .select("trx_id, donor_name, message, amount, paid_at, wishlist_item_id")
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

/** sinceIso limits the ranking to donations paid on/after that timestamp; null means all-time. */
export async function getDonationLeaderboard(guildId, limit = 10, sinceIso = null) {
  if (supabase) {
    let query = supabase.from("bot_donations").select("donor_name, amount").eq("guild_id", guildId).eq("status", "paid");
    if (sinceIso) query = query.gte("paid_at", sinceIso);
    const { data, error } = await query;
    if (error) throw error;
    return aggregateLeaderboard(data || [], limit);
  }
  return aggregateLeaderboard(
    memDonations.filter(
      (d) => d.guild_id === guildId && d.status === "paid" && (!sinceIso || d.paid_at >= sinceIso)
    ),
    limit
  );
}

/** Total paid amount and per-day breakdown for the host dashboard's earnings chart, oldest day first. */
export async function getDonationDailyTotals(guildId, days = 7) {
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
  let rows;
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donations")
      .select("amount, paid_at")
      .eq("guild_id", guildId)
      .eq("status", "paid")
      .gte("paid_at", sinceIso);
    if (error) throw error;
    rows = data || [];
  } else {
    rows = memDonations.filter((d) => d.guild_id === guildId && d.status === "paid" && d.paid_at >= sinceIso);
  }

  const totalsByDay = new Map();
  for (const row of rows) {
    const day = row.paid_at.slice(0, 10); // "YYYY-MM-DD"
    totalsByDay.set(day, (totalsByDay.get(day) || 0) + Number(row.amount));
  }

  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    points.push({ date, total: totalsByDay.get(date) || 0 });
  }
  return { points, grandTotal: rows.reduce((sum, r) => sum + Number(r.amount), 0) };
}

/** All-time paid total for the host dashboard's earnings figure (getDonationDailyTotals' grandTotal is window-scoped). */
export async function getDonationGrandTotal(guildId) {
  if (supabase) {
    const { data, error } = await supabase.from("bot_donations").select("amount").eq("guild_id", guildId).eq("status", "paid");
    if (error) throw error;
    return (data || []).reduce((sum, r) => sum + Number(r.amount), 0);
  }
  return memDonations
    .filter((d) => d.guild_id === guildId && d.status === "paid")
    .reduce((sum, r) => sum + Number(r.amount), 0);
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

export async function updateWishlistItem(guildId, id, { title, targetAmount }) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_donation_wishlist_items")
      .update({ title, target_amount: targetAmount })
      .eq("guild_id", guildId)
      .eq("id", id);
    if (error) throw error;
    return;
  }
  const item = memWishlistItems.find((w) => w.guild_id === guildId && w.id === Number(id));
  if (item) {
    item.title = title;
    item.target_amount = targetAmount;
  }
}

export async function deleteWishlistItem(guildId, id) {
  if (supabase) {
    // Donations already made toward this item reference it by id — deleting
    // the item outright would hit that foreign key and fail. Detach them
    // first (they keep counting toward the donor's total/leaderboard, just
    // without a wishlist attribution) so the delete always succeeds.
    const { error: unlinkError } = await supabase
      .from("bot_donations")
      .update({ wishlist_item_id: null })
      .eq("guild_id", guildId)
      .eq("wishlist_item_id", id);
    if (unlinkError) throw unlinkError;
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

// ---- TikTok viewer points (separate from bot_levels' Discord chat XP — TikTok
// LIVE viewers have no Discord account link anywhere in this codebase, so
// they're tracked here by guild + TikTok nickname instead). ----

export async function getDonationPoints(guildId, tiktokUser) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_points")
      .select("points")
      .eq("guild_id", guildId)
      .eq("tiktok_user", tiktokUser)
      .maybeSingle();
    if (error) throw error;
    return data?.points ?? 0;
  }
  return memDonationPoints.get(`${guildId}:${tiktokUser}`)?.points ?? 0;
}

/** Adds (or subtracts, if delta is negative) points for a viewer, creating the row if needed. Returns the new total. */
export async function awardDonationPoints(guildId, tiktokUser, delta) {
  const now = new Date().toISOString();
  if (supabase) {
    const { data: existing, error: selectError } = await supabase
      .from("bot_donation_points")
      .select("points")
      .eq("guild_id", guildId)
      .eq("tiktok_user", tiktokUser)
      .maybeSingle();
    if (selectError) throw selectError;
    const nextPoints = Math.max(0, (existing?.points ?? 0) + delta);
    const { error } = await supabase.from("bot_donation_points").upsert(
      {
        guild_id: guildId,
        tiktok_user: tiktokUser,
        points: nextPoints,
        last_seen_at: now,
        ...(existing ? {} : { first_seen_at: now }),
      },
      { onConflict: "guild_id,tiktok_user" }
    );
    if (error) throw error;
    return nextPoints;
  }
  const key = `${guildId}:${tiktokUser}`;
  const existing = memDonationPoints.get(key);
  const nextPoints = Math.max(0, (existing?.points ?? 0) + delta);
  memDonationPoints.set(key, {
    guild_id: guildId,
    tiktok_user: tiktokUser,
    points: nextPoints,
    first_seen_at: existing?.first_seen_at ?? now,
    last_seen_at: now,
  });
  return nextPoints;
}

/** guild's viewer point standings, highest first. `search` filters by a case-insensitive substring of the username. */
export async function listDonationPoints(guildId, { search = "", limit = 50 } = {}) {
  let rows;
  if (supabase) {
    let query = supabase
      .from("bot_donation_points")
      .select("tiktok_user, points, first_seen_at, last_seen_at")
      .eq("guild_id", guildId)
      .order("points", { ascending: false })
      .limit(limit);
    if (search) query = query.ilike("tiktok_user", `%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    rows = data || [];
  } else {
    rows = Array.from(memDonationPoints.values())
      .filter((r) => r.guild_id === guildId && (!search || r.tiktok_user.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => b.points - a.points)
      .slice(0, limit);
  }
  return rows;
}

/** Moves points from one viewer to another (chat "!send" command). Returns { ok, reason }. */
export async function transferDonationPoints(guildId, fromUser, toUser, amount) {
  if (!(amount > 0)) return { ok: false, reason: "invalid_amount" };
  const fromPoints = await getDonationPoints(guildId, fromUser);
  if (fromPoints < amount) return { ok: false, reason: "insufficient_points" };
  await awardDonationPoints(guildId, fromUser, -amount);
  await awardDonationPoints(guildId, toUser, amount);
  return { ok: true };
}

/** Tools > Halving — halves every tracked viewer's point balance for the guild. */
export async function halveDonationPoints(guildId) {
  if (supabase) {
    const { data, error } = await supabase.from("bot_donation_points").select("tiktok_user, points").eq("guild_id", guildId);
    if (error) throw error;
    for (const row of data || []) {
      const { error: updateError } = await supabase
        .from("bot_donation_points")
        .update({ points: Math.floor(row.points / 2) })
        .eq("guild_id", guildId)
        .eq("tiktok_user", row.tiktok_user);
      if (updateError) throw updateError;
    }
    return;
  }
  for (const row of memDonationPoints.values()) {
    if (row.guild_id === guildId) row.points = Math.floor(row.points / 2);
  }
}

// ---- Actions & Events (custom trigger -> media/sound overlay alerts) ----

export async function listDonationActions(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_actions")
      .select("id, name, description, media_url, media_type, gift_icon_key, sound_url, duration_ms, created_at")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  return memDonationActions.filter((a) => a.guild_id === guildId);
}

export async function getDonationAction(guildId, id) {
  const actions = await listDonationActions(guildId);
  return actions.find((a) => a.id === Number(id)) || null;
}

export async function addDonationAction(guildId, fields) {
  const row = {
    guild_id: guildId,
    name: fields.name,
    description: fields.description || null,
    media_url: fields.mediaUrl || null,
    media_type: fields.mediaType || "image",
    gift_icon_key: fields.giftIconKey || null,
    sound_url: fields.soundUrl || null,
    duration_ms: fields.durationMs || 4000,
  };
  if (supabase) {
    const { data, error } = await supabase.from("bot_donation_actions").insert(row).select("id").single();
    if (error) throw error;
    return data.id;
  }
  const id = memDonationActionIdSeq++;
  memDonationActions.push({ id, ...row, created_at: new Date().toISOString() });
  return id;
}

export async function deleteDonationAction(guildId, id) {
  if (supabase) {
    const { error } = await supabase.from("bot_donation_actions").delete().eq("guild_id", guildId).eq("id", id);
    if (error) throw error;
    return;
  }
  const idx = memDonationActions.findIndex((a) => a.guild_id === guildId && a.id === Number(id));
  if (idx !== -1) memDonationActions.splice(idx, 1);
  // Cascade to events/timers referencing it, mirroring the FK's `on delete cascade`.
  for (let i = memDonationEvents.length - 1; i >= 0; i--) {
    if (memDonationEvents[i].action_id === Number(id)) memDonationEvents.splice(i, 1);
  }
  for (let i = memDonationTimers.length - 1; i >= 0; i--) {
    if (memDonationTimers[i].action_id === Number(id)) memDonationTimers.splice(i, 1);
  }
}

export async function listDonationEvents(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_events")
      .select("id, action_id, trigger_type, trigger_value, screen, active, created_at")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  return memDonationEvents.filter((e) => e.guild_id === guildId);
}

export async function addDonationEvent(guildId, fields) {
  const row = {
    guild_id: guildId,
    action_id: Number(fields.actionId),
    trigger_type: fields.triggerType,
    trigger_value: fields.triggerValue || null,
    screen: Number(fields.screen) || 1,
    active: fields.active !== false,
  };
  if (supabase) {
    const { data, error } = await supabase.from("bot_donation_events").insert(row).select("id").single();
    if (error) throw error;
    return data.id;
  }
  const id = memDonationEventIdSeq++;
  memDonationEvents.push({ id, ...row, created_at: new Date().toISOString() });
  return id;
}

export async function deleteDonationEvent(guildId, id) {
  if (supabase) {
    const { error } = await supabase.from("bot_donation_events").delete().eq("guild_id", guildId).eq("id", id);
    if (error) throw error;
    return;
  }
  const idx = memDonationEvents.findIndex((e) => e.guild_id === guildId && e.id === Number(id));
  if (idx !== -1) memDonationEvents.splice(idx, 1);
}

export async function listDonationTimers(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_timers")
      .select("id, action_id, interval_minutes, screen, active, last_fired_at, created_at")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  return memDonationTimers.filter((t) => t.guild_id === guildId);
}

export async function addDonationTimer(guildId, fields) {
  const row = {
    guild_id: guildId,
    action_id: Number(fields.actionId),
    interval_minutes: Number(fields.intervalMinutes) || 10,
    screen: Number(fields.screen) || 1,
    active: fields.active !== false,
    last_fired_at: null,
  };
  if (supabase) {
    const { data, error } = await supabase.from("bot_donation_timers").insert(row).select("id").single();
    if (error) throw error;
    return data.id;
  }
  const id = memDonationTimerIdSeq++;
  memDonationTimers.push({ id, ...row, created_at: new Date().toISOString() });
  return id;
}

export async function deleteDonationTimer(guildId, id) {
  if (supabase) {
    const { error } = await supabase.from("bot_donation_timers").delete().eq("guild_id", guildId).eq("id", id);
    if (error) throw error;
    return;
  }
  const idx = memDonationTimers.findIndex((t) => t.guild_id === guildId && t.id === Number(id));
  if (idx !== -1) memDonationTimers.splice(idx, 1);
}

export async function markDonationTimerFired(id, whenIso) {
  if (supabase) {
    const { error } = await supabase.from("bot_donation_timers").update({ last_fired_at: whenIso }).eq("id", id);
    if (error) throw error;
    return;
  }
  const row = memDonationTimers.find((t) => t.id === Number(id));
  if (row) row.last_fired_at = whenIso;
}

export async function regenerateEventApiKey(guildId) {
  const key = randomBytes(16).toString("hex");
  await updateDonationSettings(guildId, { event_api_key: key });
  return key;
}

// ---- Chat moderation log (flagged messages — see services/chatModeration.js) ----

export async function addFlaggedChat(guildId, tiktokUser, message, reason) {
  if (supabase) {
    const { error } = await supabase
      .from("bot_donation_flagged_chat")
      .insert({ guild_id: guildId, tiktok_user: tiktokUser, message, reason });
    if (error) throw error;
    return;
  }
  memFlaggedChat.push({
    id: memFlaggedChatIdSeq++,
    guild_id: guildId,
    tiktok_user: tiktokUser,
    message,
    reason,
    created_at: new Date().toISOString(),
  });
}

export async function listFlaggedChat(guildId, limit = 50) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_flagged_chat")
      .select("id, tiktok_user, message, reason, created_at")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
  return memFlaggedChat
    .filter((f) => f.guild_id === guildId)
    .slice()
    .reverse()
    .slice(0, limit);
}

// ---- Media library (uploaded images/gifs/videos for Actions & Events) ----

export async function listDonationMedia(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_media")
      .select("id, filename, mime_type, size_bytes, created_at")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  return memDonationMedia
    .filter((m) => m.guild_id === guildId)
    .map(({ data, ...rest }) => rest);
}

/** Includes the base64 `data` field — only fetched when actually serving the file, not for the library listing. */
export async function getDonationMedia(guildId, id) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_media")
      .select("id, filename, mime_type, data, size_bytes")
      .eq("guild_id", guildId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
  return memDonationMedia.find((m) => m.guild_id === guildId && m.id === Number(id)) || null;
}

export async function addDonationMedia(guildId, { filename, mimeType, data, sizeBytes }) {
  const row = { guild_id: guildId, filename, mime_type: mimeType, data, size_bytes: sizeBytes };
  if (supabase) {
    const { data: inserted, error } = await supabase.from("bot_donation_media").insert(row).select("id").single();
    if (error) throw error;
    return inserted.id;
  }
  const id = memDonationMediaIdSeq++;
  memDonationMedia.push({ id, ...row, created_at: new Date().toISOString() });
  return id;
}

export async function deleteDonationMedia(guildId, id) {
  if (supabase) {
    const { error } = await supabase.from("bot_donation_media").delete().eq("guild_id", guildId).eq("id", id);
    if (error) throw error;
    return;
  }
  const idx = memDonationMedia.findIndex((m) => m.guild_id === guildId && m.id === Number(id));
  if (idx !== -1) memDonationMedia.splice(idx, 1);
}

// ---- Donation Alert tiers (amount-based custom image/effect for the Alert widget) ----

export async function listAlertTiers(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_alert_tiers")
      .select("id, min_amount, image_url, effect, created_at")
      .eq("guild_id", guildId)
      .order("min_amount", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  return memAlertTiers
    .filter((t) => t.guild_id === guildId)
    .slice()
    .sort((a, b) => b.min_amount - a.min_amount);
}

/** The highest tier whose min_amount the donation amount qualifies for, or null if none configured/matched. */
export async function resolveAlertTier(guildId, amount) {
  const tiers = await listAlertTiers(guildId);
  return tiers.find((t) => Number(amount) >= t.min_amount) || null;
}

export async function addAlertTier(guildId, { minAmount, imageUrl, effect }) {
  const row = { guild_id: guildId, min_amount: Number(minAmount) || 0, image_url: imageUrl || null, effect: effect || "none" };
  if (supabase) {
    const { data, error } = await supabase.from("bot_donation_alert_tiers").insert(row).select("id").single();
    if (error) throw error;
    return data.id;
  }
  const id = memAlertTierIdSeq++;
  memAlertTiers.push({ id, ...row, created_at: new Date().toISOString() });
  return id;
}

export async function deleteAlertTier(guildId, id) {
  if (supabase) {
    const { error } = await supabase.from("bot_donation_alert_tiers").delete().eq("guild_id", guildId).eq("id", id);
    if (error) throw error;
    return;
  }
  const idx = memAlertTiers.findIndex((t) => t.guild_id === guildId && t.id === Number(id));
  if (idx !== -1) memAlertTiers.splice(idx, 1);
}

/** Custom TikTok LIVE goal widgets (like/follower/share/gift-coin goals) —
 * progress itself is computed client-side from the same live-events stream
 * the plain Like/Follower/Share counter widgets already use, this table
 * only stores what the host configured (metric, target, label). */
export async function listMilestones(guildId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_milestones")
      .select("id, metric, target, label, created_at")
      .eq("guild_id", guildId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  return memMilestones.filter((m) => m.guild_id === guildId);
}

export async function getMilestone(guildId, id) {
  if (supabase) {
    const { data, error } = await supabase
      .from("bot_donation_milestones")
      .select("id, metric, target, label, created_at")
      .eq("guild_id", guildId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
  return memMilestones.find((m) => m.guild_id === guildId && m.id === Number(id)) || null;
}

export async function addMilestone(guildId, { metric, target, label }) {
  const row = { guild_id: guildId, metric: metric || "likes", target: Math.max(1, Number(target) || 0), label: label || "Goal" };
  if (supabase) {
    const { data, error } = await supabase.from("bot_donation_milestones").insert(row).select("id").single();
    if (error) throw error;
    return data.id;
  }
  const id = memMilestoneIdSeq++;
  memMilestones.push({ id, ...row, created_at: new Date().toISOString() });
  return id;
}

export async function deleteMilestone(guildId, id) {
  if (supabase) {
    const { error } = await supabase.from("bot_donation_milestones").delete().eq("guild_id", guildId).eq("id", id);
    if (error) throw error;
    return;
  }
  const idx = memMilestones.findIndex((m) => m.guild_id === guildId && m.id === Number(id));
  if (idx !== -1) memMilestones.splice(idx, 1);
}
