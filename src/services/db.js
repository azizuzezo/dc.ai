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
  rows.push({ role, content, created_at: new Date().toISOString() });
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
