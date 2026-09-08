import { env } from "../config/env.js";

// Pure, unit-testable helpers.
export function isWithinCooldown(lastCallAt, now, cooldownMs) {
  return lastCallAt != null && now - lastCallAt < cooldownMs;
}

export function pruneWindow(timestamps, now, windowMs) {
  return timestamps.filter((t) => now - t < windowMs);
}

// Per-user AI-trigger rate limiting only (not general anti-spam) — protects
// gemini-web2api from abuse/cost overrun, per PRD's cooldown/flood env vars.
const lastCallAt = new Map(); // userId -> timestamp
const hitWindows = new Map(); // userId -> timestamp[]

export function checkRateLimit(userId, now = Date.now()) {
  const last = lastCallAt.get(userId) ?? null;
  if (isWithinCooldown(last, now, env.aiCooldownMs)) {
    return { allowed: false, reason: "cooldown", retryAfterMs: env.aiCooldownMs - (now - last) };
  }

  const hits = pruneWindow(hitWindows.get(userId) || [], now, env.floodWindowMs);
  if (hits.length >= env.floodLimit) {
    return { allowed: false, reason: "flood", retryAfterMs: env.floodWindowMs };
  }

  hits.push(now);
  hitWindows.set(userId, hits);
  lastCallAt.set(userId, now);
  return { allowed: true };
}
