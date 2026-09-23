import * as db from "../services/db.js";
import { hashPassword } from "../services/password.js";
import { announceDonation } from "../services/donationPolling.js";
import { broadcast } from "../services/donationOverlay.js";
import { fetchTotalFollowers } from "../services/tiktokLiveEvents.js";
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

    ${
      settings.tiktok_url
        ? `<div class="panel" style="margin-top:1.25rem" id="tiktokFollowersPanel">
      <h2>Followers TikTok</h2>
      <p class="earnings-value" id="tiktokFollowersValue" style="font-size:1.8rem">…</p>
      <p class="hint" id="tiktokFollowersHint">Mengecek…</p>
    </div>
    <script>
      fetch(${JSON.stringify(`/host/${identifier}/tiktok-followers`)})
        .then((r) => r.json())
        .then((d) => {
          const value = document.getElementById("tiktokFollowersValue");
          const hint = document.getElementById("tiktokFollowersHint");
          if (d.followerCount == null) {
            value.textContent = "—";
            hint.textContent = "Cuma bisa dicek pas kamu lagi live di TikTok.";
          } else {
            value.textContent = d.followerCount.toLocaleString("id-ID");
            hint.textContent = "Total followers akun TikTok kamu sekarang.";
          }
        })
        .catch(() => {
          document.getElementById("tiktokFollowersValue").textContent = "—";
          document.getElementById("tiktokFollowersHint").textContent = "Gagal ngecek, coba refresh halaman ini.";
        });
    </script>`
        : ""
    }

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

  res.send(hostLayout(body, { active: "beranda", identifier, settings }));
}

// ---- Wishlist ----

export async function handleHostWishlistPage(req, res, error) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const items = await db.listWishlistItemsWithProgress(settings.guild_id);

  const cards = items.length
    ? items
        .map((w) => {
          const pct = Math.min(100, Math.round((w.total / w.target_amount) * 100));
          return `
        <div class="widget-card">
          <form method="post" action="/host/${identifier}/wishlist/${w.id}/edit">
            <div class="grid grid-2">
              <div>
                <label for="title-${w.id}">Judul</label>
                <input id="title-${w.id}" type="text" name="title" value="${escapeHtml(w.title)}" maxlength="60" required />
              </div>
              <div>
                <label for="targetAmount-${w.id}">Target (Rp)</label>
                <input id="targetAmount-${w.id}" type="text" inputmode="numeric" class="rupiah-input" name="targetAmount" value="${w.target_amount}" required />
              </div>
            </div>
            <div class="progress-track" style="margin-top:.85rem"><div class="progress-fill" style="width:${pct}%"></div></div>
            <div class="progress-label"><span>${rupiah(w.total)} / ${rupiah(w.target_amount)}</span><span>${pct}%</span></div>
            <div style="display:flex;gap:.5rem;margin-top:.85rem">
              <button type="submit" class="btn btn-primary btn-sm">Simpan</button>
            </div>
          </form>
          <form method="post" action="/host/${identifier}/wishlist/${w.id}/delete" style="margin-top:.5rem">
            <button type="submit" class="btn btn-danger btn-sm">Hapus</button>
          </form>
        </div>`;
        })
        .join("")
    : `<div class="panel empty">Belum ada wishlist. Tambahin satu di bawah.</div>`;

  const body = `
    <div class="topbar"><div><h1>Wishlist</h1><p>Milestone yang donatur bisa patungan ke situ (mis. "Wisuda", "Penunjang Live").</p></div></div>
    ${error ? `<p class="hint" style="color:var(--error)">${escapeHtml(error)}</p>` : ""}
    ${cards}
    <form class="panel" method="post" action="/host/${identifier}/wishlist" style="margin-top:1.25rem">
      <label for="title">Judul</label>
      <input id="title" type="text" name="title" placeholder="Wisuda" maxlength="60" required />
      <label for="targetAmount">Target (Rp)</label>
      <input id="targetAmount" type="text" inputmode="numeric" class="rupiah-input" name="targetAmount" required />
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Tambah wishlist</button>
    </form>`;

  res.send(hostLayout(body, { active: "wishlist", identifier, settings }));
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

export async function handleHostWishlistEdit(req, res) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const title = req.body.title?.trim().slice(0, 60);
  const targetAmount = Number(req.body.targetAmount);
  if (title && Number.isFinite(targetAmount) && targetAmount > 0) {
    await db.updateWishlistItem(settings.guild_id, req.params.id, { title, targetAmount });
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

  res.send(hostLayout(body, { active: "pesan", identifier, settings }));
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

  res.send(hostLayout(body, { active: "tampilan", identifier, settings }));
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
  const chatWidgetUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}/chat`;
  const giftWidgetUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}/gift`;
  const likesWidgetUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}/likes`;
  const followersWidgetUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}/followers`;
  const shareWidgetUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}/share`;
  const jarWidgetUrl = `${baseUrl(req)}/overlay/${settings.overlay_token}/jar`;

  const body = `
    <div class="topbar"><div><h1>Pengaturan</h1><p>Nominal minimal, notifikasi, dan akses dashboard kamu.</p></div></div>
    ${notice ? `<p class="hint" style="color:var(--success)">${escapeHtml(notice)}</p>` : ""}

    <form class="panel" method="post" action="/host/${identifier}/pengaturan">
      <h2>Umum</h2>
      <label for="minAmount">Minimal donasi (Rp)</label>
      <input id="minAmount" type="text" inputmode="numeric" class="rupiah-input" name="minAmount" value="${settings.min_amount}" />
      <label class="checkbox-row"><input type="checkbox" name="ttsEnabled" ${settings.tts_enabled ? "checked" : ""} /> Bacakan pesan pakai suara (TTS)</label>
      <label class="checkbox-row"><input type="checkbox" name="soundEnabled" ${settings.sound_enabled ? "checked" : ""} /> Bunyi lonceng pas ada donasi masuk</label>
      <label class="checkbox-row"><input type="checkbox" name="leaderboardEnabled" ${settings.leaderboard_enabled ? "checked" : ""} /> Aktifin widget leaderboard</label>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <form class="panel" method="post" action="/host/${identifier}/pengaturan/tema" style="margin-top:1.25rem">
      <h2>Tema Dashboard</h2>
      <p class="hint">Ganti warna aksen dan aktifin dark mode buat dashboard ini (halaman donate publik kamu gak kepengaruh).</p>
      <label for="accentColor">Warna aksen</label>
      <input id="accentColor" type="color" name="accentColor" value="${escapeHtml((settings.dashboard_theme || {}).accentColor || "#76cc11")}" />
      <label class="checkbox-row"><input type="checkbox" name="darkMode" ${(settings.dashboard_theme || {}).darkMode ? "checked" : ""} /> Dark mode</label>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Terapkan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Link widget OBS</h2>
      <p class="hint">Tambahin sebagai Browser Source di OBS/TikTok Live Studio.</p>
      ${!settings.tiktok_url ? `<p class="hint" style="color:var(--warning)">Widget Chat &amp; Gift butuh username TikTok — isi dulu di halaman <a href="/host/${identifier}/tampilan" style="color:inherit">Tampilan</a>.</p>` : ""}
      ${[
        { label: "Alert", desc: "Muncul di layar tiap ada donasi masuk, lengkap sama nominal, nama, dan pesan.", url: overlayUrl, testType: "donation", w: 360, h: 200 },
        { label: "Leaderboard", desc: "Papan peringkat donatur terbesar, update otomatis tiap ada donasi baru.", url: leaderboardUrl, w: 280, h: 360 },
        { label: "Wishlist", desc: "Progress milestone wishlist yang lagi dikejar, gantian tiap beberapa detik.", url: wishlistWidgetUrl, testType: "wishlist", w: 320, h: 160 },
        { label: "Video", desc: "Muterin klip YouTube yang di-request lewat donasi, otomatis nongol di layar.", url: videoWidgetUrl, w: 640, h: 480 },
        { label: "Chat Live", desc: "Nampilin chat TikTok LIVE beneran langsung di overlay stream kamu.", url: chatWidgetUrl, testType: "chat", w: 360, h: 420 },
        { label: "Gift", desc: "Popup tiap ada yang ngirim gift TikTok, nama pengirim + jenis hadiahnya.", url: giftWidgetUrl, testType: "gift", w: 420, h: 100 },
        { label: "Like Counter", desc: "Jumlah like real-time selama live, langsung dari TikTok LIVE.", url: likesWidgetUrl, testType: "likes", w: 220, h: 80 },
        { label: "Follower Count", desc: "Jumlah follower baru yang masuk selama live berlangsung.", url: followersWidgetUrl, testType: "follow", w: 260, h: 80 },
        { label: "Share Count", desc: "Jumlah share live kamu selama live berlangsung.", url: shareWidgetUrl, testType: "share", w: 220, h: 80 },
        { label: "Coin Jar", desc: "Toples visual yang keisi tiap ada gift masuk selama live.", url: jarWidgetUrl, testType: "gift", w: 140, h: 190 },
      ]
        .map(
          (w) => `
        <div class="widget-card">
          <h3>${w.label}</h3>
          <p class="hint" style="margin:-.4rem 0 .75rem">${w.desc}</p>
          <div class="widget-url-row">
            <input class="url-box" type="text" readonly value="${escapeHtml(w.url)}" onclick="this.select()" />
            <button type="button" class="widget-btn" onclick="copyWidgetUrl(this)" data-url="${escapeHtml(w.url)}">Copy URL</button>
            ${
              w.testType
                ? `<button type="button" class="widget-btn" onclick="testLiveWidget(this)" data-url="${escapeHtml(w.url)}" data-type="${w.testType}" data-w="${w.w}" data-h="${w.h}">Buka + Test</button>`
                : `<button type="button" class="widget-btn" onclick="openWidgetWindow(this)" data-url="${escapeHtml(w.url)}" data-w="${w.w}" data-h="${w.h}">Test</button>`
            }
          </div>
        </div>`
        )
        .join("")}
      <div class="widget-card" style="border-color:var(--rule-strong)">
        <h3 style="color:var(--ink)">Mode Demo</h3>
        <p class="hint" style="margin:-.4rem 0 .75rem">Kirim chat, gift, like, follower, dan share palsu terus-menerus tiap beberapa detik — buka widget Chat/Gift/Like Counter/Follower Count/Share Count di OBS dulu, terus nyalain ini buat lihat semuanya hidup pas ngatur posisi/gaya di scene.</p>
        <button type="button" class="btn btn-primary btn-sm" id="demoToggle" onclick="toggleDemoMode(this)">Mulai Demo Live</button>
        <p class="hint" id="demoStatus" style="margin-top:.6rem"></p>
      </div>
      <form method="post" action="/host/${identifier}/pengaturan/regenerate-token" style="margin-top:12px">
        <button type="submit" class="btn btn-sm">Buat ulang link widget</button>
      </form>
    </div>
    <script>
      function copyWidgetUrl(btn) {
        navigator.clipboard.writeText(btn.dataset.url).then(() => {
          const original = btn.textContent;
          btn.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(() => { btn.textContent = original; btn.classList.remove("copied"); }, 1500);
        });
      }

      // Opens the widget in a new tab, then fires a fake chat/gift/likes/follow
      // event a moment later (once that tab's had time to connect its SSE
      // stream) — so Chat/Gift/Like Counter/Follower Count/Coin Jar can be
      // previewed without needing to actually be live on TikTok.
      // Opens a small popup window sized to match the widget's actual content
      // instead of a full browser tab — a plain full-size tab leaves most of
      // itself empty/transparent for a widget that's really just a small badge.
      function openWidgetWindow(btn) {
        const w = btn.dataset.w || 400, h = btn.dataset.h || 300;
        const left = (screen.width - w) / 2, top = (screen.height - h) / 2;
        window.open(btn.dataset.url, "_blank", "noopener,width=" + w + ",height=" + h + ",left=" + left + ",top=" + top);
      }

      function testLiveWidget(btn) {
        openWidgetWindow(btn);
        const original = btn.textContent;
        btn.textContent = "Menyiapkan...";
        btn.disabled = true;
        setTimeout(() => {
          fetch(${JSON.stringify(`/host/${identifier}/pengaturan/test-live-event`)}, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "type=" + encodeURIComponent(btn.dataset.type),
          }).finally(() => {
            btn.textContent = "Terkirim!";
            setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
          });
        }, 1200);
      }

      // Fires a random chat/gift/likes/follow/share event every few seconds so the
      // widgets already added as OBS browser sources look "alive" while
      // arranging the scene — no real TikTok LIVE needed. Stops itself if the
      // tab is closed; toggled off manually otherwise.
      let demoTimer = null;
      let demoIdx = 0;
      // Round-robin, not random — random 20%-per-type meant Gift/Like Counter
      // could sit unrolled for a while (and Gift's popup auto-hides after 5s,
      // easy to miss). This guarantees every type fires once per cycle.
      const DEMO_TYPES = ["chat", "gift", "likes", "follow", "share"];
      function sendDemoEvent() {
        const type = DEMO_TYPES[demoIdx % DEMO_TYPES.length];
        demoIdx++;
        const status = document.getElementById("demoStatus");
        if (status) status.textContent = "Terakhir dikirim: " + type + " (" + new Date().toLocaleTimeString("id-ID") + ")";
        fetch(${JSON.stringify(`/host/${identifier}/pengaturan/test-live-event`)}, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "type=" + type,
        }).catch(() => {});
      }
      function toggleDemoMode(btn) {
        if (demoTimer) {
          clearInterval(demoTimer);
          demoTimer = null;
          btn.textContent = "Mulai Demo Live";
          btn.classList.remove("btn-danger");
          const status = document.getElementById("demoStatus");
          if (status) status.textContent = "";
          return;
        }
        demoIdx = 0;
        sendDemoEvent();
        demoTimer = setInterval(sendDemoEvent, 2500);
        btn.textContent = "Matiin Demo Live";
        btn.classList.add("btn-danger");
      }
    </script>

    <form class="panel" method="post" action="/host/${identifier}/pengaturan/password" style="margin-top:1.25rem">
      <h2>Ganti password dashboard</h2>
      <label for="username">Username</label>
      <input id="username" type="text" name="username" value="${escapeHtml(settings.host_username || "")}" required />
      <label for="newPassword">Password baru</label>
      <input id="newPassword" type="password" name="newPassword" placeholder="Kosongkan kalau gak mau ganti" />
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>`;

  res.send(hostLayout(body, { active: "pengaturan", identifier, settings }));
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

export async function handleHostThemeUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    dashboard_theme: {
      accentColor: /^#[0-9a-f]{6}$/i.test(req.body.accentColor || "") ? req.body.accentColor : "#76cc11",
      darkMode: req.body.darkMode === "on",
    },
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

/** One-off TikTok follower count for the Beranda panel — only returns a number
 * while the host is actually live (see fetchTotalFollowers's own doc comment). */
export async function handleHostTiktokFollowers(req, res) {
  const settings = req.donationSettings;
  if (!settings.tiktok_url) return res.json({ followerCount: null });
  const followerCount = await fetchTotalFollowers(settings.tiktok_url);
  res.json({ followerCount });
}

// ---- Test live widgets (Chat/Gift/Likes/Followers/Jar) without needing a real TikTok LIVE ----

const TEST_NAMES = ["Budi", "Rizky", "Ani_23", "kazuha", "Citra Dewi", "mahdi"];
const TEST_GIFTS = ["Rose", "GG", "TikTok", "Perfume", "Corgi", "Ice Cream Cone"];
const TEST_MESSAGES = [
  "Halo dari test! 👋 semangat live-nya",
  "keren banget kontennya",
  "request lagu dong kak",
  "🔥🔥🔥",
  "pertama kali mampir, langsung betah",
  "wkwkwk lucu banget",
];
const TEST_LINKS = [
  { title: "10 Tips Belajar Coding buat Pemula", description: "Panduan lengkap buat yang baru mulai belajar programming dari nol.", url: "https://example.com/artikel-coding" },
  { title: "Resep Nasi Goreng Spesial", description: "Resep simpel tapi rasanya juara, cocok buat sarapan.", url: "https://example.com/resep" },
];

function randomTestPayload(type, settings) {
  const user = TEST_NAMES[Math.floor(Math.random() * TEST_NAMES.length)];
  switch (type) {
    case "chat":
      return { user, message: TEST_MESSAGES[Math.floor(Math.random() * TEST_MESSAGES.length)] };
    case "gift":
      return {
        user,
        giftName: TEST_GIFTS[Math.floor(Math.random() * TEST_GIFTS.length)],
        giftImage: null,
        repeatCount: Math.floor(Math.random() * 5) + 1,
      };
    case "likes":
      return { total: Math.floor(Math.random() * 5000) + 100 };
    case "follow":
      return { total: Math.floor(Math.random() * 20) + 1, user };
    case "share":
      return { total: Math.floor(Math.random() * 10) + 1, user };
    case "wheel": {
      // Fake segments — doesn't touch/require the host's real configured
      // wheel options (Tools page), just proves the widget itself spins.
      const options = ["Hadiah A", "Hadiah B", "Hadiah C", "Coba Lagi", "Hadiah D"];
      return { options, result: options[Math.floor(Math.random() * options.length)] };
    }
    case "points-drop":
      return { active: true, bonus: settings?.points_drop_bonus || 50 };
    case "gift-total":
      // Drives Milestone widgets configured for the "gifts" metric — see
      // tiktokLiveEvents.js's own counts.diamonds running total.
      return { total: Math.floor(Math.random() * 2000) + 100 };
    case "likeathon":
      return {
        ranking: TEST_NAMES.slice(0, 5).map((name, i) => ({
          user: name,
          count: (5 - i) * (Math.floor(Math.random() * 30) + 10),
          avatarUrl: null,
        })),
      };
    case "command-response":
      return { text: `${user}: skor kamu sekarang 1.${Math.floor(Math.random() * 900) + 100} poin` };
    case "link-preview": {
      const link = TEST_LINKS[Math.floor(Math.random() * TEST_LINKS.length)];
      return { user, ...link, image: null };
    }
    default:
      return null;
  }
}

/** Broadcasts one fake chat/gift/likes/follow/wishlist event straight to the
 * overlay's SSE stream — bypasses tiktokLiveEvents.js (and, for wishlist, the
 * database) entirely, so hosts can preview these widgets without needing to
 * actually be live on TikTok or make a real payment. */
export async function handleHostTestLiveEvent(req, res) {
  const settings = req.donationSettings;
  const type = req.body.type;

  if (type === "donation") {
    // Runs the exact same path a real paid donation takes (announceDonation:
    // sound flag, Gemini/Piper TTS narration, leaderboard + wishlist refresh)
    // so the Alert widget's bell/voice actually fire during a test, not just
    // a bare SSE payload.
    const user = TEST_NAMES[Math.floor(Math.random() * TEST_NAMES.length)];
    await announceDonation(
      null,
      settings,
      {
        guild_id: settings.guild_id,
        donor_name: user,
        amount: (Math.floor(Math.random() * 20) + 1) * 5000,
        message: TEST_MESSAGES[Math.floor(Math.random() * TEST_MESSAGES.length)],
        wishlist_item_id: null,
        youtube_video_id: null,
        youtube_start_seconds: null,
        youtube_end_seconds: null,
      },
      { toDiscord: false }
    );
    return res.status(204).end();
  }

  if (type === "wishlist") {
    // Reads real wishlist items but only bumps the first one's total in the
    // broadcast payload — nothing is written back to the database, so the
    // next real donation (or page reload) shows the untouched real progress.
    const items = await db.listWishlistItemsWithProgress(settings.guild_id);
    if (items.length) {
      const bumped = items.map((w, i) =>
        i === 0 ? { ...w, total: Math.min(w.target_amount, w.total + Math.round(w.target_amount * 0.15) + 1000) } : w
      );
      broadcast(settings.overlay_token, "wishlist", { items: bumped });
    }
    return res.status(204).end();
  }

  if (type === "video") {
    // Same real donation path as the "donation" test above, just with a
    // YouTube clip attached (a well-known always-available video) so the
    // separate Video widget actually has something to play.
    const user = TEST_NAMES[Math.floor(Math.random() * TEST_NAMES.length)];
    await announceDonation(
      null,
      settings,
      {
        guild_id: settings.guild_id,
        donor_name: user,
        amount: 50000,
        message: "muterin ini dong kak",
        wishlist_item_id: null,
        youtube_video_id: "dQw4w9WgXcQ",
        youtube_start_seconds: 0,
        youtube_end_seconds: 20,
      },
      { toDiscord: false }
    );
    return res.status(204).end();
  }

  if (type === "action-demo") {
    // Generic Layar 1 banner, independent of any real configured Action's
    // trigger condition — just to confirm the screen itself shows up.
    broadcast(settings.overlay_token, "action", {
      screen: 1,
      name: "Contoh Aksi",
      description: "Ini contoh tampilan Layar 1 kalau ada Aksi yang aktif.",
      mediaUrl: null,
      mediaType: null,
      soundUrl: null,
      durationMs: 4000,
    });
    return res.status(204).end();
  }

  if (type === "subathon-demo") {
    // Broadcast-only, like the wishlist test above — doesn't touch the real
    // subathon_end_at/started_at, so it can't interfere with an actual run.
    const endAt = new Date(Date.now() + 5 * 60_000);
    broadcast(settings.overlay_token, "subathon", { endAt: endAt.toISOString(), addedMinutes: 5 });
    return res.status(204).end();
  }

  const payload = randomTestPayload(type, settings);
  if (payload) broadcast(settings.overlay_token, type, payload);
  res.status(204).end();
}
