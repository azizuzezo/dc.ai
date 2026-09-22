import * as db from "../services/db.js";
import { hashPassword } from "../services/password.js";
import { announceDonation } from "../services/donationPolling.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

function rupiah(n) {
  return "Rp" + Number(n || 0).toLocaleString("id-ID");
}

function baseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

// ---- Beranda ----

export async function handleHostHomePage(req, res) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
  const [grandTotal, { points }, recent] = await Promise.all([
    db.getDonationGrandTotal(settings.guild_id),
    db.getDonationDailyTotals(settings.guild_id, days),
    db.listRecentPaidDonations(settings.guild_id, 200),
  ]);
  const windowTotal = points.reduce((sum, p) => sum + p.total, 0);
  const windowCount = recent.filter((d) => d.paid_at >= points[0]?.date).length;
  const chartMax = Math.max(1, ...points.map((p) => p.total));

  const body = `
    <div class="topbar">
      <div>
        <h1>Beranda</h1>
        <p>Ringkasan patungan buat ${escapeHtml(settings.display_name || "server kamu")}.</p>
      </div>
      <a class="btn btn-primary" href="/${identifier}" target="_blank" rel="noopener">Lihat halaman</a>
    </div>
    <div class="grid grid-2">
      <div class="panel panel-shadow">
        <h2>Pendapatan bersih</h2>
        <p class="earnings-value">${rupiah(grandTotal)}</p>
        <p class="hint">Dihitung dari donasi berstatus lunas, sepanjang waktu.</p>
        <div class="stats-strip">
          <div class="stat"><div class="stat-label">${days} hari terakhir</div><div class="stat-value mono">${rupiah(windowTotal)}</div></div>
          <div class="stat"><div class="stat-label">Jumlah donasi</div><div class="stat-value mono">${windowCount}</div></div>
        </div>
      </div>
      <div class="panel">
        <h2>Wishlist aktif</h2>
        <p class="hint" style="margin-top:6px">Kelola milestone yang donatur bisa patungan ke situ.</p>
        <a class="btn" href="/host/${identifier}/wishlist" style="margin-top:12px">Kelola wishlist</a>
      </div>
    </div>

    <div class="panel" style="margin-top:1.25rem">
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem">
        <div>
          <h2>Donasi masuk</h2>
          <p class="hint">Total per hari, dari donasi yang sudah lunas.</p>
        </div>
        <div class="tab-list" id="rangeTabs">
          ${[7, 30, 90].map((d) => `<button type="button" class="tab-button${d === days ? " active" : ""}" data-days="${d}">${d} hari</button>`).join("")}
        </div>
      </div>
      <div class="chart" id="chart" role="img" aria-label="Grafik donasi harian">
        ${
          chartMax > 1 || points.some((p) => p.total > 0)
            ? `<div class="chart-bars">${points
                .map(
                  (p) =>
                    `<div class="chart-bar-group"><div class="chart-bar-track"><div class="chart-bar" style="height:${Math.max(2, Math.round((p.total / chartMax) * 100))}%"></div></div><span class="chart-bar-label">${p.date.slice(5)}</span></div>`
                )
                .join("")}</div>`
            : `<p class="chart-empty">Belum ada data buat ${days} hari terakhir.</p>`
        }
      </div>
    </div>
    <script>
      document.getElementById("rangeTabs").addEventListener("click", (e) => {
        const btn = e.target.closest(".tab-button");
        if (!btn) return;
        window.location.href = "?days=" + btn.dataset.days;
      });
    </script>`;

  res.send(hostLayout(body, { active: "beranda", identifier, title: settings.display_name, avatarUrl: settings.avatar_data ? `/${identifier}/avatar` : null }));
}

// ---- Wishlist ----

export async function handleHostWishlistPage(req, res, error) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const items = await db.listWishlistItemsWithProgress(settings.guild_id);

  const rows = items.length
    ? `<table><tr><th>Judul</th><th>Progress</th><th></th></tr>${items
        .map((w) => {
          const pct = Math.min(100, Math.round((w.total / w.target_amount) * 100));
          return `<tr>
            <td>${escapeHtml(w.title)}</td>
            <td>${rupiah(w.total)} / ${rupiah(w.target_amount)} (${pct}%)</td>
            <td><form method="post" action="/host/${identifier}/wishlist/${w.id}/delete">
              <button type="submit" class="btn btn-danger btn-sm">Hapus</button></form></td>
          </tr>`;
        })
        .join("")}</table>`
    : `<div class="empty">Belum ada wishlist. Tambahin satu di bawah.</div>`;

  const body = `
    <div class="topbar"><div><h1>Wishlist</h1><p>Milestone yang donatur bisa patungan ke situ (mis. "Wisuda", "Penunjang Live").</p></div></div>
    ${error ? `<p class="hint" style="color:var(--error)">${escapeHtml(error)}</p>` : ""}
    <div class="panel">${rows}</div>
    <form class="panel" method="post" action="/host/${identifier}/wishlist" style="margin-top:1.25rem">
      <label for="title">Judul</label>
      <input id="title" type="text" name="title" placeholder="Wisuda" maxlength="60" required />
      <label for="targetAmount">Target (Rp)</label>
      <input id="targetAmount" type="number" name="targetAmount" min="1000" step="1000" required />
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Tambah wishlist</button>
    </form>`;

  res.send(hostLayout(body, { active: "wishlist", identifier, title: settings.display_name, avatarUrl: settings.avatar_data ? `/${identifier}/avatar` : null }));
}

export async function handleHostWishlistAdd(req, res) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const title = req.body.title?.trim().slice(0, 60);
  const targetAmount = Number(req.body.targetAmount);
  if (title && Number.isFinite(targetAmount) && targetAmount > 0) {
    await db.addWishlistItem(settings.guild_id, title, targetAmount);
  }
  res.redirect(`/host/${identifier}/wishlist`);
}

export async function handleHostWishlistDelete(req, res) {
  const settings = req.donationSettings;
  await db.deleteWishlistItem(settings.guild_id, req.params.id);
  res.redirect(`/host/${req.params.identifier}/wishlist`);
}

// ---- Pesan ----

export async function handleHostMessagesPage(req, res) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const recent = await db.listRecentPaidDonations(settings.guild_id, 100);
  const messages = recent.filter((d) => d.message);
  const wishlistItems = await db.listWishlistItemsWithProgress(settings.guild_id);
  const wishlistTitleById = new Map(wishlistItems.map((w) => [w.id, w.title]));

  const body = `
    <div class="topbar"><div><h1>Pesan</h1><p>Pesan dari donatur yang sudah lunas.</p></div></div>
    <div class="panel">
      ${
        messages.length
          ? messages
              .map((d) => {
                const wishTitle = d.wishlist_item_id ? wishlistTitleById.get(d.wishlist_item_id) : null;
                return `<div style="padding:14px 0;border-bottom:1px solid var(--rule)">
                  <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
                    <strong>${escapeHtml(d.donor_name)}</strong>
                    <span class="mono" style="color:var(--muted);font-size:.82rem">${rupiah(d.amount)} · ${d.paid_at ? new Date(d.paid_at).toLocaleString("id-ID") : ""}</span>
                  </div>
                  ${wishTitle ? `<div style="font-size:.82rem;color:var(--brand);margin-top:2px">Kontribusi ke wishlist: ${escapeHtml(wishTitle)}</div>` : ""}
                  <div style="margin-top:4px">&ldquo;${escapeHtml(d.message)}&rdquo;</div>
                  <form method="post" action="/host/${identifier}/replay/${d.trx_id}" style="margin-top:8px">
                    <button type="submit" class="btn btn-sm">Putar ulang di overlay</button>
                  </form>
                </div>`;
              })
              .join("")
          : `<div class="empty">Belum ada pesan.</div>`
      }
    </div>`;

  res.send(hostLayout(body, { active: "pesan", identifier, title: settings.display_name, avatarUrl: settings.avatar_data ? `/${identifier}/avatar` : null }));
}

// ---- Tampilan ----

export async function handleHostAppearancePage(req, res, error) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;

  const body = `
    <div class="topbar"><div><h1>Tampilan</h1><p>Foto profil, judul halaman, dan link sosial media kamu.</p></div></div>
    ${error ? `<p class="hint" style="color:var(--error)">${escapeHtml(error)}</p>` : ""}
    <div class="grid grid-2">
      <div class="panel">
        <h2>Foto profil</h2>
        ${
          settings.avatar_data
            ? `<img src="/${identifier}/avatar" alt="" style="width:72px;height:72px;border-radius:50%;object-fit:cover;display:block;margin:12px 0" />`
            : `<p class="hint">Belum ada foto, pakai huruf inisial buat sekarang.</p>`
        }
        <form method="post" action="/host/${identifier}/tampilan/avatar" enctype="multipart/form-data">
          <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" required />
          <button type="submit" class="btn btn-primary" style="margin-top:12px">Upload</button>
        </form>
        ${
          settings.avatar_data
            ? `<form method="post" action="/host/${identifier}/tampilan/avatar/delete" style="margin-top:8px">
                 <button type="submit" class="btn btn-danger btn-sm">Hapus foto</button></form>`
            : ""
        }
      </div>
      <form class="panel" method="post" action="/host/${identifier}/tampilan">
        <h2>Profil halaman</h2>
        <label for="displayName">Judul halaman</label>
        <input id="displayName" type="text" name="displayName" value="${escapeHtml(settings.display_name || "")}" maxlength="60" placeholder="Dukung Aku Live" />
        <label for="description">Bio</label>
        <textarea id="description" name="description" maxlength="200" rows="2">${escapeHtml(settings.description || "")}</textarea>
        <label for="tiktokUrl">TikTok</label>
        <input id="tiktokUrl" type="url" name="tiktokUrl" value="${escapeHtml(settings.tiktok_url || "")}" placeholder="https://tiktok.com/@kamu" />
        <label for="instagramUrl">Instagram</label>
        <input id="instagramUrl" type="url" name="instagramUrl" value="${escapeHtml(settings.instagram_url || "")}" placeholder="https://instagram.com/kamu" />
        <label for="youtubeUrl">YouTube</label>
        <input id="youtubeUrl" type="url" name="youtubeUrl" value="${escapeHtml(settings.youtube_url || "")}" placeholder="https://youtube.com/@kamu" />
        <label for="twitterUrl">Twitter/X</label>
        <input id="twitterUrl" type="url" name="twitterUrl" value="${escapeHtml(settings.twitter_url || "")}" placeholder="https://x.com/kamu" />
        <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
      </form>
    </div>`;

  res.send(hostLayout(body, { active: "tampilan", identifier, title: settings.display_name, avatarUrl: settings.avatar_data ? `/${identifier}/avatar` : null }));
}

export async function handleHostAppearanceUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    display_name: req.body.displayName?.trim().slice(0, 60) || null,
    description: req.body.description?.trim().slice(0, 200) || null,
    tiktok_url: req.body.tiktokUrl?.trim() || null,
    instagram_url: req.body.instagramUrl?.trim() || null,
    youtube_url: req.body.youtubeUrl?.trim() || null,
    twitter_url: req.body.twitterUrl?.trim() || null,
  });
  res.redirect(`/host/${req.params.identifier}/tampilan`);
}

export async function handleHostAvatarUpload(req, res) {
  const settings = req.donationSettings;
  if (req.file) {
    await db.updateDonationSettings(settings.guild_id, {
      avatar_data: req.file.buffer.toString("base64"),
      avatar_mime: req.file.mimetype,
    });
  }
  res.redirect(`/host/${req.params.identifier}/tampilan`);
}

export async function handleHostAvatarDelete(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, { avatar_data: null, avatar_mime: null });
  res.redirect(`/host/${req.params.identifier}/tampilan`);
}

// ---- Pengaturan ----

export async function handleHostSettingsPage(req, res, notice) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const overlayUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}`;
  const leaderboardUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}/leaderboard`;
  const wishlistWidgetUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}/wishlist`;
  const videoWidgetUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}/video`;

  const body = `
    <div class="topbar"><div><h1>Pengaturan</h1><p>Nominal minimal, notifikasi, dan akses dashboard kamu.</p></div></div>
    ${notice ? `<p class="hint" style="color:var(--success)">${escapeHtml(notice)}</p>` : ""}

    <form class="panel" method="post" action="/host/${identifier}/pengaturan">
      <h2>Umum</h2>
      <label for="minAmount">Minimal donasi (Rp)</label>
      <input id="minAmount" type="number" name="minAmount" value="${settings.min_amount}" min="1000" step="500" />
      <label class="checkbox-row"><input type="checkbox" name="ttsEnabled" ${settings.tts_enabled ? "checked" : ""} /> Bacakan pesan pakai suara (TTS)</label>
      <label class="checkbox-row"><input type="checkbox" name="soundEnabled" ${settings.sound_enabled ? "checked" : ""} /> Bunyi lonceng pas ada donasi masuk</label>
      <label class="checkbox-row"><input type="checkbox" name="leaderboardEnabled" ${settings.leaderboard_enabled ? "checked" : ""} /> Aktifin widget leaderboard</label>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Link widget OBS</h2>
      <p class="hint">Tambahin sebagai Browser Source di OBS/TikTok Live Studio.</p>
      <label>Alert</label>
      <p class="mono hint" style="word-break:break-all">${overlayUrl}</p>
      <label>Leaderboard</label>
      <p class="mono hint" style="word-break:break-all">${leaderboardUrl}</p>
      <label>Wishlist</label>
      <p class="mono hint" style="word-break:break-all">${wishlistWidgetUrl}</p>
      <label>Video</label>
      <p class="mono hint" style="word-break:break-all">${videoWidgetUrl}</p>
      <form method="post" action="/host/${identifier}/pengaturan/regenerate-token" style="margin-top:12px">
        <button type="submit" class="btn btn-sm">Buat ulang link widget</button>
      </form>
    </div>

    <form class="panel" method="post" action="/host/${identifier}/pengaturan/password" style="margin-top:1.25rem">
      <h2>Ganti password dashboard</h2>
      <label for="username">Username</label>
      <input id="username" type="text" name="username" value="${escapeHtml(settings.host_username || "")}" required />
      <label for="newPassword">Password baru</label>
      <input id="newPassword" type="password" name="newPassword" placeholder="Kosongkan kalau gak mau ganti" />
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>`;

  res.send(hostLayout(body, { active: "pengaturan", identifier, title: settings.display_name, avatarUrl: settings.avatar_data ? `/${identifier}/avatar` : null }));
}

export async function handleHostSettingsUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    min_amount: Number(req.body.minAmount) || 5000,
    tts_enabled: req.body.ttsEnabled === "on",
    sound_enabled: req.body.soundEnabled === "on",
    leaderboard_enabled: req.body.leaderboardEnabled === "on",
  });
  res.redirect(`/host/${req.params.identifier}/pengaturan`);
}

export async function handleHostRegenerateToken(req, res) {
  const settings = req.donationSettings;
  await db.regenerateOverlayToken(settings.guild_id);
  res.redirect(`/host/${req.params.identifier}/pengaturan`);
}

export async function handleHostPasswordUpdate(req, res) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const username = req.body.username?.trim();
  if (!username) return handleHostSettingsPage(req, res, null);
  const fields = { host_username: username };
  if (req.body.newPassword) {
    fields.host_password_hash = hashPassword(req.body.newPassword);
  }
  await db.updateDonationSettings(settings.guild_id, fields);
  res.redirect(`/host/${identifier}/pengaturan`);
}

export async function handleHostReplayDonation(req, res) {
  const settings = req.donationSettings;
  const donation = await db.getDonationByTrxId(req.params.trxId);
  if (donation && donation.guild_id === settings.guild_id) {
    await announceDonation(null, settings, donation, { toDiscord: false });
  }
  res.redirect(`/host/${req.params.identifier}/pesan`);
}
