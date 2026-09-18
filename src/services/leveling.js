import * as db from "./db.js";

const XP_COOLDOWN_MS = 60_000;
const XP_MIN = 15;
const XP_MAX = 25;

const lastXpAt = new Map(); // `${guildId}:${userId}` -> timestamp

export function xpForLevel(level) {
  return 100 + level * 50;
}

export function levelFromXp(totalXp) {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return level;
}

export function xpProgress(totalXp) {
  const level = levelFromXp(totalXp);
  let remaining = totalXp;
  for (let l = 0; l < level; l++) remaining -= xpForLevel(l);
  return { level, xpIntoLevel: remaining, xpNeeded: xpForLevel(level) };
}

// Awards XP for a message, respecting a per-user cooldown so spamming
// doesn't inflate levels. Returns level-up info only when the level actually
// increases, so callers can decide whether to announce it.
export async function awardMessageXp(guildId, userId, now = Date.now()) {
  const key = `${guildId}:${userId}`;
  const last = lastXpAt.get(key);
  if (last != null && now - last < XP_COOLDOWN_MS) return null;
  lastXpAt.set(key, now);

  const current = await db.getLevel(guildId, userId);
  const gained = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
  const newXp = current.xp + gained;
  const newLevel = levelFromXp(newXp);
  await db.setLevel(guildId, userId, newXp, newLevel);

  if (newLevel > current.level) {
    return { level: newLevel, xp: newXp };
  }
  return null;
}
