import * as db from "../services/db.js";
import { fillTemplate, DEFAULT_WELCOME } from "../commands/welcome.js";
import { logError } from "../services/logger.js";

export async function execute(member) {
  try {
    const settings = await db.getWelcomeSettings(member.guild.id);
    if (!settings.welcome_channel_id) return;
    const channel = await member.guild.channels.fetch(settings.welcome_channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;
    await channel.send(fillTemplate(settings.welcome_message ?? DEFAULT_WELCOME, member)).catch(() => {});
  } catch (err) {
    logError(`Failed to send welcome message in guild ${member.guild.id}:`, err);
  }
}
