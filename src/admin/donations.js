import * as db from "../services/db.js";
import { layout } from "./layout.js";

const SLUG_PATTERN = /^[a-z0-9-]{3,32}$/;
const RESERVED_SLUGS = new Set(["status"]);

function baseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

export async function handleDonationSettingsPage(req, res, error) {
  const { guildId } = req.params;
  const settings = await db.ensureDonationSettings(guildId);
  const donateUrl = `${baseUrl(req)}/donate/${settings.slug || guildId}`;
  const overlayUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}`;
  const leaderboardUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}/leaderboard`;

  res.send(
    layout(`
      <h2>Donation Settings — ${guildId}</h2>
      <p>Butuh instance <a href="https://github.com" target="_blank" rel="noreferrer">gopay-api-gateaway</a> yang jalan sendiri (lihat docs/donations.md).</p>
      ${error ? `<p style="color:#f66">⚠️ ${error}</p>` : ""}
      <form method="post" action="/guilds/${guildId}/donations">
        <label>Custom link (opsional — huruf kecil/angka/strip, 3-32 karakter)<br/>
          <input type="text" name="slug" value="${settings.slug || ""}" placeholder="nama-kamu" pattern="[a-z0-9-]{3,32}" style="width:100%" />
        </label><br/><br/>
        <label>Judul halaman donasi (opsional)<br/>
          <input type="text" name="displayName" value="${settings.display_name || ""}" placeholder="Dukung DuaCincin Live" maxlength="60" style="width:100%" />
        </label><br/><br/>
        <label>Deskripsi/bio singkat (opsional)<br/>
          <textarea name="description" maxlength="200" rows="2" style="width:100%">${settings.description || ""}</textarea>
        </label><br/><br/>
        <label>Gateway URL<br/>
          <input type="url" name="gatewayUrl" value="${settings.gateway_url || ""}" placeholder="https://gateway-kamu.example.com" style="width:100%" />
        </label><br/><br/>
        <label>Gateway API Key<br/>
          <input type="text" name="gatewayApiKey" value="${settings.gateway_api_key || ""}" style="width:100%" />
        </label><br/><br/>
        <label>Alert channel ID (klik kanan channel Discord → Copy Channel ID)<br/>
          <input type="text" name="alertChannelId" value="${settings.alert_channel_id || ""}" style="width:100%" />
        </label><br/><br/>
        <label>Minimal donasi (Rp)<br/>
          <input type="number" name="minAmount" value="${settings.min_amount}" min="1000" step="500" />
        </label><br/><br/>
        <label><input type="checkbox" name="ttsEnabled" ${settings.tts_enabled ? "checked" : ""} /> Text-to-speech baca pesan donasi</label><br/>
        <label><input type="checkbox" name="soundEnabled" ${settings.sound_enabled ? "checked" : ""} /> Bunyi notifikasi saat alert muncul</label><br/>
        <label><input type="checkbox" name="leaderboardEnabled" ${settings.leaderboard_enabled ? "checked" : ""} /> Leaderboard top donatur</label><br/><br/>
        <button type="submit">Save</button>
      </form>
      <form method="post" action="/guilds/${guildId}/donations/regenerate-token" style="margin-top:8px">
        <button type="submit">Regenerate overlay link</button>
      </form>
      <hr/>
      <p><b>Link donasi</b> (share ke bio TikTok/Instagram):<br/><a href="${donateUrl}">${donateUrl}</a></p>
      <p><b>Overlay alert</b> (Browser Source di OBS/TikTok Live Studio, background transparan):<br/><a href="${overlayUrl}">${overlayUrl}</a></p>
      ${
        settings.leaderboard_enabled
          ? `<p><b>Leaderboard widget</b> (Browser Source terpisah, opsional):<br/><a href="${leaderboardUrl}">${leaderboardUrl}</a></p>`
          : ""
      }
      <p><a href="/guilds">Back to guilds</a></p>
    `)
  );
}

export async function handleDonationSettingsUpdate(req, res) {
  const { guildId } = req.params;
  await db.ensureDonationSettings(guildId);

  const rawSlug = req.body.slug?.trim().toLowerCase() || "";
  let slug = rawSlug || null;
  if (slug) {
    if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
      return handleDonationSettingsPage(req, res, "Custom link tidak valid — huruf kecil/angka/strip saja, 3-32 karakter.");
    }
    const existing = await db.getDonationSettingsBySlug(slug);
    if (existing && existing.guild_id !== guildId) {
      return handleDonationSettingsPage(req, res, "Custom link itu sudah dipakai server lain, coba yang lain.");
    }
  }

  try {
    await db.updateDonationSettings(guildId, {
      slug,
      display_name: req.body.displayName?.trim().slice(0, 60) || null,
      description: req.body.description?.trim().slice(0, 200) || null,
      gateway_url: req.body.gatewayUrl?.trim() || null,
      gateway_api_key: req.body.gatewayApiKey?.trim() || null,
      alert_channel_id: req.body.alertChannelId?.trim() || null,
      min_amount: Number(req.body.minAmount) || 5000,
      tts_enabled: req.body.ttsEnabled === "on",
      sound_enabled: req.body.soundEnabled === "on",
      leaderboard_enabled: req.body.leaderboardEnabled === "on",
    });
  } catch (err) {
    if (err?.code === "23505") {
      return handleDonationSettingsPage(req, res, "Custom link itu sudah dipakai server lain, coba yang lain.");
    }
    throw err;
  }
  res.redirect(`/guilds/${guildId}/donations`);
}

export async function handleRegenerateOverlayToken(req, res) {
  const { guildId } = req.params;
  await db.ensureDonationSettings(guildId);
  await db.regenerateOverlayToken(guildId);
  res.redirect(`/guilds/${guildId}/donations`);
}
