/** Actions & Events — TikFinity's custom trigger system: a host defines
 * Actions (media + sound to show) and Events (which live trigger fires which
 * action, on which overlay "screen"), and this module matches incoming
 * TikTok LIVE events against the guild's configured Events and broadcasts the
 * resolved Action to the matching /overlay/:token/actions?screen=N widget(s). */

import * as db from "./db.js";
import { broadcast } from "./donationOverlay.js";
import { resolveGiftIconUrlByKey } from "./giftIcons.js";
import { logError } from "./logger.js";

// Short-TTL cache so a LIKE flood (which can fire many times a second) doesn't
// hit the database on every tick just to check like-milestone events.
const CACHE_TTL_MS = 10_000;
const cache = new Map(); // guildId -> { events, actionsById, fetchedAt }

async function loadGuildData(guildId) {
  const cached = cache.get(guildId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;
  const [events, actions] = await Promise.all([db.listDonationEvents(guildId), db.listDonationActions(guildId)]);
  const data = {
    events: events.filter((e) => e.active),
    actionsById: new Map(actions.map((a) => [a.id, a])),
    fetchedAt: Date.now(),
  };
  cache.set(guildId, data);
  return data;
}

/** Called by the host dashboard's Actions & Events CRUD handlers after any change, so edits apply immediately instead of waiting out the cache TTL. */
export function invalidateGuildCache(guildId) {
  cache.delete(guildId);
}

function resolveActionPayload(action) {
  const mediaUrl = action.media_type === "gift_icon" ? resolveGiftIconUrlByKey(action.gift_icon_key) || action.media_url : action.media_url;
  return {
    name: action.name,
    mediaUrl,
    mediaType: action.media_type,
    soundUrl: action.sound_url,
    durationMs: action.duration_ms,
  };
}

async function fireAction(token, action, screen) {
  broadcast(token, "action", { ...resolveActionPayload(action), screen });
}

// Per-token set of like-milestone event IDs already fired this session, so a
// threshold only triggers once per crossing instead of on every LIKE tick above it.
const firedLikeMilestones = new Map(); // token -> Set<eventId>

export function resetLikeMilestones(token) {
  firedLikeMilestones.delete(token);
}

/** eventName is one of the names tiktokLiveEvents.js broadcasts: "chat"|"gift"|"follow"|"share"|"likes". */
export async function evaluateEvent(token, guildId, eventName, payload) {
  try {
    const { events, actionsById } = await loadGuildData(guildId);
    for (const evt of events) {
      let matched = false;

      if (eventName === "gift" && evt.trigger_type === "any_gift") {
        matched = true;
      } else if (eventName === "gift" && evt.trigger_type === "specific_gift") {
        matched = (evt.trigger_value || "").toLowerCase() === (payload.giftName || "").toLowerCase();
      } else if (eventName === "follow" && evt.trigger_type === "follow") {
        matched = true;
      } else if (eventName === "share" && evt.trigger_type === "share") {
        matched = true;
      } else if (eventName === "chat" && evt.trigger_type === "chat_keyword") {
        const keyword = (evt.trigger_value || "").toLowerCase();
        matched = Boolean(keyword) && (payload.message || "").toLowerCase().includes(keyword);
      } else if (eventName === "likes" && evt.trigger_type === "like_milestone") {
        const threshold = Number(evt.trigger_value);
        if (Number.isFinite(threshold) && payload.total >= threshold) {
          const fired = firedLikeMilestones.get(token) || new Set();
          if (!fired.has(evt.id)) {
            fired.add(evt.id);
            firedLikeMilestones.set(token, fired);
            matched = true;
          }
        }
      }

      if (!matched) continue;
      const action = actionsById.get(evt.action_id);
      if (action) await fireAction(token, action, evt.screen);
    }
  } catch (err) {
    logError(`actionsEngine.evaluateEvent failed for guild ${guildId}:`, err);
  }
}

// ---- Timers: recurring action fired every N minutes while a LIVE connection is open ----

const timerIntervals = new Map(); // token -> interval handle
const TIMER_TICK_MS = 30_000;

export function startTimers(token, guildId) {
  if (timerIntervals.has(token)) return;
  const handle = setInterval(async () => {
    try {
      const [timers, { actionsById }] = await Promise.all([db.listDonationTimers(guildId), loadGuildData(guildId)]);
      const now = Date.now();
      for (const timer of timers) {
        if (!timer.active) continue;
        const lastFired = timer.last_fired_at ? new Date(timer.last_fired_at).getTime() : 0;
        if (now - lastFired < timer.interval_minutes * 60_000) continue;
        const action = actionsById.get(timer.action_id);
        if (!action) continue;
        await fireAction(token, action, timer.screen);
        await db.markDonationTimerFired(timer.id, new Date().toISOString());
      }
    } catch (err) {
      logError(`actionsEngine timer tick failed for guild ${guildId}:`, err);
    }
  }, TIMER_TICK_MS);
  timerIntervals.set(token, handle);
}

export function stopTimers(token) {
  const handle = timerIntervals.get(token);
  if (handle) {
    clearInterval(handle);
    timerIntervals.delete(token);
  }
  resetLikeMilestones(token);
}
