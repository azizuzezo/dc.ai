const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

// Discord's GuildMember#timeout cannot exceed 28 days.
export const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function toMs(input) {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec((input || "").trim());
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms = value * UNIT_MS[unit];
  return ms > 0 ? ms : null;
}

/** Parses inputs like "10m", "1h", "1d" into milliseconds, uncapped. Returns null if invalid. */
export function parseDurationMs(input) {
  return toMs(input);
}

/** Same parsing, capped at Discord's 28-day member-timeout limit. Used by /mute. */
export function parseDuration(input) {
  const ms = toMs(input);
  return ms == null ? null : Math.min(ms, MAX_TIMEOUT_MS);
}
