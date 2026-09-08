const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

// Discord's GuildMember#timeout cannot exceed 28 days.
export const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

/** Parses inputs like "10m", "1h", "1d" into milliseconds. Returns null if invalid. */
export function parseDuration(input) {
  const match = /^(\d+)\s*(s|m|h|d)$/i.exec((input || "").trim());
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms = value * UNIT_MS[unit];
  if (!ms || ms <= 0) return null;
  return Math.min(ms, MAX_TIMEOUT_MS);
}
