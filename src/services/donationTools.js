/** Wheel of Fortune, Likeathon ranking, and Points Drop — TikFinity's "Tools"
 * section. All state here is in-process/in-memory (like tiktokLiveEvents.js's
 * own like/follow counters), scoped per overlay token, and reset whenever a
 * fresh TikTok LIVE connection is acquired. */

import { broadcast } from "./donationOverlay.js";

// ---- Wheel of Fortune ----

/** Weighted random pick from [{label, weight}, ...], broadcasts the result to
 * the /overlay/:token/wheel widget, and returns the winning label (or null if
 * no options are configured). */
export function spinWheel(token, wheelConfig) {
  const options = (Array.isArray(wheelConfig) ? wheelConfig : []).filter((o) => o?.label && Number(o.weight) > 0);
  if (!options.length) return null;
  const totalWeight = options.reduce((sum, o) => sum + Number(o.weight), 0);
  let roll = Math.random() * totalWeight;
  let result = options[options.length - 1].label;
  for (const option of options) {
    roll -= Number(option.weight);
    if (roll <= 0) {
      result = option.label;
      break;
    }
  }
  broadcast(token, "wheel", { result, options: options.map((o) => o.label) });
  return result;
}

// ---- Likeathon: real-time top-liker ranking with optional automatic reduction ----

const likeathonState = new Map(); // token -> Map<user, { count, avatarUrl }>
const reductionIntervals = new Map(); // token -> interval handle

function broadcastLikeathon(token) {
  const state = likeathonState.get(token);
  if (!state) return;
  const ranking = Array.from(state.entries())
    .map(([user, entry]) => ({ user, count: entry.count, avatarUrl: entry.avatarUrl }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  broadcast(token, "likeathon", { ranking });
}

export function recordLikeathonLikes(token, user, count, avatarUrl) {
  if (!likeathonState.has(token)) likeathonState.set(token, new Map());
  const state = likeathonState.get(token);
  const existing = state.get(user);
  state.set(user, { count: (existing?.count || 0) + count, avatarUrl: avatarUrl || existing?.avatarUrl || null });
  broadcastLikeathon(token);
}

export function resetLikeathon(token) {
  likeathonState.set(token, new Map());
  broadcastLikeathon(token);
}

export function startLikeathonReduction(token, percent) {
  stopLikeathonReduction(token);
  if (!(Number(percent) > 0)) return;
  const handle = setInterval(() => {
    const state = likeathonState.get(token);
    if (!state) return;
    for (const [user, entry] of state.entries()) {
      state.set(user, { ...entry, count: Math.floor(entry.count * (1 - Number(percent) / 100)) });
    }
    broadcastLikeathon(token);
  }, 10_000);
  reductionIntervals.set(token, handle);
}

export function stopLikeathonReduction(token) {
  const handle = reductionIntervals.get(token);
  if (handle) {
    clearInterval(handle);
    reductionIntervals.delete(token);
  }
}

export function clearLikeathonState(token) {
  stopLikeathonReduction(token);
  likeathonState.delete(token);
}

// ---- Points Drop: a timed window where the "!get" chat command grants bonus points ----

const activeDrops = new Map(); // token -> { bonus, claimed: Set<user>, expiresAt }

export function startPointsDrop(token, bonus, durationSeconds) {
  const expiresAt = Date.now() + durationSeconds * 1000;
  activeDrops.set(token, { bonus, claimed: new Set(), expiresAt });
  broadcast(token, "points-drop", { active: true, bonus, durationSeconds });
  setTimeout(() => {
    if (activeDrops.get(token)?.expiresAt === expiresAt) {
      activeDrops.delete(token);
      broadcast(token, "points-drop", { active: false });
    }
  }, durationSeconds * 1000);
}

/** Returns the bonus amount if this user can still claim the active drop, else null (marks them as claimed). */
export function claimPointsDrop(token, user) {
  const drop = activeDrops.get(token);
  if (!drop || Date.now() > drop.expiresAt || drop.claimed.has(user)) return null;
  drop.claimed.add(user);
  return drop.bonus;
}
