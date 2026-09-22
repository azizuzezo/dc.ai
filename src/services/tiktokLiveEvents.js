/** Bridges real TikTok LIVE chat/gift/follow/share/like events into the same
 * SSE hub the donation overlays already use (services/donationOverlay.js),
 * keyed by overlay token instead of guildId since that's what the overlay
 * routes have on hand. Also drives every TikFinity-style feature that reacts
 * to those same events: viewer points, chat commands, Actions & Events,
 * Likeathon, and per-guild recurring Timers.
 *
 * Connections are opened lazily (only once a live-events overlay page actually
 * subscribes) and ref-counted so multiple open browser sources for the same
 * streamer share one underlying TikTok LIVE connection, then closed a short
 * grace period after the last one disconnects. */

import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";
import { logError, logInfo } from "./logger.js";
import { broadcast } from "./donationOverlay.js";
import * as db from "./db.js";
import { resolveGiftIconUrl } from "./giftIcons.js";
import { handleChatCommand } from "./chatCommands.js";
import { evaluateEvent, startTimers, stopTimers } from "./actionsEngine.js";
import { recordLikeathonLikes, resetLikeathon, startLikeathonReduction, clearLikeathonState } from "./donationTools.js";
import { moderateChatMessage, clearModerationState } from "./chatModeration.js";
import { fetchLinkPreview } from "./linkPreview.js";

const active = new Map(); // token -> { connection, refCount, disconnectTimer, guildId }
const DISCONNECT_GRACE_MS = 30_000;

function awardPointsIfEnabled(settings, guildId, user, amount) {
  if (!settings.points_enabled || !(Number(amount) > 0)) return;
  db.awardDonationPoints(guildId, user, Number(amount)).catch((err) =>
    logError(`Failed to award TikTok viewer points in guild ${guildId}:`, err)
  );
}

function attachListeners(connection, token, counts, guildId, settings) {
  connection.on(WebcastEvent.CHAT, (data) => {
    const user = data.user?.nickname || data.user?.displayId || "Seseorang";
    const message = data.content || "";

    const flagReason = moderateChatMessage(token, settings, message);
    if (flagReason) {
      db.addFlaggedChat(guildId, user, message, flagReason).catch((err) =>
        logError(`Failed to log flagged chat message in guild ${guildId}:`, err)
      );
      return;
    }

    const payload = { user, message, avatarUrl: data.user?.avatarThumb?.urlList?.[0] || null };
    broadcast(token, "chat", payload);
    awardPointsIfEnabled(settings, guildId, user, settings.points_per_chat_message);
    evaluateEvent(token, guildId, "chat", payload);
    handleChatCommand(token, guildId, settings, payload);

    if (settings.link_preview_enabled) {
      fetchLinkPreview(message).then((preview) => {
        if (preview) broadcast(token, "link-preview", { ...preview, user });
      });
    }
  });
  connection.on(WebcastEvent.GIFT, (data) => {
    // repeatEnd is 0 while a combo (e.g. spamming Rose x1) is still stacking —
    // wait for it to finish so the overlay shows one final count, not a flood.
    if (!data.repeatEnd) return;
    const user = data.user?.nickname || data.user?.displayId || "Seseorang";
    const giftName = data.gift?.name || "hadiah";
    const repeatCount = data.repeatCount || 1;
    const diamonds = (data.gift?.diamondCount || 0) * repeatCount;
    const payload = {
      user,
      giftName,
      giftImage: data.gift?.image?.urlList?.[0] || data.gift?.icon?.urlList?.[0] || resolveGiftIconUrl(giftName),
      repeatCount,
      diamonds,
    };
    broadcast(token, "gift", payload);
    awardPointsIfEnabled(settings, guildId, user, settings.points_per_coin * diamonds);
    evaluateEvent(token, guildId, "gift", payload);
  });
  connection.on(WebcastEvent.LIKE, (data) => {
    const user = data.user?.nickname || data.user?.displayId || "Seseorang";
    const count = data.count || 0;
    counts.likes += count;
    broadcast(token, "likes", { total: counts.likes });
    recordLikeathonLikes(token, user, count);
    evaluateEvent(token, guildId, "likes", { total: counts.likes });
  });
  connection.on(WebcastEvent.FOLLOW, (data) => {
    const user = data.user?.nickname || data.user?.displayId || "Seseorang";
    counts.follows += 1;
    const payload = { total: counts.follows, user };
    broadcast(token, "follow", payload);
    awardPointsIfEnabled(settings, guildId, user, settings.points_per_follow);
    evaluateEvent(token, guildId, "follow", payload);
  });
  connection.on(WebcastEvent.SHARE, (data) => {
    const user = data.user?.nickname || data.user?.displayId || "Seseorang";
    counts.shares += 1;
    const payload = { total: counts.shares, user };
    broadcast(token, "share", payload);
    awardPointsIfEnabled(settings, guildId, user, settings.points_per_share);
    evaluateEvent(token, guildId, "share", payload);
  });
  connection.on(WebcastEvent.DISCONNECTED, () => {
    active.delete(token);
    stopTimers(token);
    clearLikeathonState(token);
    clearModerationState(token);
  });
  connection.on("error", (err) => logError(`TikTok LIVE connection error (token ${token}):`, err));
}

/** settings is the guild's full bot_donation_settings row (tiktok_url, guild_id,
 * and every points/chat-command/Actions&Events/Likeathon toggle) — captured once
 * per connection, so dashboard changes take effect on the next (re)connect. */
export async function acquireLiveConnection(token, settings) {
  const entry = active.get(token);
  if (entry) {
    entry.refCount++;
    clearTimeout(entry.disconnectTimer);
    return;
  }

  const guildId = settings.guild_id;
  const connection = new TikTokLiveConnection(settings.tiktok_url, { enableExtendedGiftInfo: false });
  // Running totals for this session — TikTok's own counters reset per connection,
  // so Like Counter/Follower Count widgets show "since this overlay connected."
  const counts = { likes: 0, follows: 0, shares: 0 };
  active.set(token, { connection, refCount: 1, disconnectTimer: null, guildId });
  attachListeners(connection, token, counts, guildId, settings);

  try {
    await connection.connect();
    logInfo(`Connected to TikTok LIVE events for overlay ${token}`);
    startTimers(token, guildId);
    resetLikeathon(token);
    if (settings.likeathon_reduction_enabled) startLikeathonReduction(token, settings.likeathon_reduction_percent);
  } catch (err) {
    logError(`Failed to connect to TikTok LIVE for overlay ${token}:`, err);
    active.delete(token);
  }
}

/** One-off lookup of the account's real (lifetime) follower count, straight from
 * TikTok's room-info endpoint — no persistent WebSocket needed, just an HTTP
 * round trip (~1s). Only works while the account is actually live, same as
 * the chat/gift connection, since it has to resolve a live room ID first.
 * Returns null if the account isn't currently live or the lookup fails. */
export async function fetchTotalFollowers(tiktokUrl) {
  try {
    const connection = new TikTokLiveConnection(tiktokUrl, {});
    const info = await connection.fetchRoomInfo();
    const count = info?.data?.owner?.follow_info?.follower_count;
    return typeof count === "number" ? count : null;
  } catch (err) {
    logError(`Failed to fetch TikTok follower count for ${tiktokUrl}:`, err);
    return null;
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
      stopTimers(token);
      clearLikeathonState(token);
      clearModerationState(token);
    }
  }, DISCONNECT_GRACE_MS);
}
