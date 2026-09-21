import * as db from "../services/db.js";
import { announceDonation } from "../services/donationPolling.js";
import { layout, guildTabs, crumbs } from "./layout.js";
import { escapeHtml } from "./htmlEscape.js";

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
  const recent = await db.listRecentPaidDonations(guildId, 10);

  const recentRows = recent
    .map(
      (d) => `<tr>
        <td>${escapeHtml(d.donor_name)}</td>
        <td>Rp${Number(d.amount).toLocaleString("id-ID")}</td>
        <td>${escapeHtml(d.message || "")}</td>
        <td>${d.paid_at ? new Date(d.paid_at).toLocaleString("id-ID") : ""}</td>
        <td><form method="post" action="/guilds/${guildId}/donations/replay/${d.trx_id}">
          <button type="submit" class="btn-sm">Replay</button></form></td>
      </tr>`
    )
    .join("");

  res.send(
    layout(
      `
      ${crumbs(guildId)}
      <h1>Donations</h1>
      ${guildTabs(guildId, "donations")}
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
      <p class="lede">Needs a self-hosted
        <a href="https://github.com" target="_blank" rel="noreferrer">gopay-api-gateaway</a> instance
        (see <code>docs/donations.md</code>).</p>

      <form class="card" method="post" action="/guilds/${guildId}/donations">
        <label for="slug">Custom link</label>
        <input id="slug" type="text" name="slug" value="${escapeHtml(settings.slug || "")}" placeholder="nama-kamu" pattern="[a-z0-9-]{3,32}" />
        <p class="hint">Lowercase letters/numbers/hyphens, 3-32 characters.</p>

        <label for="displayName">Page title</label>
        <input id="displayName" type="text" name="displayName" value="${escapeHtml(settings.display_name || "")}" placeholder="Dukung DuaCincin Live" maxlength="60" />

        <label for="description">Bio</label>
        <textarea id="description" name="description" maxlength="200" rows="2">${escapeHtml(settings.description || "")}</textarea>

        <label for="gatewayUrl">Gateway URL</label>
        <input id="gatewayUrl" type="url" name="gatewayUrl" value="${escapeHtml(settings.gateway_url || "")}" placeholder="https://gateway-kamu.example.com" />

        <label for="gatewayApiKey">Gateway API Key</label>
        <input id="gatewayApiKey" type="text" name="gatewayApiKey" value="${escapeHtml(settings.gateway_api_key || "")}" />

        <label for="alertChannelId">Alert channel ID</label>
        <input id="alertChannelId" type="text" name="alertChannelId" value="${escapeHtml(settings.alert_channel_id || "")}" />
        <p class="hint">Right-click a Discord channel → Copy Channel ID.</p>

        <label for="minAmount">Minimum donation (Rp)</label>
        <input id="minAmount" type="number" name="minAmount" value="${settings.min_amount}" min="1000" step="500" />

        <label class="checkbox-row"><input type="checkbox" name="ttsEnabled" ${settings.tts_enabled ? "checked" : ""} /> Text-to-speech reads the message aloud</label>
        <label class="checkbox-row"><input type="checkbox" name="soundEnabled" ${settings.sound_enabled ? "checked" : ""} /> Play a chime when the alert appears</label>
        <label class="checkbox-row"><input type="checkbox" name="leaderboardEnabled" ${settings.leaderboard_enabled ? "checked" : ""} /> Top-donator leaderboard widget</label>

        <div class="actions">
          <button type="submit" class="btn-primary">Save</button>
        </div>
      </form>

      <form method="post" action="/guilds/${guildId}/donations/regenerate-token" style="margin-top:10px">
        <button type="submit" class="btn-sm">Regenerate overlay link</button>
      </form>

      <h2>Links</h2>
      <div class="card">
        <label>Donate link <span class="hint">(share in your TikTok/Instagram bio)</span></label>
        <p class="mono" style="word-break:break-all"><a href="${donateUrl}">${donateUrl}</a></p>
        <label>Overlay alert <span class="hint">(Browser Source in OBS/TikTok Live Studio, transparent background)</span></label>
        <p class="mono" style="word-break:break-all"><a href="${overlayUrl}">${overlayUrl}</a></p>
        ${
          settings.leaderboard_enabled
            ? `<label>Leaderboard widget <span class="hint">(optional separate Browser Source)</span></label>
               <p class="mono" style="word-break:break-all"><a href="${leaderboardUrl}">${leaderboardUrl}</a></p>`
            : ""
        }
      </div>

      <h2>Test alert</h2>
      <p class="lede">Fires the overlay directly to check positioning in OBS/TikTok Live Studio. Doesn't post to Discord or count toward the leaderboard.</p>
      <form class="card" method="post" action="/guilds/${guildId}/donations/test-alert">
        <label for="testDonorName">Name</label>
        <input id="testDonorName" type="text" name="donorName" placeholder="Test Donatur" />
        <label for="testAmount">Amount</label>
        <input id="testAmount" type="number" name="amount" placeholder="10000" min="1" />
        <label for="testMessage">Message</label>
        <input id="testMessage" type="text" name="message" placeholder="(optional)" />
        <div class="actions"><button type="submit" class="btn-primary">Trigger test alert</button></div>
      </form>

      <h2>Recent donations</h2>
      ${
        recent.length
          ? `<table><tr><th>Name</th><th>Amount</th><th>Message</th><th>Paid</th><th></th></tr>${recentRows}</table>`
          : `<div class="empty">No donations yet.</div>`
      }
    `,
      { active: "guilds" }
    )
  );
}

export async function handleDonationSettingsUpdate(req, res) {
  const { guildId } = req.params;
  await db.ensureDonationSettings(guildId);

  const rawSlug = req.body.slug?.trim().toLowerCase() || "";
  let slug = rawSlug || null;
  if (slug) {
    if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
      return handleDonationSettingsPage(req, res, "Custom link tidak valid, huruf kecil/angka/strip saja, 3-32 karakter.");
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

export async function handleTestAlert(req, res) {
  const { guildId } = req.params;
  const settings = await db.ensureDonationSettings(guildId);
  await announceDonation(
    null,
    settings,
    {
      guild_id: guildId,
      donor_name: req.body.donorName?.trim().slice(0, 40) || "Test Donatur",
      amount: Number(req.body.amount) || 10000,
      message: req.body.message?.trim().slice(0, 200) || null,
    },
    { toDiscord: false }
  );
  res.redirect(`/guilds/${guildId}/donations`);
}

export async function handleReplayDonation(req, res) {
  const { guildId, trxId } = req.params;
  const settings = await db.ensureDonationSettings(guildId);
  const donation = await db.getDonationByTrxId(trxId);
  if (donation && donation.guild_id === guildId) {
    await announceDonation(null, settings, donation, { toDiscord: false });
  }
  res.redirect(`/guilds/${guildId}/donations`);
}
