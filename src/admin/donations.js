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
  const wishlistWidgetUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}/wishlist`;
  const recent = await db.listRecentPaidDonations(guildId, 10);
  const wishlistItems = await db.listWishlistItemsWithProgress(guildId);

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

      <h2>Overlay avatar</h2>
      <p class="lede">Shown in the center of the alert overlay instead of the default 🙏 icon. PNG/JPG/WebP/GIF, up to 2MB.</p>
      <div class="card">
        ${
          settings.avatar_data
            ? `<img src="/overlay/${settings.overlay_token}/avatar" alt="Current avatar"
                 style="width:72px;height:72px;border-radius:50%;object-fit:cover;display:block;margin-bottom:14px" />`
            : ""
        }
        <form method="post" action="/guilds/${guildId}/donations/avatar" enctype="multipart/form-data">
          <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" required />
          <div class="actions"><button type="submit" class="btn-primary">Upload</button></div>
        </form>
        ${
          settings.avatar_data
            ? `<form method="post" action="/guilds/${guildId}/donations/avatar/delete" style="margin-top:8px">
                 <button type="submit" class="btn-danger btn-sm">Remove avatar</button></form>`
            : ""
        }
      </div>

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
        ${
          wishlistItems.length
            ? `<label>Wishlist widget <span class="hint">(optional separate Browser Source)</span></label>
               <p class="mono" style="word-break:break-all"><a href="${wishlistWidgetUrl}">${wishlistWidgetUrl}</a></p>`
            : ""
        }
      </div>

      <h2>Wishlist</h2>
      <p class="lede">Milestone goals donors can pool toward (e.g. "Wisuda", "Penunjang Live"). Shown on the donate page and, once you have at least one, at the widget link above.</p>
      ${
        wishlistItems.length
          ? `<table><tr><th>Title</th><th>Progress</th><th></th></tr>${wishlistItems
              .map((w) => {
                const pct = Math.min(100, Math.round((w.total / w.target_amount) * 100));
                return `<tr>
                  <td>${escapeHtml(w.title)}</td>
                  <td>Rp${w.total.toLocaleString("id-ID")} / Rp${Number(w.target_amount).toLocaleString("id-ID")} (${pct}%)</td>
                  <td><form method="post" action="/guilds/${guildId}/donations/wishlist/${w.id}/delete">
                    <button type="submit" class="btn-danger btn-sm">Delete</button></form></td>
                </tr>`;
              })
              .join("")}</table>`
          : `<div class="empty">No wishlist items yet.</div>`
      }
      <form class="card" method="post" action="/guilds/${guildId}/donations/wishlist" style="margin-top:12px">
        <label for="wishlistTitle">Title</label>
        <input id="wishlistTitle" type="text" name="title" placeholder="Wisuda" maxlength="60" required />
        <label for="wishlistTarget">Target amount (Rp)</label>
        <input id="wishlistTarget" type="number" name="targetAmount" min="1000" step="1000" required />
        <div class="actions"><button type="submit" class="btn-primary">Add wishlist item</button></div>
      </form>

      <h2>Test alert</h2>
      <p class="lede">Fires the overlay directly to check positioning in OBS/TikTok Live Studio. Doesn't post to Discord or count toward the leaderboard.</p>
      <form class="card" method="post" action="/guilds/${guildId}/donations/test-alert">
        <label for="testDonorName">Name</label>
        <input id="testDonorName" type="text" name="donorName" placeholder="Test Donatur" />
        <label for="testAmount">Amount</label>
        <input id="testAmount" type="number" name="amount" placeholder="10000" min="1" />
        <label for="testMessage">Message</label>
        <input id="testMessage" type="text" name="message" placeholder="(optional)" />
        ${
          wishlistItems.length
            ? `<label for="testWishlistItemId">Wishlist item</label>
               <select id="testWishlistItemId" name="wishlistItemId">
                 <option value="">(none)</option>
                 ${wishlistItems.map((w) => `<option value="${w.id}">${escapeHtml(w.title)}</option>`).join("")}
               </select>`
            : ""
        }
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
      wishlist_item_id: req.body.wishlistItemId ? Number(req.body.wishlistItemId) : null,
    },
    { toDiscord: false }
  );
  res.redirect(`/guilds/${guildId}/donations`);
}

export async function handleWishlistAdd(req, res) {
  const { guildId } = req.params;
  const title = req.body.title?.trim().slice(0, 60);
  const targetAmount = Number(req.body.targetAmount);
  if (title && Number.isFinite(targetAmount) && targetAmount > 0) {
    await db.addWishlistItem(guildId, title, targetAmount);
  }
  res.redirect(`/guilds/${guildId}/donations`);
}

export async function handleWishlistDelete(req, res) {
  const { guildId, id } = req.params;
  await db.deleteWishlistItem(guildId, id);
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

export async function handleAvatarUpload(req, res) {
  const { guildId } = req.params;
  await db.ensureDonationSettings(guildId);
  if (req.file) {
    await db.updateDonationSettings(guildId, {
      avatar_data: req.file.buffer.toString("base64"),
      avatar_mime: req.file.mimetype,
    });
  }
  res.redirect(`/guilds/${guildId}/donations`);
}

export async function handleAvatarDelete(req, res) {
  const { guildId } = req.params;
  await db.updateDonationSettings(guildId, { avatar_data: null, avatar_mime: null });
  res.redirect(`/guilds/${guildId}/donations`);
}
