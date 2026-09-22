/** TikTok LIVE chat commands (TikFinity's !help/!score/!send/!get/!spin).
 *
 * Important platform limitation: TikFinity replies directly inside TikTok's
 * own live chat. tiktok-live-connector has no write/reply API for live
 * comments (it's receive-only), so that's not possible here — results are
 * instead pushed to a dedicated "Command Response" OBS overlay
 * (/overlay/:token/commands) that the host adds as a browser source. */

import * as db from "./db.js";
import { broadcast } from "./donationOverlay.js";
import { claimPointsDrop, spinWheel } from "./donationTools.js";
import { getManager } from "./lavalink.js";
import { logError } from "./logger.js";

const DEFAULT_TRIGGERS = { help: "!help", score: "!score", send: "!send", get: "!get", spin: "!spin", play: "!play" };

function respond(token, text) {
  broadcast(token, "command-response", { text });
}

/** guildId here is the Discord guild ID (for points/Lavalink lookups) — distinct from the overlay token used for broadcasting. */
export async function handleChatCommand(token, guildId, settings, { user, message }) {
  if (!settings.chat_commands_enabled) return;
  const triggers = { ...DEFAULT_TRIGGERS, ...(settings.chat_commands_config || {}) };
  const text = (message || "").trim();
  const lower = text.toLowerCase();
  const currency = settings.points_currency_name || "Poin";

  try {
    if (lower === triggers.help.toLowerCase()) {
      respond(token, `Perintah: ${triggers.score} · ${triggers.send} @user jumlah · ${triggers.get} · ${triggers.spin}`);
      return;
    }

    if (lower === triggers.score.toLowerCase()) {
      const points = await db.getDonationPoints(guildId, user);
      respond(token, `${user}: ${points} ${currency}`);
      return;
    }

    if (lower.startsWith(`${triggers.send.toLowerCase()} `)) {
      const rest = text.slice(triggers.send.length).trim();
      const match = rest.match(/^@?(\S+)\s+(\d+)$/);
      if (!match) return;
      const [, targetUser, amountStr] = match;
      const result = await db.transferDonationPoints(guildId, user, targetUser, Number(amountStr));
      respond(
        token,
        result.ok
          ? `${user} mengirim ${amountStr} ${currency} ke ${targetUser}`
          : `${user} gagal kirim poin (${result.reason === "insufficient_points" ? "poin gak cukup" : "jumlah gak valid"})`
      );
      return;
    }

    if (lower === triggers.get.toLowerCase()) {
      const bonus = claimPointsDrop(token, user);
      if (bonus) {
        await db.awardDonationPoints(guildId, user, bonus);
        respond(token, `${user} klaim Points Drop +${bonus} ${currency}!`);
      }
      return;
    }

    if (lower === triggers.spin.toLowerCase()) {
      const result = spinWheel(token, settings.wheel_config);
      if (result) respond(token, `${user} muter wheel: ${result}!`);
      return;
    }

    if (lower.startsWith(`${triggers.play.toLowerCase()} `)) {
      const query = text.slice(triggers.play.length).trim();
      if (!query) return;
      const manager = getManager();
      const player = manager?.getPlayer(guildId);
      if (!player || !player.connected) {
        respond(token, `${user}: bot musik belum gabung voice channel.`);
        return;
      }
      const result = await player.search(query, null);
      if (!result?.tracks?.length) {
        respond(token, `${user}: lagu "${query}" gak ketemu.`);
        return;
      }
      const track = result.tracks[0];
      player.queue.add(track);
      if (!player.playing && !player.paused) await player.play();
      respond(token, `${user} request lagu: ${track.info.title}`);
    }
  } catch (err) {
    logError(`chatCommands.handleChatCommand failed for guild ${guildId}:`, err);
  }
}
