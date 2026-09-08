import { logInfo, logError } from "../services/logger.js";
import * as db from "../services/db.js";
import { startReminderSweep } from "../services/reminders.js";

export const once = true;

export async function execute(client) {
  logInfo(`Logged in as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    try {
      await db.upsertGuild(guild.id, guild.name);
    } catch (err) {
      logError(`Failed to upsert guild ${guild.id} on ready:`, err);
    }
  }
  startReminderSweep(client);
}
