import * as db from "./db.js";

const CACHE_TTL_MS = 30_000;
const cache = new Map(); // guildId -> { entries, expiresAt }

async function loadKnowledge(guildId) {
  const cached = cache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.entries;

  const entries = await db.listKnowledge(guildId);
  cache.set(guildId, { entries, expiresAt: Date.now() + CACHE_TTL_MS });
  return entries;
}

/**
 * Concatenates every knowledge entry verbatim into one prompt block — no
 * retrieval/ranking, mirrors CSPORTAL's approach (works for a small,
 * curated knowledge base; not meant for large document corpora).
 */
export function formatForPrompt(entries) {
  if (!entries || entries.length === 0) return "";
  const body = entries.map((e) => `## ${e.title}\n${e.content}`).join("\n\n");
  return `Here is this server's internal knowledge base. Use it as your primary reference when relevant:\n\n${body}`;
}

/** Returns the formatted knowledge block for a guild, or "" if it has none. */
export async function getKnowledgeBlock(guildId) {
  if (!guildId) return "";
  const entries = await loadKnowledge(guildId);
  return formatForPrompt(entries);
}

/** Forces the next getKnowledgeBlock() call to hit the DB instead of serving
 * a stale cached copy — used right after the AI trainer adds a new directive
 * (see aiChatPipeline.js) so it takes effect on the very next message instead
 * of waiting out the normal 30s TTL. */
export function invalidateKnowledgeCache(guildId) {
  cache.delete(guildId);
}
