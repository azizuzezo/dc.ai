/** Bridges real TikTok LIVE chat/gift events into the same SSE hub the donation
 * overlays already use (services/donationOverlay.js), keyed by overlay token
 * instead of guildId since that's what the overlay routes have on hand.
 *
 * Connections are opened lazily (only once a Chat or Gift overlay page actually
 * subscribes) and ref-counted so multiple open browser sources for the same
 * streamer share one underlying TikTok LIVE connection, then closed a short
 * grace period after the last one disconnects. */

import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import { logError, logInfo } from "./logger.js";
import { broadcast } from "./donationOverlay.js";

const active = new Map(); // token -> { connection, refCount, disconnectTimer }
const DISCONNECT_GRACE_MS = 30_000;

function attachListeners(connection, token, counts) {
  connection.on(WebcastEvent.CHAT, (data) => {
    broadcast(token, "chat", {
      user: data.user?.nickname || data.user?.displayId || "Seseorang",
      message: data.content || "",
    });
  });
  connection.on(WebcastEvent.GIFT, (data) => {
    // repeatEnd is 0 while a combo (e.g. spamming Rose x1) is still stacking —
    // wait for it to finish so the overlay shows one final count, not a flood.
    if (!data.repeatEnd) return;
    broadcast(token, "gift", {
      user: data.user?.nickname || data.user?.displayId || "Seseorang",
      giftName: data.gift?.name || "hadiah",
      giftImage: data.gift?.image?.urlList?.[0] || data.gift?.icon?.urlList?.[0] || null,
      repeatCount: data.repeatCount || 1,
    });
  });
  connection.on(WebcastEvent.LIKE, (data) => {
    counts.likes += data.count || 0;
    broadcast(token, "likes", { total: counts.likes });
  });
  connection.on(WebcastEvent.FOLLOW, (data) => {
    counts.follows += 1;
    broadcast(token, "follow", {
      total: counts.follows,
      user: data.user?.nickname || data.user?.displayId || "Seseorang",
    });
  });
  connection.on(WebcastEvent.DISCONNECTED, () => {
    active.delete(token);
  });
  connection.on("error", (err) => logError(`TikTok LIVE connection error (token ${token}):`, err));
}

export async function acquireLiveConnection(token, tiktokUrl) {
  const entry = active.get(token);
  if (entry) {
    entry.refCount++;
    clearTimeout(entry.disconnectTimer);
    return;
  }

  const connection = new TikTokLiveConnection(tiktokUrl, { enableExtendedGiftInfo: false });
  // Running totals for this session — TikTok's own counters reset per connection,
  // so Like Counter/Follower Count widgets show "since this overlay connected."
  const counts = { likes: 0, follows: 0 };
  active.set(token, { connection, refCount: 1, disconnectTimer: null });
  attachListeners(connection, token, counts);

  try {
    await connection.connect();
    logInfo(`Connected to TikTok LIVE events for overlay ${token}`);
  } catch (err) {
    logError(`Failed to connect to TikTok LIVE for overlay ${token}:`, err);
    active.delete(token);
  }
}

export function releaseLiveConnection(token) {
  const entry = active.get(token);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount > 0) return;

  entry.disconnectTimer = setTimeout(() => {
    const current = active.get(token);
    if (current && current.refCount <= 0) {
      current.connection.disconnect().catch(() => {});
      active.delete(token);
    }
  }, DISCONNECT_GRACE_MS);
}
