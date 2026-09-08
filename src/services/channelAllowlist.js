import * as db from "./db.js";

export async function isChannelAllowed(guildId, channelId) {
  if (!guildId) return true; // DMs: out of scope for Phase 1, don't block
  const allowed = await db.getAllowlist(guildId);
  return allowed.length === 0 || allowed.includes(channelId);
}
