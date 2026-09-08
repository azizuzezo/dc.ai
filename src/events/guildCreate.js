import * as db from "../services/db.js";
import { logInfo, logError } from "../services/logger.js";

export async function execute(guild) {
  logInfo(`Joined guild: ${guild.name} (${guild.id})`);
  try {
    await db.upsertGuild(guild.id, guild.name);
  } catch (err) {
    logError("Failed to upsert guild on join:", err);
  }
}
