import { TikTokLiveConnection } from "tiktok-live-connector";
import * as db from "./db.js";
import { logError } from "./logger.js";

export function normalizeTiktokUsername(raw) {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

async function isLive(username) {
  const connection = new TikTokLiveConnection(username, {});
  return connection.fetchIsLive();
}

export async function sweepTiktokLive(client) {
  let watches;
  try {
    watches = await db.listAllTiktokWatches();
  } catch (err) {
    logError("Failed to fetch TikTok watches:", err);
    return;
  }

  for (const watch of watches) {
    let live;
    try {
      live = await isLive(watch.tiktok_username);
    } catch (err) {
      logError(`Failed to check TikTok live status for @${watch.tiktok_username}:`, err);
      continue;
    }

    if (live === watch.is_live) continue;

    try {
      await db.setTiktokWatchLiveState(watch.id, live);
    } catch (err) {
      logError(`Failed to update TikTok watch ${watch.id}:`, err);
    }

    if (!live) continue;

    try {
      const channel = await client.channels.fetch(watch.channel_id);
      if (channel?.isTextBased()) {
        await channel.send(
          `🔴 **@${watch.tiktok_username}** is live on TikTok! https://www.tiktok.com/@${watch.tiktok_username}/live`
        );
      }
    } catch (err) {
      logError(`Failed to notify TikTok live for @${watch.tiktok_username}:`, err);
    }
  }
}

export function startTiktokLiveSweep(client, intervalMs = 60_000) {
  const timer = setInterval(() => {
    sweepTiktokLive(client).catch((err) => logError("TikTok live sweep failed:", err));
  }, intervalMs);
  timer.unref?.();
  return timer;
}
