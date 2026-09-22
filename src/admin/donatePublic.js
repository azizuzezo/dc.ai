import * as db from "../services/db.js";
import { createQris, qrisImageUrl } from "../services/gopayGateway.js";
import { subscribe } from "../services/donationOverlay.js";
import { acquireLiveConnection, releaseLiveConnection } from "../services/tiktokLiveEvents.js";
import { getAudio } from "../services/ttsCache.js";
import { extractYouTubeId, parseTimeToSeconds } from "../services/youtube.js";
import { logError } from "../services/logger.js";
import { escapeHtml } from "./htmlEscape.js";

/** Attaching a YouTube clip requires a bigger donation than the guild's own minimum. */
const VIDEO_MIN_AMOUNT = 25000;

/** Simplified, single-color social glyphs (not the exact trademarked logos) for the donate page's profile link row. */
const SOCIAL_ICONS = {
  tiktok:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.6-2.6c.2 0 .4.02.6.06V9.66a5.85 5.85 0 0 0-.6-.03c-3.2 0-5.79 2.6-5.79 5.79s2.6 5.79 5.79 5.79 5.79-2.6 5.79-5.79V9.01a7.3 7.3 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z"/></svg>',
  instagram:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/></svg>',
  youtube:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor" stroke="none"/></svg>',
  twitter:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.9 3H21l-6.6 7.6L22 21h-6.4l-5-6.5L4.7 21H2.6l7-8.1L2 3h6.5l4.5 6 5.9-6z"/></svg>',
};

/** Clean green checkout style (matches the streamer's SociaBuzz reference) for the donate form + QR pages. */
const CHECKOUT_STYLE = `
  <link rel="icon" type="image/png" href="/overlay/assets/patungan.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    /* Colors/font matched exactly against sociabuzz.com's own computed styles
       (getComputedStyle on their live donate page): brand green #76cc11,
       "Open Sans", white page background, #e5e5e5 progress track. */
    :root{--green:#76cc11;--green-light:#93dc3e;--green-deep:#5da80d;
      --ink:#122e1e;--muted:#5b7267;--border:#d7ebdc;--track:#e5e5e5;--page-bg:#fff;
      --rank-1:#76cc11;--rank-2:#93dc3e;--rank-3:#aced60;--rank-other:#dddddd;
      --ease:cubic-bezier(.16,1,.3,1)}
    *{box-sizing:border-box}
    body{font-family:'Open Sans',sans-serif;max-width:440px;margin:0 auto;padding:32px 16px 48px;background:var(--page-bg);color:var(--ink)}
    /* On a real desktop viewport (not just a resized phone view), give the
       wishlist grid room to actually be a grid instead of two squeezed
       columns, while keeping the header/form/lists at a readable column
       width like the reference layout does. */
    @media (min-width:820px){
      body{max-width:680px}
      .header-block,.card,.section{max-width:460px;margin-left:auto;margin-right:auto}
      .section.section-wide{max-width:680px}
    }
    .card{background:#fff;border:1px solid var(--border);border-radius:16px;
      box-shadow:0 1px 2px rgba(18,46,30,.04),0 12px 28px -16px rgba(18,46,30,.14);padding:22px}
    label{display:block;font-size:13px;font-weight:600;margin:16px 0 6px}
    .required-mark{color:#dc2626;margin-left:2px}
    .social-links{display:flex;justify-content:center;gap:14px;margin-top:10px}
    .social-links a{display:flex;align-items:center;justify-content:center;width:34px;height:34px;
      border-radius:50%;background:var(--track);color:var(--ink);transition:transform .25s var(--ease),background .25s var(--ease)}
    .social-links a:hover{background:var(--border);transform:translateY(-2px)}
    input[type=text],input[type=number],input[type=email],textarea{width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--border);
      background:#fff;color:var(--ink);font:500 15px 'Open Sans',sans-serif;transition:border-color .15s ease}
    input[type=text]:hover,input[type=number]:hover,input[type=email]:hover,textarea:hover{border-color:#c3c9d1}
    input:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid var(--green);outline-offset:2px}
    input:invalid:not(:placeholder-shown){border-color:#dc2626}
    textarea{resize:vertical}
    button{font:800 15px 'Open Sans',sans-serif;border:none;border-radius:999px;cursor:pointer}
    .btn-primary{width:100%;padding:14px;margin-top:18px;background:var(--green);color:#fff;
      box-shadow:0 1px 2px rgba(21,128,61,.15)}
    .btn-primary:hover{background:var(--green-deep);transform:translateY(-1px);box-shadow:0 10px 24px -8px rgba(21,128,61,.45)}
    .pill{padding:9px 4px;background:#fff;color:var(--ink);font-size:14px;border:1px solid var(--border);border-radius:999px}
    .pill.active{background:var(--green);color:#fff;border-color:var(--green)}
    .pills{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
    .hint{font-size:12px;color:var(--muted);margin-top:2px}
    .counter{font-size:12px;color:var(--muted);text-align:right}
    .check{display:flex;align-items:flex-start;gap:8px;font-size:13px;font-weight:500;margin-top:14px}
    .check input{width:18px;height:18px;margin-top:2px;accent-color:var(--green)}
    .bar{height:16px;background:var(--track);border-radius:10px;margin-top:8px;overflow:hidden}
    .bar-fill{height:100%;background:var(--green)}
    .hidden{display:none}
    .divider{border:none;border-top:1px solid var(--border);margin:28px 0 0}
    .section{margin-top:24px}
    .section-title{font-size:21px;font-weight:800;text-align:center;margin:0 0 16px;letter-spacing:-.01em}
    .link-btn{display:block;background:none;border:none;padding:0;margin-top:8px;
      font:600 13px 'Open Sans',sans-serif;color:var(--green);cursor:pointer;text-decoration:underline}

    .wishlist-grid{display:grid;grid-template-columns:1fr;gap:14px}
    @media (min-width:480px){.wishlist-grid{grid-template-columns:1fr 1fr}}
    .wish-card{border:1px solid var(--border);border-radius:14px;padding:16px;background:#fff;
      box-shadow:0 1px 2px rgba(18,46,30,.04)}
    .wish-card.active{border-color:var(--green);box-shadow:0 0 0 1px var(--green)}
    .wish-card .wish-title{font-weight:800;font-size:15px}
    .wish-target{font-size:12px;color:var(--muted);margin-top:4px}
    .wish-current{font-size:13px;font-weight:700;margin:2px 0 8px}
    .wish-contrib{font-size:12px;color:var(--muted);margin-top:10px;line-height:1.5}
    .wish-pick{width:100%;margin-top:14px;padding:11px;font-size:14px}

    .range-select{display:block;width:100%;margin:0 0 14px;padding:9px 12px;border-radius:10px;
      border:1px solid var(--border);background:#fff;color:var(--ink);font:500 13px 'Open Sans',sans-serif}
    .supporters{list-style:none;margin:0;padding:0}
    .supporters .empty-row{color:var(--muted);font-size:13px;padding:9px 0;border-bottom:none}
    .supporters li{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)}
    .supporters li:last-child{border-bottom:none}
    .supporters li.more-hidden{display:none}
    .rank-badge{width:26px;height:26px;border-radius:50%;background:var(--rank-other);color:#fff;font-weight:800;font-size:12px;
      display:flex;align-items:center;justify-content:center;flex:none}
    .rank-badge.rank-1{background:var(--rank-1)}
    .rank-badge.rank-2{background:var(--rank-2)}
    .rank-badge.rank-3{background:var(--rank-3)}
    .supporter-name{font-weight:700;font-size:14px}

    .message-item{padding:14px 0;border-bottom:1px solid var(--border)}
    .message-item:last-child{border-bottom:none}
    .message-item.more-hidden{display:none}
    .message-name{font-weight:700;font-size:14px}
    .message-wishlist{font-size:12px;color:var(--green);margin-top:2px}
    .message-text{font-size:14px;margin-top:4px}

    .yt-toggle{display:flex;align-items:center;gap:8px;width:100%;margin-top:16px;padding:11px 14px;
      background:#fff;border:1px solid var(--border);border-radius:10px;font:600 14px 'Open Sans',sans-serif;
      color:var(--ink);cursor:pointer;text-align:left}
    .yt-toggle:hover{border-color:var(--green)}
    .yt-toggle.expanded{border-color:var(--green);background:#f0fdf4}
    .yt-toggle svg{flex:none}
    .yt-toggle:disabled{cursor:not-allowed;opacity:.55;background:#f6f7f8}
    .yt-toggle:disabled:hover{border-color:var(--border)}
    .yt-toggle .lock-icon{flex:none;color:var(--muted)}

    #step1.hidden,#step2.hidden{display:none}
    #step2 .back-btn{display:flex;align-items:center;gap:4px;margin-bottom:14px;
      background:none;border:none;padding:0;font:600 14px 'Open Sans',sans-serif;color:var(--muted);cursor:pointer}
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
    .fade-in{opacity:0;animation:fade-up .6s var(--ease) forwards}
    .reveal{opacity:0;transform:translateY(20px);transition:opacity .6s var(--ease),transform .6s var(--ease)}
    .reveal.in-view{opacity:1;transform:translateY(0)}
    .bar-fill{transition:width 1s var(--ease)}
    button{transition:transform .2s var(--ease), box-shadow .2s var(--ease), background .2s var(--ease), border-color .2s var(--ease)}
    .btn-primary:active{transform:scale(.96)}
    .wish-pick:active{transform:scale(.96)}
    /* Cards also need a fast hover-lift transform, which would otherwise fight
       the slower reveal-on-scroll transform on the same property — so the
       card's own entrance is a plain fade (no translateY), and only hover
       uses transform. */
    .wish-card.reveal{transform:none}
    .wish-card{transition:opacity .6s var(--ease), transform .25s var(--ease), box-shadow .25s var(--ease), border-color .25s var(--ease)}
    .wish-card:hover{transform:translateY(-4px);box-shadow:0 14px 28px -12px rgba(21,128,61,.25);border-color:#bfe6cc}
    .pill:hover{border-color:var(--green)}
    .pill:active{transform:scale(.94)}
    @media (prefers-reduced-motion: reduce){
      #avatarCircle,.fade-in,.bar-fill,button,.wish-card,.view-enter,.reveal{animation:none !important;transition:none !important}
      .fade-in,.reveal{opacity:1 !important;transform:none !important}
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
    ? `<img src="/${identifier}/avatar" alt="" style="width:100%;height:100%;object-fit:cover" />`
    : initial;
  const socialLinks = [
    { url: settings.tiktok_url, label: "TikTok", icon: SOCIAL_ICONS.tiktok },
    { url: settings.instagram_url, label: "Instagram", icon: SOCIAL_ICONS.instagram },
    { url: settings.youtube_url, label: "YouTube", icon: SOCIAL_ICONS.youtube },
    { url: settings.twitter_url, label: "Twitter/X", icon: SOCIAL_ICONS.twitter },
  ].filter((s) => s.url);
  const socialLinksHtml = socialLinks.length
    ? `<div class="social-links">
         ${socialLinks
           .map(
             (s) =>
               `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(s.label)}">${s.icon}</a>`
           )
           .join("")}
       </div>`
    : "";
  const min = settings.min_amount;
  const presets = [10000, 25000, 50000, 100000, 200000, 500000].filter((v) => v >= min).slice(0, 6);
  if (!presets.length) presets.push(min, min * 2, min * 5);
  const wishlistItems = await db.listWishlistItemsWithProgress(settings.guild_id);
  const preselectedWishlistId = req.query.wishlist ? Number(req.query.wishlist) : null;
  const hasPreselected = wishlistItems.some((w) => w.id === preselectedWishlistId);
  const wishlistTitleById = new Map(wishlistItems.map((w) => [w.id, w.title]));

  const wishlistSectionHtml = wishlistItems.length
    ? `<hr class="divider" />
       <div class="section section-wide reveal">
         <h2 class="section-title">Wishlist</h2>
         <div class="wishlist-grid">
           ${wishlistItems
             .map((w, i) => {
               const pct = Math.min(100, Math.round((w.total / w.target_amount) * 100));
               const active = hasPreselected && w.id === preselectedWishlistId;
               const contributors = w.contributors || [];
               const fmt = (c) => `${escapeHtml(c.donorName)} (Rp${Number(c.total).toLocaleString("id-ID")})`;
               const preview = contributors.slice(0, 3).map(fmt).join(", ");
               const rest = contributors.slice(3).map(fmt).join(", ");
               return `<div class="wish-card reveal${active ? " active" : ""}" style="transition-delay:${Math.min(i, 6) * 70}ms">
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
       <div class="section reveal">
         <h2 class="section-title">Top Supporters</h2>
         <select id="supportersRange" class="range-select">
           <option value="all">Sejak awal</option>
           <option value="30d">30 hari terakhir</option>
           <option value="7d">7 hari terakhir</option>
         </select>
         <ol class="supporters" id="supportersList">
           ${leaderboard
             .map(
               (d, i) => `<li class="${i >= 10 ? "more-hidden" : ""}">
                 <span class="rank-badge${i < 3 ? ` rank-${i + 1}` : ""}">${i + 1}</span>
                 <span class="supporter-name">${escapeHtml(d.donorName)}</span>
               </li>`
             )
             .join("")}
         </ol>
         <button type="button" class="link-btn" id="supportersToggle" style="text-align:center${leaderboard.length > 10 ? "" : ";display:none"}">Lihat semua</button>
       </div>`
    : "";

  const recentDonations = await db.listRecentPaidDonations(settings.guild_id, 30);
  const messages = recentDonations.filter((d) => d.message);
  const pesanHtml = messages.length
    ? `<hr class="divider" />
       <div class="section reveal">
         <button type="button" class="btn-primary main-cta" style="margin-top:0;margin-bottom:20px">Berikan Patungan</button>
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
      <div class="header-block fade-in" style="text-align:center;margin-bottom:20px">
        <div id="avatarCircle" style="width:76px;height:76px;border-radius:50%;background:var(--green);border:3px solid #fff;box-shadow:0 0 0 3px var(--green);
          display:flex;align-items:center;justify-content:center;margin:0 auto 10px;color:#fff;font-size:32px;font-weight:800;overflow:hidden">${avatarHtml}</div>
        <h1 style="margin:0;font-size:27px;letter-spacing:-.015em">${title}</h1>
        ${settings.description ? `<p style="margin:6px 0 0;color:var(--muted);font-size:14px">${escapeHtml(settings.description)}</p>` : ""}
        ${socialLinksHtml}
        <button type="button" class="btn-primary main-cta">Berikan Patungan</button>
      </div>
      ${wishlistSectionHtml}
      ${topSupportersHtml}
      ${pesanHtml}
    </div>
    <div id="step2" class="${hasPreselected ? "" : "hidden"}">
      <button type="button" class="back-btn" id="backBtn">&larr; Kembali</button>
      <form class="card" id="donateForm" method="post" action="/${identifier}">
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
          <svg id="youtubeLockIcon" class="lock-icon hidden" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
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
      const revealEls = document.querySelectorAll(".reveal");
      if ("IntersectionObserver" in window) {
        const revealObserver = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("in-view");
                revealObserver.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
        );
        revealEls.forEach((el) => revealObserver.observe(el));
      } else {
        revealEls.forEach((el) => el.classList.add("in-view"));
      }

      const amountInput = document.getElementById("amount");
      document.querySelectorAll(".pill").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".pill").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          amountInput.value = btn.dataset.amount;
          updateYoutubeLock();
        });
      });
      amountInput.addEventListener("input", () => {
        document.querySelectorAll(".pill").forEach((b) => b.classList.toggle("active", b.dataset.amount === amountInput.value));
        updateYoutubeLock();
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
      document.querySelectorAll(".main-cta").forEach((btn) => {
        btn.addEventListener("click", () => {
          wishCards.forEach((c) => c.classList.remove("active"));
          wishlistItemId.value = "";
          showStep(step1, step2);
        });
      });
      document.getElementById("backBtn")?.addEventListener("click", () => showStep(step2, step1));

      const baseMinAmount = ${min};
      const videoMinAmount = Math.max(baseMinAmount, ${VIDEO_MIN_AMOUNT});
      const amountLabelText = document.getElementById("amountLabelText");
      const youtubeToggle = document.getElementById("youtubeToggle");
      const youtubeFields = document.getElementById("youtubeFields");
      const youtubeToggleLabel = document.getElementById("youtubeToggleLabel");
      const youtubeLockIcon = document.getElementById("youtubeLockIcon");

      // Locked until the entered amount reaches the video minimum — reflects
      // the same ${VIDEO_MIN_AMOUNT} the server enforces in handleDonateCreate,
      // so donors see the requirement up front instead of after submitting.
      function updateYoutubeLock() {
        const locked = (Number(amountInput.value) || 0) < ${VIDEO_MIN_AMOUNT};
        youtubeToggle.disabled = locked;
        youtubeLockIcon.classList.toggle("hidden", !locked);
        if (locked) {
          youtubeToggleLabel.textContent = "Terkunci — minimal Rp" + (${VIDEO_MIN_AMOUNT}).toLocaleString("id-ID") + " buat pakai video";
          if (!youtubeFields.classList.contains("hidden")) {
            youtubeFields.classList.add("hidden");
            youtubeToggle.classList.remove("expanded");
            document.getElementById("youtubeUrl").value = "";
            document.getElementById("youtubeStart").value = "";
            document.getElementById("youtubeEnd").value = "";
            amountInput.min = baseMinAmount;
            amountLabelText.textContent = "Nominal (Rp, minimal " + baseMinAmount.toLocaleString("id-ID") + ")";
          }
        } else if (youtubeFields.classList.contains("hidden")) {
          youtubeToggleLabel.textContent = "Tambahin video YouTube (opsional)";
        }
      }
      updateYoutubeLock();

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
      const supportersToggle = document.getElementById("supportersToggle");
      supportersToggle?.addEventListener("click", (e) => {
        document.querySelectorAll(".supporters li.more-hidden").forEach((li) => li.classList.remove("more-hidden"));
        e.currentTarget.style.display = "none";
      });
      document.getElementById("messagesToggle")?.addEventListener("click", (e) => {
        document.querySelectorAll(".message-item.more-hidden").forEach((el) => el.classList.remove("more-hidden"));
        e.currentTarget.style.display = "none";
      });

      const supportersList = document.getElementById("supportersList");
      function renderSupporters(leaderboard) {
        supportersList.innerHTML = "";
        if (!leaderboard.length) {
          const empty = document.createElement("li");
          empty.className = "empty-row";
          empty.textContent = "Belum ada yang donasi di periode ini.";
          supportersList.appendChild(empty);
        }
        leaderboard.forEach((d, i) => {
          const li = document.createElement("li");
          if (i >= 10) li.classList.add("more-hidden");
          const rank = document.createElement("span");
          rank.className = "rank-badge" + (i < 3 ? " top" : "");
          rank.textContent = i + 1;
          const name = document.createElement("span");
          name.className = "supporter-name";
          name.textContent = d.donorName;
          li.append(rank, name);
          supportersList.appendChild(li);
        });
        if (supportersToggle) supportersToggle.style.display = leaderboard.length > 10 ? "" : "none";
      }
      document.getElementById("supportersRange")?.addEventListener("change", async (e) => {
        try {
          const res = await fetch(${JSON.stringify(`/${identifier}/supporters`)} + "?range=" + e.target.value);
          const data = await res.json();
          renderSupporters(data.leaderboard || []);
        } catch {}
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
          const res = await fetch("/status/" + trxId);
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

/** Top Supporters' time-range dropdown re-fetches through this, so switching ranges doesn't reload the page. */
export async function handleDonateSupporters(req, res) {
  const settings = await db.getDonationSettingsByIdentifier(req.params.identifier);
  if (!settings) return res.status(404).json({ leaderboard: [] });
  const sinceIso =
    req.query.range === "7d"
      ? new Date(Date.now() - 7 * 86400000).toISOString()
      : req.query.range === "30d"
        ? new Date(Date.now() - 30 * 86400000).toISOString()
        : null;
  const leaderboard = await db.getDonationLeaderboard(settings.guild_id, 25, sinceIso);
  res.json({ leaderboard });
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
      const bellSound = new Audio("/overlay/assets/bell.wav");
      let audioUnlocked = false;

      // OBS's Browser Source plays audio without a user gesture, but a plain
      // browser tab still blocks it until a real click happens — this quietly
      // primes the audio element on the first click if one ever occurs,
      // without showing any button for it.
      function unlockAudio() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        try {
          bellSound.volume = 0;
          bellSound.play().then(() => { bellSound.pause(); bellSound.currentTime = 0; bellSound.volume = 1; }).catch(() => {});
        } catch {}
      }
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
      // Narration is normally generated server-side (Gemini TTS) and arrives
      // a few seconds later as its own "tts" event. If that never shows up
      // (no API key configured, quota out, or generation failed), this falls
      // back to the viewer's own browser voice via the Web Speech API so the
      // donation still gets read out loud one way or another.
      let pendingNarration = null;
      let narrationFallbackTimer = null;
      function speakFallback(text) {
        if (!text || !("speechSynthesis" in window)) return;
        let spoken = false;
        const doSpeak = () => {
          if (spoken) return;
          spoken = true;
          try {
            const utter = new SpeechSynthesisUtterance(text);
            const voices = window.speechSynthesis.getVoices();
            const idVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("id"));
            if (idVoice) utter.voice = idVoice;
            utter.lang = idVoice ? idVoice.lang : "id-ID";
            window.speechSynthesis.speak(utter);
          } catch {}
        };
        // Chrome sometimes hasn't loaded any voices yet on the very first
        // call, and speak() then just silently does nothing — wait for
        // voiceschanged once, with a timeout in case it never fires.
        if (window.speechSynthesis.getVoices().length) {
          doSpeak();
        } else {
          window.speechSynthesis.addEventListener("voiceschanged", doSpeak, { once: true });
          setTimeout(doSpeak, 500);
        }
      }

      const events = new EventSource(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("donation", (e) => {
        const d = JSON.parse(e.data);
        showDonation(d);
        clearTimeout(narrationFallbackTimer);
        pendingNarration = d.narration || null;
        if (pendingNarration) {
          narrationFallbackTimer = setTimeout(() => {
            if (pendingNarration) speakFallback(pendingNarration);
            pendingNarration = null;
          }, 4000);
        }
      });
      events.addEventListener("tts", (e) => {
        clearTimeout(narrationFallbackTimer);
        pendingNarration = null;
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
      #wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        opacity:0;transition:opacity .3s ease}
      #wrap.show{opacity:1}
      #player{width:100%;flex:1;min-height:0}
      #caption{flex:none;padding:18px 20px 12px;text-align:center}
      #capLine1{font-size:38px;font-weight:800;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.65);line-height:1.2}
      #capLine1 .name{color:#86efac}
      #capLine2{margin-top:6px;font-size:24px;font-weight:600;color:rgba(255,255,255,.92);text-shadow:0 2px 8px rgba(0,0,0,.65)}
    </style></head><body>
    <div id="wrap"><div id="player"></div><div id="caption"><div id="capLine1"></div><div id="capLine2"></div></div></div>
    <script src="https://www.youtube.com/iframe_api"></script>
    <script>
      const wrap = document.getElementById("wrap");

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

// ---- Live chat & gift overlays (real TikTok LIVE events, not the donation pipeline) ----

export async function handleChatPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      /* Same white-card/green language as the Leaderboard/Wishlist overlays. */
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #feed{width:340px;display:flex;flex-direction:column;justify-content:flex-end;gap:6px;min-height:400px}
      .msg{display:flex;align-items:baseline;gap:6px;background:rgba(255,255,255,.97);border-radius:12px;
        padding:7px 12px;box-shadow:0 2px 10px rgba(0,0,0,.12);
        opacity:0;transform:translateY(6px);animation:msgIn .25s ease forwards}
      @keyframes msgIn{to{opacity:1;transform:translateY(0)}}
      @media (prefers-reduced-motion: reduce){.msg{animation:none;opacity:1;transform:none}}
      .msg .user{font-size:13px;font-weight:800;color:#76cc11;flex:none}
      .msg .text{color:#122e1e;font-size:13px;font-weight:400;word-break:break-word}
    </style></head><body>
    <div id="feed"></div>
    <script>
      const feed = document.getElementById("feed");
      const MAX_MESSAGES = 8;
      function addMessage(m) {
        const row = document.createElement("div");
        row.className = "msg";
        const user = document.createElement("span");
        user.className = "user";
        user.textContent = m.user + ":";
        const text = document.createElement("span");
        text.className = "text";
        text.textContent = m.message;
        row.append(user, text);
        feed.appendChild(row);
        while (feed.children.length > MAX_MESSAGES) feed.removeChild(feed.firstChild);
      }
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("chat", (e) => addMessage(JSON.parse(e.data)));
    </script>
  </body></html>`);
}

export async function handleGiftPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      /* Same white-card/green language as the other overlays. */
      html,body{margin:0;background:transparent;overflow:hidden;font-family:'Open Sans',sans-serif}
      #stage{position:fixed;bottom:56px;left:50%;transform:translate(-50%,16px);
        display:flex;align-items:stretch;background:rgba(255,255,255,.97);border-radius:14px;
        box-shadow:0 4px 20px rgba(0,0,0,.15);overflow:hidden;
        opacity:0;transition:opacity .3s ease,transform .3s ease}
      #stage.show{opacity:1;transform:translate(-50%,0)}
      @media (prefers-reduced-motion: reduce){#stage{transition:opacity .2s linear}#stage.show{transform:translate(-50%,0)}}
      #giftImg{width:48px;height:48px;flex:none;object-fit:cover;background:#e5e5e5;display:none}
      #giftText{font-size:15px;font-weight:700;color:#122e1e;padding:0 16px;display:flex;align-items:center;white-space:nowrap}
      #giftText .user{color:#122e1e}
      #giftText .name{color:#76cc11}
    </style></head><body>
    <div id="stage">
      <img id="giftImg" src="" alt="" onerror="this.style.display='none'" />
      <div id="giftText"></div>
    </div>
    <script>
      const stage = document.getElementById("stage");
      let hideTimer = null;
      function showGift(g) {
        const img = document.getElementById("giftImg");
        if (g.giftImage) { img.src = g.giftImage; img.style.display = ""; } else { img.style.display = "none"; }
        const text = document.getElementById("giftText");
        text.innerHTML = "";
        const userEl = document.createElement("span");
        userEl.className = "user";
        userEl.textContent = g.user;
        const nameEl = document.createElement("span");
        nameEl.className = "name";
        nameEl.textContent = g.giftName;
        text.append(userEl, document.createTextNode(" mengirim "), nameEl,
          document.createTextNode(g.repeatCount > 1 ? " x" + g.repeatCount + "!" : "!"));
        clearTimeout(hideTimer);
        stage.classList.add("show");
        hideTimer = setTimeout(() => stage.classList.remove("show"), 5000);
      }
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("gift", (e) => showGift(JSON.parse(e.data)));
    </script>
  </body></html>`);
}

export async function handleLiveEvents(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).end();
  if (!settings.tiktok_url) {
    return res.status(400).send("Username TikTok belum diset di halaman Tampilan.");
  }

  subscribe(token, res);
  acquireLiveConnection(token, settings);
  res.on("close", () => releaseLiveConnection(token));
}

export async function handleLikesPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #tag{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.97);color:#122e1e;
        font-size:20px;font-weight:800;padding:8px 18px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.15)}
    </style></head><body>
    <div id="tag">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#76cc11"><path d="M12 21s-6.7-4.35-9.3-8.1C1 10.1 1.6 6.6 4.6 5.1c2.3-1.15 4.7-.3 5.9 1.3l1.5 2 1.5-2c1.2-1.6 3.6-2.45 5.9-1.3 3 1.5 3.6 5 1.9 7.8C18.7 16.65 12 21 12 21z"/></svg>
      <span id="count">0</span>
    </div>
    <script>
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("likes", (e) => {
        document.getElementById("count").textContent = Number(JSON.parse(e.data).total).toLocaleString("id-ID");
      });
    </script>
  </body></html>`);
}

export async function handleFollowersPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #tag{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.97);color:#122e1e;
        font-size:20px;font-weight:800;padding:8px 18px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.15);
        transition:background .2s ease}
      #tag.flash{background:#eaffd6}
    </style></head><body>
    <div id="tag">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#76cc11" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>
      </svg>
      <span id="count">0</span><span>follower baru</span>
    </div>
    <script>
      const tag = document.getElementById("tag");
      let flashTimer = null;
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("follow", (e) => {
        document.getElementById("count").textContent = Number(JSON.parse(e.data).total).toLocaleString("id-ID");
        tag.classList.add("flash");
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => tag.classList.remove("flash"), 600);
      });
    </script>
  </body></html>`);
}

export async function handleSharePage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #tag{display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.97);color:#122e1e;
        font-size:20px;font-weight:800;padding:8px 18px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.15);
        transition:background .2s ease}
      #tag.flash{background:#eaffd6}
    </style></head><body>
    <div id="tag">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#76cc11" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/>
      </svg>
      <span id="count">0</span><span>share</span>
    </div>
    <script>
      const tag = document.getElementById("tag");
      let flashTimer = null;
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("share", (e) => {
        document.getElementById("count").textContent = Number(JSON.parse(e.data).total).toLocaleString("id-ID");
        tag.classList.add("flash");
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => tag.classList.remove("flash"), 600);
      });
    </script>
  </body></html>`);
}

export async function handleJarPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  // Visual fill is relative, not a real currency total — every JAR_STEP-th gift
  // fills the jar and it resets, so it keeps animating all stream long instead
  // of maxing out once and going static. Jar drawn as a real SVG shape (rounded
  // shoulders, glass highlight) instead of stacked rectangles.
  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #wrap{display:inline-block;text-align:center}
      #fill{transition:height .4s ease,y .4s ease}
      #label{margin-top:8px;text-align:center;color:#122e1e;background:rgba(255,255,255,.97);font-size:12px;
        font-weight:800;padding:4px 12px;display:inline-block;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.15)}
      .drop{position:absolute;color:#76cc11;font-size:14px;font-weight:700;animation:drop .6s ease forwards}
      @keyframes drop{to{transform:translateY(-30px);opacity:0}}
    </style></head><body>
    <div id="wrap">
      <svg width="90" height="140" viewBox="0 0 90 140">
        <rect x="30" y="4" width="30" height="10" rx="2" fill="#5da80d"/>
        <rect x="34" y="12" width="22" height="8" rx="1" fill="#4a8a0a"/>
        <path d="M20 30 Q20 22 30 20 L60 20 Q70 22 70 30 L70 118 Q70 128 60 128 L30 128 Q20 128 20 118 Z"
              fill="rgba(255,255,255,.9)" stroke="#5da80d" stroke-width="3"/>
        <clipPath id="jarClip"><path d="M21 31 Q21 23 30 21 L60 21 Q69 23 69 31 L69 118 Q69 127 60 127 L30 127 Q21 127 21 118 Z"/></clipPath>
        <rect id="fill" x="21" y="128" width="48" height="0" fill="#76cc11" clip-path="url(#jarClip)"/>
        <path d="M28 30 Q28 24 34 23" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <div id="label">Gift: <span id="count">0</span></div>
    </div>
    <script>
      const JAR_STEP = 10;
      const JAR_TOP = 21, JAR_BOTTOM = 127; // inner clip bounds, matches the SVG path above
      let total = 0;
      const fill = document.getElementById("fill");
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("gift", (e) => {
        const g = JSON.parse(e.data);
        total += g.repeatCount || 1;
        document.getElementById("count").textContent = total;
        const pct = (total % JAR_STEP) / JAR_STEP;
        const h = pct * (JAR_BOTTOM - JAR_TOP);
        fill.setAttribute("height", h);
        fill.setAttribute("y", JAR_BOTTOM - h);
      });
    </script>
  </body></html>`);
}

// ---- TikFinity-style feature widgets: Points, Sound Alerts, Actions & Events,
// Wheel of Fortune, Likeathon, Command Response, Points Drop ----

export async function handlePointsLeaderboardData(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).json({ leaderboard: [] });
  const rows = await db.listDonationPoints(settings.guild_id, { limit: 10 });
  res.json({ leaderboard: rows, currencyName: settings.points_currency_name });
}

export async function handlePointsLeaderboardPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #card{width:260px;background:rgba(255,255,255,.97);border-radius:14px;padding:14px 16px;box-shadow:0 4px 20px rgba(0,0,0,.15)}
      #card h3{margin:0 0 8px;color:#122e1e;font-size:15px}
      .row{display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:13px;color:#122e1e;border-top:1px solid #eee}
      .row:first-of-type{border-top:none}
      .rank{color:#76cc11;font-weight:800;width:1.4em;flex:none}
      .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .val{font-weight:700}
      #empty{color:#5b7267;font-size:12px}
    </style></head><body>
    <div id="card"><h3>Papan Poin</h3><div id="rows"><p id="empty">Belum ada data.</p></div></div>
    <script>
      async function refresh() {
        try {
          const res = await fetch(${JSON.stringify(`/overlay/${token}/points-leaderboard/data`)});
          const data = await res.json();
          const rowsEl = document.getElementById("rows");
          rowsEl.innerHTML = "";
          if (!data.leaderboard.length) { rowsEl.innerHTML = '<p id="empty">Belum ada data.</p>'; return; }
          data.leaderboard.forEach((r, i) => {
            const row = document.createElement("div");
            row.className = "row";
            row.innerHTML = '<span class="rank">#' + (i + 1) + '</span><span class="name"></span><span class="val"></span>';
            row.querySelector(".name").textContent = r.tiktok_user;
            row.querySelector(".val").textContent = Math.round(r.points) + " " + (data.currencyName || "Poin");
            rowsEl.appendChild(row);
          });
        } catch {}
      }
      refresh();
      setInterval(refresh, 5000);
    </script>
  </body></html>`);
}

export async function handleSoundAlertPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");
  const map = settings.sound_alert_map || {};

  res.send(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}
    #dot{width:10px;height:10px;border-radius:50%;background:#76cc11;opacity:.5}</style></head><body>
    <div id="dot" title="Sound Alert aktif"></div>
    <script>
      const map = ${JSON.stringify(map)};
      let volume = ${Number(settings.media_volume ?? 100)} / 100;
      // Plays one sound at a time — without this, a fast gift/follow/share
      // burst would fire several overlapping Audio() plays on top of each
      // other instead of a clean sequence.
      const queue = [];
      let playing = false;
      function playNext() {
        if (playing || !queue.length) return;
        playing = true;
        const url = queue.shift();
        const audio = new Audio(url);
        audio.volume = volume;
        audio.addEventListener("ended", () => { playing = false; playNext(); });
        audio.play().catch(() => { playing = false; playNext(); });
      }
      function play(key) {
        const cfg = map[key];
        if (!cfg || !cfg.enabled) return;
        queue.push(cfg.soundUrl || "/overlay/assets/bell.wav");
        playNext();
      }
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("gift", () => play("gift"));
      events.addEventListener("follow", () => play("follow"));
      events.addEventListener("share", () => play("share"));
      events.addEventListener("volume-change", (e) => { volume = JSON.parse(e.data).volume / 100; });
    </script>
  </body></html>`);
}

export async function handleActionsScreenPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");
  const screen = Number(req.query.screen) || 1;

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;overflow:hidden;font-family:'Open Sans',sans-serif}
      #stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
        opacity:0;transition:opacity .25s ease}
      #stage.show{opacity:1}
      #stage img,#stage video{max-width:90vw;max-height:90vh}
      #stage .caption{position:absolute;bottom:6%;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.6);color:#fff}
      #stage .name{font-size:22px;font-weight:800}
      #stage .desc{font-size:15px;font-weight:400;margin-top:.2rem}
    </style></head><body>
    <div id="stage"><div class="media"></div><div class="caption"><div class="name"></div><div class="desc"></div></div></div>
    <script>
      const SCREEN = ${JSON.stringify(screen)};
      let volume = ${Number(settings.media_volume ?? 100)} / 100;
      const stage = document.getElementById("stage");
      const mediaBox = stage.querySelector(".media");
      const nameBox = stage.querySelector(".name");
      const descBox = stage.querySelector(".desc");
      let queue = [];
      let playing = false;

      function playNext() {
        if (playing || !queue.length) return;
        playing = true;
        const action = queue.shift();
        mediaBox.innerHTML = "";
        if (action.mediaUrl) {
          const el = document.createElement(action.mediaType === "video" ? "video" : "img");
          el.src = action.mediaUrl;
          if (action.mediaType === "video") { el.autoplay = true; el.volume = volume; }
          mediaBox.appendChild(el);
        }
        nameBox.textContent = action.name || "";
        descBox.textContent = action.description || "";
        if (action.soundUrl) { const a = new Audio(action.soundUrl); a.volume = volume; a.play().catch(() => {}); }
        stage.classList.add("show");
        setTimeout(() => {
          stage.classList.remove("show");
          setTimeout(() => { playing = false; playNext(); }, 300);
        }, action.durationMs || 4000);
      }

      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("action", (e) => {
        const action = JSON.parse(e.data);
        if (Number(action.screen) !== SCREEN) return;
        queue.push(action);
        playNext();
      });
      events.addEventListener("volume-change", (e) => { volume = JSON.parse(e.data).volume / 100; });
    </script>
  </body></html>`);
}

export async function handleWheelPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");
  const options = (settings.wheel_config || []).filter((o) => o?.label);

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #wrap{position:relative;width:260px;height:260px}
      #wheel{width:100%;height:100%;border-radius:50%;border:6px solid #fff;box-shadow:0 4px 20px rgba(0,0,0,.25);
        transition:transform 4s cubic-bezier(.17,.67,.32,1.02)}
      #pointer{position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:0;height:0;
        border-left:14px solid transparent;border-right:14px solid transparent;border-top:22px solid #dc2626}
      #result{position:absolute;bottom:-38px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,.97);
        color:#122e1e;font-weight:800;padding:6px 14px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.15);
        white-space:nowrap;opacity:0;transition:opacity .3s ease}
      #result.show{opacity:1}
    </style></head><body>
    <div id="wrap">
      <div id="pointer"></div>
      <div id="wheel"></div>
      <div id="result"></div>
    </div>
    <script>
      const OPTIONS = ${JSON.stringify(options.map((o) => o.label))};
      const COLORS = ["#76cc11", "#5da80d", "#aced60", "#93dc3e"];
      const wheel = document.getElementById("wheel");
      let rotation = 0;
      function paintWheel() {
        if (!OPTIONS.length) return;
        const slice = 360 / OPTIONS.length;
        const stops = OPTIONS.map((_, i) => COLORS[i % COLORS.length] + " " + (i * slice) + "deg " + ((i + 1) * slice) + "deg").join(",");
        wheel.style.background = "conic-gradient(" + stops + ")";
      }
      paintWheel();
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("wheel", (e) => {
        const data = JSON.parse(e.data);
        const idx = Math.max(0, data.options.indexOf(data.result));
        const slice = 360 / (data.options.length || 1);
        const target = 360 * 4 - (idx * slice + slice / 2);
        rotation = target;
        wheel.style.transform = "rotate(" + rotation + "deg)";
        const resultEl = document.getElementById("result");
        setTimeout(() => {
          resultEl.textContent = data.result;
          resultEl.classList.add("show");
          setTimeout(() => resultEl.classList.remove("show"), 4000);
        }, 4000);
      });
    </script>
  </body></html>`);
}

export async function handleLikeathonPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #card{width:260px;background:rgba(255,255,255,.97);border-radius:14px;padding:14px 16px;box-shadow:0 4px 20px rgba(0,0,0,.15)}
      #card h3{margin:0 0 8px;color:#122e1e;font-size:15px;display:flex;align-items:center;gap:6px}
      #card h3::before{content:"❤️"}
      .row{display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:13px;color:#122e1e;border-top:1px solid #eee}
      .row:first-of-type{border-top:none}
      .rank{color:#76cc11;font-weight:800;width:1.4em;flex:none}
      .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    </style></head><body>
    <div id="card"><h3>Likeathon</h3><div id="rows"></div></div>
    <script>
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("likeathon", (e) => {
        const data = JSON.parse(e.data);
        const rowsEl = document.getElementById("rows");
        rowsEl.innerHTML = "";
        data.ranking.forEach((r, i) => {
          const row = document.createElement("div");
          row.className = "row";
          row.innerHTML = '<span class="rank">#' + (i + 1) + '</span><span class="name"></span><span class="val"></span>';
          row.querySelector(".name").textContent = r.user;
          row.querySelector(".val").textContent = r.count;
          rowsEl.appendChild(row);
        });
      });
    </script>
  </body></html>`);
}

export async function handleCommandResponsePage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #toast{max-width:420px;background:rgba(255,255,255,.97);color:#122e1e;font-size:14px;font-weight:700;
        padding:10px 16px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.15);
        opacity:0;transform:translateY(6px);transition:opacity .25s ease,transform .25s ease}
      #toast.show{opacity:1;transform:translateY(0)}
    </style></head><body>
    <div id="toast"></div>
    <script>
      const toast = document.getElementById("toast");
      let hideTimer = null;
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("command-response", (e) => {
        const data = JSON.parse(e.data);
        toast.textContent = data.text;
        toast.classList.add("show");
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => toast.classList.remove("show"), 4000);
      });
    </script>
  </body></html>`);
}

export async function handlePointsDropPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #banner{background:#76cc11;color:#fff;font-weight:800;font-size:16px;padding:10px 18px;border-radius:12px;
        box-shadow:0 4px 20px rgba(0,0,0,.15);opacity:0;transform:translateY(-8px);transition:opacity .25s ease,transform .25s ease}
      #banner.show{opacity:1;transform:translateY(0)}
    </style></head><body>
    <div id="banner"></div>
    <script>
      const banner = document.getElementById("banner");
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("points-drop", (e) => {
        const data = JSON.parse(e.data);
        if (data.active) {
          banner.textContent = "Points Drop aktif! Ketik !get sekarang (+" + data.bonus + ")";
          banner.classList.add("show");
        } else {
          banner.classList.remove("show");
        }
      });
    </script>
  </body></html>`);
}

export async function handleLinkPreviewPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #card{width:340px;background:rgba(255,255,255,.97);border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.15);
        opacity:0;transform:translateY(8px);transition:opacity .3s ease,transform .3s ease}
      #card.show{opacity:1;transform:translateY(0)}
      #card img{width:100%;height:140px;object-fit:cover;display:none;background:#e5e5e5}
      #card .body{padding:12px 14px}
      #card .user{font-size:11px;color:#76cc11;font-weight:800;text-transform:uppercase}
      #card .title{font-size:14px;font-weight:800;color:#122e1e;margin-top:2px}
      #card .desc{font-size:12px;color:#5b7267;margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    </style></head><body>
    <div id="card">
      <img id="cardImg" src="" alt="" onerror="this.style.display='none'" />
      <div class="body">
        <div class="user" id="cardUser"></div>
        <div class="title" id="cardTitle"></div>
        <div class="desc" id="cardDesc"></div>
      </div>
    </div>
    <script>
      const card = document.getElementById("card");
      let hideTimer = null;
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("link-preview", (e) => {
        const data = JSON.parse(e.data);
        const img = document.getElementById("cardImg");
        if (data.image) { img.src = data.image; img.style.display = "block"; } else { img.style.display = "none"; }
        document.getElementById("cardUser").textContent = data.user + " membagikan link";
        document.getElementById("cardTitle").textContent = data.title || data.url;
        document.getElementById("cardDesc").textContent = data.description || "";
        clearTimeout(hideTimer);
        card.classList.add("show");
        hideTimer = setTimeout(() => card.classList.remove("show"), 8000);
      });
    </script>
  </body></html>`);
}

export async function handleMediaServe(req, res) {
  const { token, id } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).end();
  const media = await db.getDonationMedia(settings.guild_id, id);
  if (!media) return res.status(404).end();
  res.set("Content-Type", media.mime_type);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(Buffer.from(media.data, "base64"));
}
