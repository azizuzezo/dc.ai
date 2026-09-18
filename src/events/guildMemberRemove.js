import * as db from "../services/db.js";
import { fillTemplate, DEFAULT_LEAVE } from "../commands/welcome.js";
import { logError } from "../services/logger.js";

export async function execute(member) {
  try {
    const settings = await db.getWelcomeSettings(member.guild.id);
    if (!settings.leave_channel_id) return;
    const channel = await member.guild.channels.fetch(settings.leave_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;
    await channel.send(fillTemplate(settings.leave_message ?? DEFAULT_LEAVE, member)).catch(() => {});
  } catch (err) {
    logError(`Failed to send leave message in guild ${member.guild.id}:`, err);
  }
}
