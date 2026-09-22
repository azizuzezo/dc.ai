/** TikTok LIVE chat moderation — three checks, each independently toggleable:
 *
 * 1. Profanity, via the `indonesian-badwords` npm library (handles leetspeak
 *    and concatenated-word obfuscation on its own).
 * 2. Online-gambling ("judol") spam — no ready-made npm library for this, so
 *    this reimplements the same *strategy* as rusmanplatd/pemburu-komen-judol
 *    (a separate Go/React app, not something importable here): normalize the
 *    text to strip common obfuscation, then match against a curated keyword
 *    list of Indonesian gambling-spam terms.
 * 3. Duplicate-message flood — the same (or near-identical) message posted
 *    repeatedly in a short window, a common bot-spam pattern.
 *
 * This can only ever filter what OUR OWN overlays/points/commands do with a
 * message — tiktok-live-connector has no API to delete/hide a comment on
 * TikTok's own live chat. */

import badwords from "indonesian-badwords";

const JUDOL_KEYWORDS = [
  "slot gacor",
  "slot online",
  "situs slot",
  "situs judi",
  "judi online",
  "maxwin",
  "gacor hari ini",
  "rtp slot",
  "rtp live",
  "anti rungkad",
  "gampang menang",
  "wd bo",
  "bo terpercaya",
  "freebet",
  "depo 10k",
  "deposit 10rb",
  "olympus",
  "mahjong ways",
  "wild bandito",
  "scatter hitam",
  "togel online",
  "bandar togel",
  "link alternatif",
  "daftar sekarang bonus",
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsJudolSpam(text) {
  const normalized = normalize(text);
  return JUDOL_KEYWORDS.some((kw) => normalized.includes(kw));
}

// Per-token ring buffer of recent (normalized) messages, for duplicate-flood
// detection — cleared implicitly as old entries age out of the window.
const recentMessages = new Map(); // token -> [{ text, at }]
const DUPLICATE_WINDOW_MS = 20_000;
const DUPLICATE_THRESHOLD = 3;

function isDuplicateFlood(token, message) {
  const normalized = normalize(message);
  if (!normalized) return false;
  const now = Date.now();
  const history = (recentMessages.get(token) || []).filter((m) => now - m.at < DUPLICATE_WINDOW_MS);
  history.push({ text: normalized, at: now });
  recentMessages.set(token, history);
  const matches = history.filter((m) => m.text === normalized).length;
  return matches >= DUPLICATE_THRESHOLD;
}

export function clearModerationState(token) {
  recentMessages.delete(token);
}

/** Returns null if the message is clean, or a short reason string if flagged
 * by any of the settings' enabled checks. */
export function moderateChatMessage(token, settings, message) {
  if (!settings.moderation_enabled) return null;
  if (settings.moderation_badwords_enabled && badwords.flag(message)) return "kata kasar";
  if (settings.moderation_judol_enabled && containsJudolSpam(message)) return "spam judi online";
  if (settings.moderation_duplicate_enabled && isDuplicateFlood(token, message)) return "spam pesan berulang";
  return null;
}
