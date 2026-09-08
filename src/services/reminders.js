import * as db from "./db.js";
import { logError } from "./logger.js";

export async function sweepDueReminders(client) {
  let due;
  try {
    due = await db.getDueReminders();
  } catch (err) {
    logError("Failed to fetch due reminders:", err);
    return;
  }

  for (const reminder of due) {
    try {
      const channel = await client.channels.fetch(reminder.channel_id);
      if (channel?.isTextBased()) {
        await channel.send(`⏰ <@${reminder.user_id}> reminder: ${reminder.message}`);
      }
    } catch (err) {
      logError(`Failed to deliver reminder ${reminder.id}:`, err);
    } finally {
      try {
        await db.markReminderDelivered(reminder.id);
      } catch (err) {
        logError(`Failed to mark reminder ${reminder.id} delivered:`, err);
      }
    }
  }
}

export function startReminderSweep(client, intervalMs = 30_000) {
  const timer = setInterval(() => {
    sweepDueReminders(client).catch((err) => logError("Reminder sweep failed:", err));
  }, intervalMs);
  timer.unref?.();
  return timer;
}
