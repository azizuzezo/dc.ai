import { EmbedBuilder } from "discord.js";
import * as db from "./db.js";
import { checkPayment } from "./gopayGateway.js";
import { broadcast } from "./donationOverlay.js";
import { synthesizeSpeech } from "./geminiTts.js";
import { synthesizeSpeechLocal } from "./piperTts.js";
import { storeAudio } from "./ttsCache.js";
import { censorMessage } from "./chatModeration.js";
import { logError } from "./logger.js";

/** Pushes a donation to the overlay (+ Discord, unless toDiscord is false). Used by the real payment sweep and by the admin dashboard's test/replay button. */
export async function announceDonation(client, settings, donation, { toDiscord = true } = {}) {
  let wishlistItem = null;
  if (donation.wishlist_item_id) {
    try {
      wishlistItem = await db.getWishlistItem(donation.guild_id, donation.wishlist_item_id);
    } catch (err) {
      logError(`Failed to load wishlist item for guild ${donation.guild_id}:`, err);
    }
  }

  // A donation is a real payment — unlike TikTok chat there's nothing to hide it
  // behind, so profanity in the donor's own message gets starred out instead
  // (see services/chatModeration.js) rather than blocking the announcement.
  const message = censorMessage(settings, donation.message);

  const amountText = `Rp${Number(donation.amount).toLocaleString("id-ID")}`;
  const narration = wishlistItem
    ? `${amountText} dari ${donation.donor_name}, patungan ke wishlist ${wishlistItem.title}.` +
      (message ? ` Kata ${donation.donor_name}, ${message}` : "")
    : `${amountText} dari ${donation.donor_name}` + (message ? `. ${message}` : "");

  // Started first, not awaited yet, so its ~5-7s round trip to Gemini overlaps
  // with the Discord post + leaderboard query below instead of adding to them.
  // Gemini gives the warmest read when its quota is available; if it's out (or
  // fails for any other reason), this falls back to the locally-bundled Piper
  // voice, which has no quota and no dependency on the viewer's browser.
  const ttsPromise = settings.tts_enabled
    ? synthesizeSpeech(
        "Bacakan dengan nada hangat, lembut, dan penuh kasih sayang seperti sedang menyapa penonton live streaming: " +
          narration
      )
        .catch((err) => {
          logError(`Gemini TTS failed for guild ${donation.guild_id}:`, err);
          return null;
        })
        .then((audio) => audio || synthesizeSpeechLocal(narration))
    : Promise.resolve(null);

  if (toDiscord && client && settings.alert_channel_id) {
    try {
      const channel = await client.channels.fetch(settings.alert_channel_id);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("🎉 Ada yang patungan nih!")
          .setDescription(
            `**${amountText}** dari **${donation.donor_name}**` +
              (wishlistItem ? ` (buat wishlist **${wishlistItem.title}**)` : "") +
              (message ? `\n> ${message}` : "")
          )
          .setColor(0x00c896)
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      logError(`Failed to post donation alert for guild ${donation.guild_id}:`, err);
    }
  }

  let alertTier = null;
  try {
    alertTier = await db.resolveAlertTier(donation.guild_id, donation.amount);
  } catch (err) {
    logError(`Failed to resolve alert tier for guild ${donation.guild_id}:`, err);
  }

  broadcast(settings.overlay_token, "donation", {
    donorName: donation.donor_name,
    amount: donation.amount,
    message,
    wishlistTitle: wishlistItem?.title || null,
    youtubeVideoId: donation.youtube_video_id || null,
    youtubeStart: donation.youtube_start_seconds ?? null,
    youtubeEnd: donation.youtube_end_seconds ?? null,
    sound: settings.sound_enabled,
    narration: settings.tts_enabled ? narration : null,
    tierImage: alertTier?.image_url || null,
    tierEffect: alertTier?.effect || "none",
  });

  if (settings.leaderboard_enabled) {
    try {
      const leaderboard = await db.getDonationLeaderboard(donation.guild_id, 10);
      broadcast(settings.overlay_token, "leaderboard", { leaderboard });
    } catch (err) {
      logError(`Failed to refresh donation leaderboard for guild ${donation.guild_id}:`, err);
    }
  }

  try {
    const items = await db.listWishlistItemsWithProgress(donation.guild_id);
    if (items.length) broadcast(settings.overlay_token, "wishlist", { items });
  } catch (err) {
    logError(`Failed to refresh wishlist progress for guild ${donation.guild_id}:`, err);
  }

  // Not awaited: letting this resolve on its own keeps the sweep loop (and
  // the admin dashboard's test/replay button) from sitting idle for ~5-7s.
  ttsPromise.then((audio) => {
    if (audio) broadcast(settings.overlay_token, "tts", { url: `/overlay/audio/${storeAudio(audio)}` });
  });
}

export async function sweepPendingDonations(client) {
  let pending;
  try {
    pending = await db.listPendingDonations();
  } catch (err) {
    logError("Failed to fetch pending donations:", err);
    return;
  }

  const settingsCache = new Map();
  for (const donation of pending) {
    if (donation.expires_at && new Date(donation.expires_at) < new Date()) {
      try {
        await db.markDonationExpired(donation.trx_id);
      } catch (err) {
        logError(`Failed to expire donation ${donation.trx_id}:`, err);
      }
      continue;
    }

    if (!settingsCache.has(donation.guild_id)) {
      let settings = null;
      try {
        settings = await db.getDonationSettings(donation.guild_id);
      } catch (err) {
        logError(`Failed to fetch donation settings for guild ${donation.guild_id}:`, err);
      }
      settingsCache.set(donation.guild_id, settings);
    }
    const settings = settingsCache.get(donation.guild_id);
    if (!settings?.gateway_url || !settings?.gateway_api_key) continue;

    try {
      const result = await checkPayment({
        baseUrl: settings.gateway_url,
        apiKey: settings.gateway_api_key,
        amount: donation.amount,
        trxId: donation.trx_id,
      });
      if (!result?.paid) continue;

      await db.markDonationPaid(donation.trx_id);
      await announceDonation(client, settings, donation);
    } catch (err) {
      logError(`Failed to check payment for donation ${donation.trx_id}:`, err);
    }
  }
}

export function startDonationPolling(client, intervalMs = 15_000) {
  const timer = setInterval(() => {
    sweepPendingDonations(client).catch((err) => logError("Donation polling sweep failed:", err));
  }, intervalMs);
  timer.unref?.();
  return timer;
}
