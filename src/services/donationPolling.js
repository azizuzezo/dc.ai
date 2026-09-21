import { EmbedBuilder } from "discord.js";
import * as db from "./db.js";
import { checkPayment } from "./gopayGateway.js";
import { broadcast } from "./donationOverlay.js";
import { synthesizeSpeech } from "./geminiTts.js";
import { storeAudio } from "./ttsCache.js";
import { logError } from "./logger.js";

/** Pushes a donation to the overlay (+ Discord, unless toDiscord is false). Used by the real payment sweep and by the admin dashboard's test/replay button. */
export async function announceDonation(client, settings, donation, { toDiscord = true } = {}) {
  // Started first, not awaited yet, so its ~5s round trip to Gemini overlaps
  // with the Discord post + leaderboard query below instead of adding to them.
  const ttsPromise = settings.tts_enabled
    ? synthesizeSpeech(
        `${donation.donor_name} berdonasi Rp${Number(donation.amount).toLocaleString("id-ID")}` +
          (donation.message ? `. ${donation.message}` : "")
      ).catch((err) => {
        logError(`TTS generation failed for guild ${donation.guild_id}:`, err);
        return null;
      })
    : Promise.resolve(null);

  if (toDiscord && client && settings.alert_channel_id) {
    try {
      const channel = await client.channels.fetch(settings.alert_channel_id);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("💸 Donasi baru!")
          .setDescription(
            `**${donation.donor_name}** mengirim **Rp${Number(donation.amount).toLocaleString("id-ID")}**` +
              (donation.message ? `\n> ${donation.message}` : "")
          )
          .setColor(0x00c896)
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      }
    } catch (err) {
      logError(`Failed to post donation alert for guild ${donation.guild_id}:`, err);
    }
  }

  broadcast(settings.overlay_token, "donation", {
    donorName: donation.donor_name,
    amount: donation.amount,
    message: donation.message,
    sound: settings.sound_enabled,
  });

  if (settings.leaderboard_enabled) {
    try {
      const leaderboard = await db.getDonationLeaderboard(donation.guild_id, 10);
      broadcast(settings.overlay_token, "leaderboard", { leaderboard });
    } catch (err) {
      logError(`Failed to refresh donation leaderboard for guild ${donation.guild_id}:`, err);
    }
  }

  // Not awaited: letting this resolve on its own keeps the sweep loop (and
  // the admin dashboard's test/replay button) from sitting idle for ~5s.
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
