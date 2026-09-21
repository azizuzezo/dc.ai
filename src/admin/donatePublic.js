import * as db from "../services/db.js";
import { createQris, qrisImageUrl } from "../services/gopayGateway.js";
import { subscribe } from "../services/donationOverlay.js";
import { getAudio } from "../services/ttsCache.js";
import { extractYouTubeId, parseTimeToSeconds } from "../services/youtube.js";
import { logError } from "../services/logger.js";
import { escapeHtml } from "./htmlEscape.js";

/** Attaching a YouTube clip requires a bigger donation than the guild's own minimum. */
const VIDEO_MIN_AMOUNT = 25000;

/** Clean green checkout style (matches the streamer's SociaBuzz reference) for the donate form + QR pages. */
const CHECKOUT_STYLE = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{--green:#15803d;--green-light:#22c55e;--green-deep:#166534;--ink:#111827;--muted:#6b7280;--border:#e5e7eb;--track:#eef2f0}
    *{box-sizing:border-box}
    body{font-family:'Inter',sans-serif;max-width:440px;margin:0 auto;padding:32px 16px 48px;background:#fff;color:var(--ink)}
    .card{background:#fff;border:1px solid var(--border);border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);padding:22px}
    label{display:block;font-size:13px;font-weight:600;margin:16px 0 6px}
    .required-mark{color:#dc2626;margin-left:2px}
    input[type=text],input[type=number],input[type=email],textarea{width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--border);
      background:#fff;color:var(--ink);font:500 15px 'Inter',sans-serif;transition:border-color .15s ease}
    input[type=text]:hover,input[type=number]:hover,input[type=email]:hover,textarea:hover{border-color:#c3c9d1}
    input:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid var(--green);outline-offset:2px}
    input:invalid:not(:placeholder-shown){border-color:#dc2626}
    textarea{resize:vertical}
    button{font:700 15px 'Inter',sans-serif;border:none;border-radius:999px;cursor:pointer}
    .btn-primary{width:100%;padding:14px;margin-top:18px;background:var(--green-deep);color:#fff}
    .btn-primary:hover{background:var(--green)}
    .pill{padding:9px 4px;background:#fff;color:var(--ink);font-size:14px;border:1px solid var(--border);border-radius:999px}
    .pill.active{background:var(--green);color:#fff;border-color:var(--green)}
    .pills{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
    .hint{font-size:12px;color:var(--muted);margin-top:2px}
    .counter{font-size:12px;color:var(--muted);text-align:right}
    .check{display:flex;align-items:flex-start;gap:8px;font-size:13px;font-weight:500;margin-top:14px}
    .check input{width:18px;height:18px;margin-top:2px;accent-color:var(--green)}
    .bar{height:6px;background:var(--track);border-radius:999px;margin-top:8px;overflow:hidden}
    .bar-fill{height:100%;background:var(--green-light)}
    .hidden{display:none}
    .divider{border:none;border-top:1px solid var(--border);margin:28px 0 0}
    .section{margin-top:24px}
    .section-title{font-size:19px;font-weight:800;text-align:center;margin:0 0 16px}
    .link-btn{display:block;background:none;border:none;padding:0;margin-top:8px;
      font:600 13px 'Inter',sans-serif;color:var(--green);cursor:pointer;text-decoration:underline}

    .wishlist-grid{display:grid;grid-template-columns:1fr;gap:14px}
    @media (min-width:480px){.wishlist-grid{grid-template-columns:1fr 1fr}}
    .wish-card{border:1px solid var(--border);border-radius:14px;padding:16px;background:#fff}
    .wish-card.active{border-color:var(--green);box-shadow:0 0 0 1px var(--green)}
    .wish-card .wish-title{font-weight:800;font-size:15px}
    .wish-target{font-size:12px;color:var(--muted);margin-top:4px}
    .wish-current{font-size:13px;font-weight:700;margin:2px 0 8px}
    .wish-contrib{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.5}
    .wish-pick{width:100%;margin-top:14px;padding:11px;font-size:14px}

    .supporters{list-style:none;margin:0;padding:0}
    .supporters li{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)}
    .supporters li:last-child{border-bottom:none}
    .supporters li.more-hidden{display:none}
    .rank-badge{width:26px;height:26px;border-radius:50%;background:#d1d5db;color:#fff;font-weight:800;font-size:12px;
      display:flex;align-items:center;justify-content:center;flex:none}
    .rank-badge.top{background:var(--green-light)}
    .supporter-name{font-weight:700;font-size:14px}

    .message-item{padding:14px 0;border-bottom:1px solid var(--border)}
    .message-item:last-child{border-bottom:none}
    .message-item.more-hidden{display:none}
    .message-name{font-weight:700;font-size:14px}
    .message-wishlist{font-size:12px;color:var(--green);margin-top:2px}
    .message-text{font-size:14px;margin-top:4px}

    .yt-toggle{display:flex;align-items:center;gap:8px;width:100%;margin-top:16px;padding:11px 14px;
      background:#fff;border:1px solid var(--border);border-radius:10px;font:600 14px 'Inter',sans-serif;
      color:var(--ink);cursor:pointer;text-align:left}
    .yt-toggle:hover{border-color:var(--green)}
    .yt-toggle.expanded{border-color:var(--green);background:#f0fdf4}
    .yt-toggle svg{flex:none}

    #step1.hidden,#step2.hidden{display:none}
    #step2 .back-btn{display:flex;align-items:center;gap:4px;margin-bottom:14px;
      background:none;border:none;padding:0;font:600 14px 'Inter',sans-serif;color:var(--muted);cursor:pointer}
    #step2 .back-btn:hover{color:var(--ink)}
    @keyframes view-in{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}
    .view-enter{animation:view-in .35s cubic-bezier(.22,1,.36,1)}

    /* A little life: the avatar breathes, sections settle in as they load,
       cards/buttons respond to touch. Kept subtle and one-time, not looping
       everywhere, so it stays readable instead of busy. */
    @keyframes avatar-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
    @keyframes avatar-glow{0%,100%{box-shadow:0 0 0 3px var(--green)}50%{box-shadow:0 0 0 7px rgba(21,128,61,.3)}}
    @keyframes fade-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    #avatarCircle{animation:avatar-float 3.2s ease-in-out infinite, avatar-glow 3.2s ease-in-out infinite}
    .fade-in{opacity:0;animation:fade-up .6s cubic-bezier(.22,1,.36,1) forwards}
    .bar-fill{transition:width 1s cubic-bezier(.22,1,.36,1)}
    button{transition:transform .15s ease, box-shadow .15s ease}
    .btn-primary:active{transform:scale(.96)}
    .wish-pick:active{transform:scale(.96)}
    .wish-card{transition:transform .2s ease, box-shadow .2s ease}
    .wish-card:hover{transform:translateY(-3px);box-shadow:0 8px 18px rgba(0,0,0,.08)}
    .pill{transition:transform .15s ease, border-color .15s ease}
    .pill:hover{border-color:var(--green)}
    .pill:active{transform:scale(.94)}
    @media (prefers-reduced-motion: reduce){
      #avatarCircle,.fade-in,.bar-fill,button,.wish-card,.view-enter{animation:none !important;transition:none !important}
      .fade-in{opacity:1 !important;transform:none !important}
    }
  </style>`;

export async function handleDonatePage(req, res) {
  const settings = await db.getDonationSettingsByIdentifier(req.params.identifier);
  if (!settings?.gateway_url || !settings?.gateway_api_key) {
    return res.status(404).send("Halaman donasi belum diaktifkan untuk server ini.");
  }

  const identifier = req.params.identifier;
  const title = escapeHtml(settings.display_name || "Dukung Kami");
  const initial = escapeHtml(title.trim().charAt(0).toUpperCase() || "?");
  const avatarHtml = settings.avatar_data
    ? `<img src="/donate/${identifier}/avatar" alt="" style="width:100%;height:100%;object-fit:cover" />`
    : initial;
  const min = settings.min_amount;
  const presets = [10000, 25000, 50000, 100000, 200000, 500000].filter((v) => v >= min).slice(0, 6);
  if (!presets.length) presets.push(min, min * 2, min * 5);
  const wishlistItems = await db.listWishlistItemsWithProgress(settings.guild_id);
  const preselectedWishlistId = req.query.wishlist ? Number(req.query.wishlist) : null;
  const hasPreselected = wishlistItems.some((w) => w.id === preselectedWishlistId);
  const wishlistTitleById = new Map(wishlistItems.map((w) => [w.id, w.title]));

  const wishlistSectionHtml = wishlistItems.length
    ? `<hr class="divider" />
       <div class="section fade-in" style="animation-delay:.1s">
         <h2 class="section-title">Wishlist</h2>
         <div class="wishlist-grid">
           ${wishlistItems
             .map((w) => {
               const pct = Math.min(100, Math.round((w.total / w.target_amount) * 100));
               const active = hasPreselected && w.id === preselectedWishlistId;
               const contributors = w.contributors || [];
               const fmt = (c) => `${escapeHtml(c.donorName)} (Rp${Number(c.total).toLocaleString("id-ID")})`;
               const preview = contributors.slice(0, 3).map(fmt).join(", ");
               const rest = contributors.slice(3).map(fmt).join(", ");
               return `<div class="wish-card${active ? " active" : ""}">
                 <div class="wish-title">${escapeHtml(w.title)}</div>
                 <div class="wish-target">Target Rp${Number(w.target_amount).toLocaleString("id-ID")}</div>
                 <div class="wish-current">Rp${w.total.toLocaleString("id-ID")} (${pct}%)</div>
                 <div class="bar"><div class="bar-fill" data-pct="${pct}" style="width:0"></div></div>
                 ${
                   contributors.length
                     ? `<div class="wish-contrib">Kontributor: <span class="contrib-preview">${preview}</span><span class="contrib-rest hidden">${rest ? ", " + rest : ""}</span></div>`
                     : ""
                 }
                 ${rest ? `<button type="button" class="link-btn detail-toggle">Tampilkan detail</button>` : ""}
                 <button type="button" class="btn-primary wish-pick" data-wishlist-id="${w.id}">Pilih</button>
               </div>`;
             })
             .join("")}
         </div>
       </div>`
    : "";

  const leaderboard = await db.getDonationLeaderboard(settings.guild_id, 25);
  const topSupportersHtml = leaderboard.length
    ? `<hr class="divider" />
       <div class="section fade-in" style="animation-delay:.2s">
         <h2 class="section-title">Top Supporters</h2>
         <ol class="supporters">
           ${leaderboard
             .map(
               (d, i) => `<li class="${i >= 10 ? "more-hidden" : ""}">
                 <span class="rank-badge${i < 3 ? " top" : ""}">${i + 1}</span>
                 <span class="supporter-name">${escapeHtml(d.donorName)}</span>
               </li>`
             )
             .join("")}
         </ol>
         ${leaderboard.length > 10 ? `<button type="button" class="link-btn" id="supportersToggle" style="text-align:center">Lihat semua</button>` : ""}
       </div>`
    : "";

  const recentDonations = await db.listRecentPaidDonations(settings.guild_id, 30);
  const messages = recentDonations.filter((d) => d.message);
  const pesanHtml = messages.length
    ? `<hr class="divider" />
       <div class="section fade-in" style="animation-delay:.3s">
         <h2 class="section-title">Pesan</h2>
         ${messages
           .map((d, i) => {
             const wishTitle = d.wishlist_item_id ? wishlistTitleById.get(d.wishlist_item_id) : null;
             return `<div class="message-item${i >= 5 ? " more-hidden" : ""}">
               <div class="message-name">${escapeHtml(d.donor_name)}</div>
               ${wishTitle ? `<div class="message-wishlist">Kontribusi ke wishlist: ${escapeHtml(wishTitle)}</div>` : ""}
               <div class="message-text">&ldquo;${escapeHtml(d.message)}&rdquo;</div>
             </div>`;
           })
           .join("")}
         ${messages.length > 5 ? `<button type="button" class="link-btn" id="messagesToggle" style="text-align:center">Lihat semua</button>` : ""}
       </div>`
    : "";

  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    ${CHECKOUT_STYLE}
    </head><body>
    <div id="step1" class="${hasPreselected ? "hidden" : ""}">
      <div class="fade-in" style="text-align:center;margin-bottom:20px">
        <div id="avatarCircle" style="width:76px;height:76px;border-radius:50%;background:var(--green);border:3px solid #fff;box-shadow:0 0 0 3px var(--green);
          display:flex;align-items:center;justify-content:center;margin:0 auto 10px;color:#fff;font-size:32px;font-weight:800;overflow:hidden">${avatarHtml}</div>
        <h1 style="margin:0;font-size:22px">${title}</h1>
        ${settings.description ? `<p style="margin:6px 0 0;color:var(--muted);font-size:14px">${escapeHtml(settings.description)}</p>` : ""}
        <button type="button" class="btn-primary" id="mainDonateBtn">Berikan Patungan</button>
      </div>
      ${wishlistSectionHtml}
      ${topSupportersHtml}
      ${pesanHtml}
    </div>
    <div id="step2" class="${hasPreselected ? "" : "hidden"}">
      <button type="button" class="back-btn" id="backBtn">&larr; Kembali</button>
      <form class="card" id="donateForm" method="post" action="/donate/${identifier}">
        <input type="hidden" name="wishlistItemId" id="wishlistItemId" value="${hasPreselected ? preselectedWishlistId : ""}" />
        <label><span id="amountLabelText">Nominal (Rp, minimal ${min.toLocaleString("id-ID")})</span><span class="required-mark">*</span></label>
        <div class="pills">
          ${presets.map((p) => `<button type="button" class="pill" data-amount="${p}">${p.toLocaleString("id-ID")}</button>`).join("")}
        </div>
        <input type="number" name="amount" id="amount" min="${min}" step="500" required style="margin-top:10px" placeholder="Atau isi nominal lain" />

        <label>Nama</label>
        <input type="text" name="donorName" id="donorName" maxlength="40" placeholder="Nama kamu" />
        <label class="check"><input type="checkbox" id="anon" /> Donasi sebagai Anonim</label>

        <label for="donorEmail">Email<span class="required-mark">*</span></label>
        <input type="email" name="donorEmail" id="donorEmail" required placeholder="email@kamu.com" />
        <p class="hint">Buat konfirmasi/struk donasi, gak ditampilkan ke publik.</p>

        <label>Pesan (opsional)</label>
        <textarea name="message" id="message" maxlength="200" rows="3"></textarea>
        <div class="counter"><span id="msgCount">0</span>/200</div>

        <button type="button" class="yt-toggle" id="youtubeToggle">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="17" y="3.5" rx="5" fill="#FF0000"/><path d="M10 8.7l6 3.3-6 3.3z" fill="#fff"/></svg>
          <span id="youtubeToggleLabel">Tambahin video YouTube (opsional)</span>
        </button>
        <div id="youtubeFields" class="hidden" style="margin-top:6px">
          <label for="youtubeUrl">Link video YouTube</label>
          <input type="text" name="youtubeUrl" id="youtubeUrl" placeholder="https://youtube.com/watch?v=..." />
          <p class="hint">Diputar di layar live pas donasi kamu muncul.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div>
              <label for="youtubeStart" style="margin-top:8px">Mulai dari (mm:ss)</label>
              <input type="text" name="youtubeStart" id="youtubeStart" placeholder="0:00" />
            </div>
            <div>
              <label for="youtubeEnd" style="margin-top:8px">Sampai (mm:ss, opsional)</label>
              <input type="text" name="youtubeEnd" id="youtubeEnd" placeholder="1:30" />
            </div>
          </div>
        </div>

        <label class="check">
          <input type="checkbox" required />
          Saya menyatakan donasi ini dukungan pribadi, bukan transaksi komersial, dan tidak melanggar hukum yang berlaku.
        </label>

        <button type="submit" class="btn-primary">Buat QRIS Sekarang</button>
      </form>
    </div>
    <script>
      const amountInput = document.getElementById("amount");
      document.querySelectorAll(".pill").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".pill").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          amountInput.value = btn.dataset.amount;
        });
      });
      amountInput.addEventListener("input", () => {
        document.querySelectorAll(".pill").forEach((b) => b.classList.toggle("active", b.dataset.amount === amountInput.value));
      });

      const donorName = document.getElementById("donorName");
      document.getElementById("anon").addEventListener("change", (e) => {
        donorName.disabled = e.target.checked;
        if (e.target.checked) donorName.value = "";
      });

      const message = document.getElementById("message");
      const msgCount = document.getElementById("msgCount");
      message.addEventListener("input", () => { msgCount.textContent = message.value.length; });

      const wishlistItemId = document.getElementById("wishlistItemId");
      const wishCards = document.querySelectorAll(".wish-card");
      const step1 = document.getElementById("step1");
      const step2 = document.getElementById("step2");
      function showStep(from, to) {
        from.classList.add("hidden");
        to.classList.remove("hidden");
        to.classList.remove("view-enter");
        void to.offsetWidth; // restart the animation
        to.classList.add("view-enter");
        window.scrollTo({ top: 0, behavior: "smooth" });
        if (to === step2) amountInput.focus();
      }
      document.querySelectorAll(".wish-pick[data-wishlist-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          wishCards.forEach((c) => c.classList.remove("active"));
          btn.closest(".wish-card")?.classList.add("active");
          wishlistItemId.value = btn.dataset.wishlistId;
          showStep(step1, step2);
        });
      });
      document.getElementById("mainDonateBtn")?.addEventListener("click", () => {
        wishCards.forEach((c) => c.classList.remove("active"));
        wishlistItemId.value = "";
        showStep(step1, step2);
      });
      document.getElementById("backBtn")?.addEventListener("click", () => showStep(step2, step1));

      const baseMinAmount = ${min};
      const videoMinAmount = Math.max(baseMinAmount, ${VIDEO_MIN_AMOUNT});
      const amountLabelText = document.getElementById("amountLabelText");
      const youtubeToggle = document.getElementById("youtubeToggle");
      const youtubeFields = document.getElementById("youtubeFields");
      const youtubeToggleLabel = document.getElementById("youtubeToggleLabel");
      youtubeToggle.addEventListener("click", () => {
        const expanded = youtubeFields.classList.toggle("hidden") === false;
        youtubeToggle.classList.toggle("expanded", expanded);
        youtubeToggleLabel.textContent = expanded ? "Batalkan video YouTube" : "Tambahin video YouTube (opsional)";
        amountInput.min = expanded ? videoMinAmount : baseMinAmount;
        amountLabelText.textContent = expanded
          ? "Nominal (Rp, minimal " + videoMinAmount.toLocaleString("id-ID") + " karena pakai video)"
          : "Nominal (Rp, minimal " + baseMinAmount.toLocaleString("id-ID") + ")";
        if (!expanded) {
          document.getElementById("youtubeUrl").value = "";
          document.getElementById("youtubeStart").value = "";
          document.getElementById("youtubeEnd").value = "";
        }
      });

      document.querySelectorAll(".detail-toggle").forEach((btn) => {
        btn.addEventListener("click", () => {
          btn.previousElementSibling?.querySelector(".contrib-rest")?.classList.remove("hidden");
          btn.style.display = "none";
        });
      });
      document.getElementById("supportersToggle")?.addEventListener("click", (e) => {
        document.querySelectorAll(".supporters li.more-hidden").forEach((li) => li.classList.remove("more-hidden"));
        e.currentTarget.style.display = "none";
      });
      document.getElementById("messagesToggle")?.addEventListener("click", (e) => {
        document.querySelectorAll(".message-item.more-hidden").forEach((el) => el.classList.remove("more-hidden"));
        e.currentTarget.style.display = "none";
      });
    </script>
  </body></html>`);
}

export async function handleDonateCreate(req, res) {
  const settings = await db.getDonationSettingsByIdentifier(req.params.identifier);
  if (!settings?.gateway_url || !settings?.gateway_api_key) {
    return res.status(404).send("Halaman donasi belum diaktifkan untuk server ini.");
  }
  const guildId = settings.guild_id;

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < settings.min_amount) {
    return res.status(400).send(`Jumlah minimal Rp${settings.min_amount.toLocaleString("id-ID")}.`);
  }
  const donorName = (req.body.donorName || "").trim().slice(0, 40) || "Anonim";
  const donorEmail = (req.body.donorEmail || "").trim().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(donorEmail)) {
    return res.status(400).send("Masukkan alamat email yang valid.");
  }
  const message = (req.body.message || "").trim().slice(0, 200) || null;
  const rawWishlistItemId = req.body.wishlistItemId ? Number(req.body.wishlistItemId) : null;
  const wishlistItem = rawWishlistItemId ? await db.getWishlistItem(guildId, rawWishlistItemId) : null;
  const youtubeVideoId = extractYouTubeId(req.body.youtubeUrl);
  if (youtubeVideoId && amount < Math.max(settings.min_amount, VIDEO_MIN_AMOUNT)) {
    return res.status(400).send(`Minimal donasi Rp${VIDEO_MIN_AMOUNT.toLocaleString("id-ID")} kalau mau nyertain video YouTube.`);
  }
  let youtubeStartSeconds = youtubeVideoId ? parseTimeToSeconds(req.body.youtubeStart) : null;
  let youtubeEndSeconds = youtubeVideoId ? parseTimeToSeconds(req.body.youtubeEnd) : null;
  if (youtubeEndSeconds != null && youtubeEndSeconds <= (youtubeStartSeconds || 0)) youtubeEndSeconds = null;

  let qris;
  try {
    qris = await createQris({ baseUrl: settings.gateway_url, apiKey: settings.gateway_api_key, amount });
  } catch (err) {
    logError(`create-qris failed for guild ${guildId}:`, err);
    return res.status(502).send("Gagal membuat QRIS. Coba lagi sebentar.");
  }

  try {
    await db.createDonation({
      guildId,
      trxId: qris.trx_id,
      donorName,
      donorEmail,
      message,
      amount: qris.amount,
      expiresAt: qris.expires_at ? new Date(qris.expires_at) : null,
      wishlistItemId: wishlistItem?.id || null,
      youtubeVideoId,
      youtubeStartSeconds,
      youtubeEndSeconds,
    });
  } catch (err) {
    logError(`Failed to store donation for guild ${guildId}:`, err);
    return res.status(500).send("Gagal menyimpan data donasi.");
  }

  const expiresAt = qris.expires_at ? new Date(qris.expires_at).getTime() : null;

  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Scan untuk Bayar</title>
    ${CHECKOUT_STYLE}
    </head><body style="text-align:center">
    <div class="card">
      <h1 style="margin:0 0 4px;font-size:20px">Scan QRIS ini</h1>
      ${wishlistItem ? `<p class="hint">Patungan ke wishlist <strong>${escapeHtml(wishlistItem.title)}</strong></p>` : ""}
      <div style="display:inline-block;margin:8px 0;padding:6px 16px;background:var(--track);
        border-radius:999px;font-size:22px;font-weight:800;color:var(--green)">Rp${Number(qris.amount).toLocaleString("id-ID")}</div>
      <div style="margin:14px auto 0;padding:10px;background:#fff;border:1px solid var(--border);border-radius:12px;max-width:260px">
        <img src="${escapeHtml(qrisImageUrl(settings.gateway_url, qris.qris_id))}" alt="Kode QRIS" style="width:100%;display:block" />
      </div>
      <p id="status" style="font-weight:700;margin:16px 0 4px">⏳ Menunggu pembayaran...</p>
      ${expiresAt ? `<p id="countdown" class="hint"></p>` : ""}
    </div>
    <script>
      const trxId = ${JSON.stringify(qris.trx_id)};
      const expiresAt = ${JSON.stringify(expiresAt)};
      let done = false;

      function tickCountdown() {
        if (done || !expiresAt) return;
        const secondsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
        const el = document.getElementById("countdown");
        if (el) el.textContent = secondsLeft > 0 ? "Kedaluwarsa dalam " + Math.floor(secondsLeft / 60) + ":" + String(secondsLeft % 60).padStart(2, "0") : "";
      }
      setInterval(tickCountdown, 1000);
      tickCountdown();

      async function poll() {
        if (done) return;
        try {
          const res = await fetch("/donate/status/" + trxId);
          const data = await res.json();
          if (data.status === "paid") {
            done = true;
            document.getElementById("status").textContent = "✅ Terima kasih atas dukungannya!";
            return;
          }
          if (data.status === "expired") {
            done = true;
            document.getElementById("status").textContent = "⌛ QRIS sudah kedaluwarsa, silakan buat ulang.";
            return;
          }
        } catch {}
        setTimeout(poll, 4000);
      }
      poll();
    </script>
  </body></html>`);
}

export async function handleDonateStatus(req, res) {
  const donation = await db.getDonationByTrxId(req.params.trxId);
  if (!donation) return res.status(404).json({ status: "not_found" });
  res.json({ status: donation.status });
}

export async function handleDonateAvatar(req, res) {
  const settings = await db.getDonationSettingsByIdentifier(req.params.identifier);
  if (!settings?.avatar_data) return res.status(404).end();
  res.set("Content-Type", settings.avatar_mime || "image/png");
  res.set("Cache-Control", "no-cache");
  res.send(Buffer.from(settings.avatar_data, "base64"));
}

export async function handleOverlayPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;overflow:hidden;font-family:'Inter',sans-serif}

      #unlock{position:fixed;top:16px;right:16px;padding:8px 14px;border-radius:999px;background:rgba(17,24,39,.85);
        color:#fff;font:600 12px 'Inter',sans-serif;cursor:pointer;border:1px solid rgba(255,255,255,.15);z-index:10}
      #unlock.hidden{display:none}

      #stage{position:fixed;bottom:56px;left:50%;width:340px;transform:translate(-50%,16px);
        display:flex;flex-direction:column;align-items:center;text-align:center;
        opacity:0;transition:opacity .4s ease,transform .4s ease}
      #stage.show{opacity:1;transform:translate(-50%,0)}
      #stage.hide{opacity:0;transform:translate(-50%,-10px)}
      @media (prefers-reduced-motion: reduce){
        #stage{transition:opacity .2s linear}
        #stage.show,#stage.hide{transform:translate(-50%,0)}
      }

      #avatar-wrap{position:relative;width:88px;height:88px;margin-bottom:14px}
      #avatar{width:100%;height:100%;border-radius:50%;background:radial-gradient(circle at 35% 30%,#4ade80,#16a34a);
        display:flex;align-items:center;justify-content:center;font-size:40px;
        box-shadow:0 4px 18px rgba(0,0,0,.35);overflow:hidden}
      #avatar img{width:100%;height:100%;object-fit:cover}
      .deco{position:absolute;font-size:20px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));animation:float 2.4s ease-in-out infinite}
      .deco.d1{top:-8px;left:-10px;animation-delay:0s}
      .deco.d2{top:-6px;right:-12px;font-size:16px;animation-delay:.4s}
      .deco.d3{bottom:-4px;left:50%;transform:translateX(-50%);font-size:15px;animation-delay:.8s}
      @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
      .deco.d3{animation-name:float-center}
      @keyframes float-center{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-5px)}}

      #line1{font-size:19px;font-weight:800;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.55);line-height:1.3}
      #line1 .name{color:#86efac}
      #line2{margin-top:4px;font-size:14px;font-weight:500;color:rgba(255,255,255,.92);
        text-shadow:0 1px 4px rgba(0,0,0,.55);max-width:300px}
    </style></head><body>
    <button id="unlock" type="button">🔈 Klik buat aktifin suara</button>
    <div id="stage">
      <div id="avatar-wrap">
        <div id="avatar">${settings.avatar_data ? `<img src="/overlay/${token}/avatar" alt="" />` : "🙏"}</div>
        <span class="deco d1">💛</span>
        <span class="deco d2">✨</span>
        <span class="deco d3">💚</span>
      </div>
      <div id="line1"></div>
      <p id="line2"></p>
    </div>
    <script>
      const stage = document.getElementById("stage");
      const unlockBtn = document.getElementById("unlock");
      const bellSound = new Audio("/overlay/assets/bell.wav");
      let audioUnlocked = false;

      // Browsers block audio/speech until this page gets a real click, a timer
      // doesn't count, so this only hides once that click genuinely happens.
      function unlockAudio() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        unlockBtn.classList.add("hidden");
        try {
          bellSound.volume = 0;
          bellSound.play().then(() => { bellSound.pause(); bellSound.currentTime = 0; bellSound.volume = 1; }).catch(() => {});
        } catch {}
      }
      unlockBtn.addEventListener("click", unlockAudio);
      document.addEventListener("click", unlockAudio);

      function chime() {
        bellSound.currentTime = 0;
        bellSound.play().catch(() => {});
      }

      function showDonation(d) {
        if (d.youtubeVideoId) return; // shown below the video widget instead
        const line1 = document.getElementById("line1");
        line1.innerHTML = "";
        const amountEl = document.createElement("span");
        amountEl.textContent = "Rp" + Number(d.amount).toLocaleString("id-ID") + " dari ";
        const nameEl = document.createElement("span");
        nameEl.className = "name";
        nameEl.textContent = d.donorName;
        line1.append(amountEl, nameEl);
        document.getElementById("line2").textContent = d.message || "";
        stage.classList.remove("hide");
        stage.classList.add("show");
        if (d.sound) chime();
        setTimeout(() => {
          stage.classList.add("hide");
          stage.classList.remove("show");
        }, 8000); // gives the TTS narration (arrives separately, a few seconds later) room to finish
      }
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("donation", (e) => showDonation(JSON.parse(e.data)));
      // Narration is generated server-side (Gemini TTS, always works the
      // same regardless of the viewer's browser/OS) and arrives a few
      // seconds after the "donation" event, so it's played on its own here.
      events.addEventListener("tts", (e) => {
        try {
          new Audio(JSON.parse(e.data).url).play().catch(() => {});
        } catch {}
      });
    </script>
  </body></html>`);
}

export async function handleOverlayEvents(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).end();
  subscribe(token, res);
}

export function handleOverlayAudio(req, res) {
  const buffer = getAudio(req.params.id);
  if (!buffer) return res.status(404).end();
  res.set("Content-Type", "audio/wav");
  res.send(buffer);
}

export async function handleOverlayAvatar(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings?.avatar_data) return res.status(404).end();
  res.set("Content-Type", settings.avatar_mime || "image/png");
  res.set("Cache-Control", "no-cache");
  res.send(Buffer.from(settings.avatar_data, "base64"));
}

export async function handleLeaderboardPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Inter',sans-serif}
      #board{width:260px}
      #board h3{margin:0 0 10px;font-size:12px;font-weight:700;color:rgba(255,255,255,.75);
        text-transform:uppercase;letter-spacing:.06em;text-shadow:0 1px 4px rgba(0,0,0,.55)}
      #list{list-style:none;margin:0;padding:0}
      #list li{display:flex;justify-content:space-between;gap:10px;margin:8px 0;font-size:14px;font-weight:700;color:#fff;
        text-shadow:0 1px 4px rgba(0,0,0,.55)}
      #list .rank{color:#4ade80;font-weight:800;width:20px}
      #list .amount{font-weight:800;color:rgba(255,255,255,.9)}
    </style></head><body>
    <div id="board"><h3>Top Donatur</h3><ol id="list"></ol></div>
    <script>
      function render(leaderboard) {
        const list = document.getElementById("list");
        list.innerHTML = "";
        leaderboard.forEach((d, i) => {
          const li = document.createElement("li");
          const rank = document.createElement("span");
          rank.className = "rank";
          rank.textContent = "#" + (i + 1);
          const name = document.createElement("span");
          name.textContent = d.donorName;
          const amount = document.createElement("span");
          amount.className = "amount";
          amount.textContent = "Rp" + Number(d.total).toLocaleString("id-ID");
          li.append(rank, name, amount);
          list.appendChild(li);
        });
      }
      fetch(${JSON.stringify(`/overlay/${token}/leaderboard/data`)}).then((r) => r.json()).then((d) => render(d.leaderboard));
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("leaderboard", (e) => render(JSON.parse(e.data).leaderboard));
    </script>
  </body></html>`);
}

export async function handleLeaderboardData(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).json({ leaderboard: [] });
  const leaderboard = await db.getDonationLeaderboard(settings.guild_id, 10);
  res.json({ leaderboard });
}

export async function handleWishlistPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Inter',sans-serif}
      #board{width:300px}
      #board h3{margin:0 0 10px;font-size:12px;font-weight:700;color:rgba(255,255,255,.75);
        text-transform:uppercase;letter-spacing:.06em;text-shadow:0 1px 4px rgba(0,0,0,.55)}
      #empty{font-size:13px;color:rgba(255,255,255,.7);text-shadow:0 1px 4px rgba(0,0,0,.55)}
      #current{opacity:0;transition:opacity .4s ease}
      #current.show{opacity:1}
      @media (prefers-reduced-motion: reduce){#current{transition:none}}
      .item-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:16px;font-weight:800;color:#fff;
        margin-bottom:4px;text-shadow:0 1px 4px rgba(0,0,0,.55)}
      .item-top .title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .item-top .pct{flex:none;font-size:13px;font-weight:800;color:#4ade80}
      .item-top .pct.done{color:#fbbf24}
      .item-amounts{font-size:12px;font-weight:600;color:rgba(255,255,255,.8);margin-bottom:6px;text-shadow:0 1px 4px rgba(0,0,0,.55)}
      .bar{height:6px;background:rgba(255,255,255,.25);border-radius:999px;overflow:hidden}
      .bar-fill{height:100%;background:linear-gradient(90deg,#22c55e,#4ade80);border-radius:999px;transition:width .5s ease}
      .bar-fill.done{background:linear-gradient(90deg,#f59e0b,#fbbf24);box-shadow:0 0 8px rgba(251,191,36,.6)}
    </style></head><body>
    <div id="board">
      <h3>Wishlist</h3>
      <div id="current"><div class="item-top"><span class="title" id="curTitle"></span><span class="pct" id="curPct"></span></div>
        <div class="item-amounts" id="curAmounts"></div>
        <div class="bar"><div class="bar-fill" id="curBar"></div></div>
      </div>
      <p id="empty" style="display:none">Belum ada wishlist.</p>
    </div>
    <script>
      const ROTATE_MS = 6000;
      let items = [];
      let idx = 0;
      let rotateTimer = null;
      const current = document.getElementById("current");
      const empty = document.getElementById("empty");

      function paint() {
        if (!items.length) return;
        const w = items[idx % items.length];
        const pct = Math.min(100, Math.round((w.total / w.target_amount) * 100));
        const done = pct >= 100;
        document.getElementById("curTitle").textContent = w.title;
        const pctEl = document.getElementById("curPct");
        pctEl.textContent = done ? "Tercapai" : pct + "%";
        pctEl.classList.toggle("done", done);
        document.getElementById("curAmounts").textContent =
          "Rp" + Number(w.total).toLocaleString("id-ID") + " / Rp" + Number(w.target_amount).toLocaleString("id-ID");
        const bar = document.getElementById("curBar");
        bar.classList.toggle("done", done);
        bar.style.width = pct + "%";
      }

      function showCurrent() {
        current.classList.remove("show");
        setTimeout(() => { paint(); current.classList.add("show"); }, items.length > 1 ? 250 : 0);
      }

      function setItems(nextItems) {
        items = nextItems;
        empty.style.display = items.length ? "none" : "block";
        current.style.display = items.length ? "block" : "none";
        idx = idx % Math.max(items.length, 1);
        clearInterval(rotateTimer);
        showCurrent();
        if (items.length > 1) {
          rotateTimer = setInterval(() => {
            idx = (idx + 1) % items.length;
            showCurrent();
          }, ROTATE_MS);
        }
      }

      fetch(${JSON.stringify(`/overlay/${token}/wishlist/data`)}).then((r) => r.json()).then((d) => setItems(d.items));
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("wishlist", (e) => setItems(JSON.parse(e.data).items));
    </script>
  </body></html>`);
}

export async function handleWishlistData(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).json({ items: [] });
  const items = await db.listWishlistItemsWithProgress(settings.guild_id);
  res.json({ items });
}

// Duration scales with the donation: Rp1.000 = 1s of video, floored/capped
// so a tiny donation still gets something watchable and a huge one can't
// hijack the stream indefinitely.
const VIDEO_RP_PER_SECOND = 1000;
const VIDEO_MIN_SECONDS = 10;
const VIDEO_MAX_SECONDS = 120;

export async function handleVideoPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;overflow:hidden;font-family:'Inter',sans-serif}
      #unlock{position:fixed;top:16px;right:16px;padding:8px 14px;border-radius:999px;background:rgba(17,24,39,.85);
        color:#fff;font:600 12px 'Inter',sans-serif;cursor:pointer;border:1px solid rgba(255,255,255,.15);z-index:10}
      #unlock.hidden{display:none}
      #wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        opacity:0;transition:opacity .3s ease}
      #wrap.show{opacity:1}
      #player{width:100%;flex:1;min-height:0}
      #caption{flex:none;padding:10px 16px 4px;text-align:center}
      #capLine1{font-size:16px;font-weight:700;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.55)}
      #capLine1 .name{color:#86efac}
      #capLine2{margin-top:2px;font-size:13px;font-weight:500;color:rgba(255,255,255,.9);text-shadow:0 1px 4px rgba(0,0,0,.55)}
    </style></head><body>
    <button id="unlock" type="button">🔈 Klik buat aktifin suara</button>
    <div id="wrap"><div id="player"></div><div id="caption"><div id="capLine1"></div><div id="capLine2"></div></div></div>
    <script src="https://www.youtube.com/iframe_api"></script>
    <script>
      const wrap = document.getElementById("wrap");
      const unlockBtn = document.getElementById("unlock");
      let audioUnlocked = false;
      function unlockAudio() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        unlockBtn.classList.add("hidden");
      }
      unlockBtn.addEventListener("click", unlockAudio);
      document.addEventListener("click", unlockAudio);

      function showCaption(item) {
        const line1 = document.getElementById("capLine1");
        line1.innerHTML = "";
        const amountEl = document.createElement("span");
        amountEl.textContent = "Rp" + item.amount.toLocaleString("id-ID") + " dari ";
        const nameEl = document.createElement("span");
        nameEl.className = "name";
        nameEl.textContent = item.donorName;
        line1.append(amountEl, nameEl);
        document.getElementById("capLine2").textContent = item.message || "";
      }

      function clearCaption() {
        document.getElementById("capLine1").textContent = "";
        document.getElementById("capLine2").textContent = "";
      }

      let player = null;
      let ready = false;
      let hideTimer = null;
      const queue = [];

      function onYouTubeIframeAPIReady() {
        player = new YT.Player("player", {
          playerVars: { autoplay: 1, playsinline: 1, controls: 0, modestbranding: 1 },
          events: {
            onReady: () => { ready = true; drain(); },
            onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) hideVideo(); },
          },
        });
      }
      window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

      function drain() {
        if (!ready || !queue.length) return;
        playVideo(queue.shift());
      }

      // The donor's chosen clip length (end - start) wins when given; otherwise
      // it falls back to the amount-scaled length from the start point. Either
      // way it's clamped to [MIN,MAX] so the admin's cap always holds.
      function durationMsFor(item) {
        const requested = item.end != null ? item.end - item.start : Math.floor(item.amount / ${VIDEO_RP_PER_SECOND});
        const seconds = Math.min(${VIDEO_MAX_SECONDS}, Math.max(${VIDEO_MIN_SECONDS}, requested));
        return seconds * 1000;
      }

      function playVideo(item) {
        clearTimeout(hideTimer);
        player.loadVideoById({ videoId: item.videoId, startSeconds: item.start });
        player.unMute?.();
        wrap.classList.add("show");
        showCaption(item);
        hideTimer = setTimeout(hideVideo, durationMsFor(item));
      }

      function hideVideo() {
        clearTimeout(hideTimer);
        wrap.classList.remove("show");
        clearCaption();
        try { player?.stopVideo(); } catch {}
      }

      const events = new EventSource(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("donation", (e) => {
        const d = JSON.parse(e.data);
        if (!d.youtubeVideoId) return;
        queue.push({
          videoId: d.youtubeVideoId,
          amount: Number(d.amount) || 0,
          start: d.youtubeStart || 0,
          end: d.youtubeEnd ?? null,
          donorName: d.donorName,
          message: d.message,
        });
        drain();
      });
    </script>
  </body></html>`);
}
