import { awardMessageXp } from "../services/leveling.js";
import { logError } from "../services/logger.js";

// AI chat only responds to /chat now — @mention-triggered replies were
// removed (they were the one path that visibly double-replied during a
// Railway deploy overlap, since unlike slash-command interactions a plain
// message has no single-winner ack to dedupe two connected instances).
export async function execute(message) {
  if (message.author.bot) return;
  if (!message.guildId) return; // DMs out of scope for Phase 1

  try {
    const levelUp = await awardMessageXp(message.guildId, message.author.id);
    if (levelUp) {
      await message.channel
        .send(`🎉 GG ${message.author}, kamu naik ke **level ${levelUp.level}**!`)
        .catch(() => {});
    }
  } catch (err) {
    logError("Failed to award message XP:", err);
  }
}
