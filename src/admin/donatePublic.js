import * as db from "../services/db.js";
import { createQris, qrisImageUrl } from "../services/gopayGateway.js";
import { subscribe } from "../services/donationOverlay.js";
import { acquireLiveConnection, releaseLiveConnection } from "../services/tiktokLiveEvents.js";
import { getAudio } from "../services/ttsCache.js";
import { extractYouTubeId, parseTimeToSeconds } from "../services/youtube.js";
import { logError } from "../services/logger.js";
import { AVATAR_PRESETS } from "../services/alertPresets.js";
import { escapeHtml } from "./htmlEscape.js";

/** "#rrggbb" + 0-100 opacity -> "rgba(r,g,b,a)", for customizable overlay widget colors. */
function hexToRgba(hex, opacityPercent) {
  const clean = /^#?[0-9a-f]{6}$/i.test(hex) ? hex.replace("#", "") : "ffffff";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const a = Math.min(100, Math.max(0, Number(opacityPercent) || 0)) / 100;
  return `rgba(${r},${g},${b},${a})`;
}

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
    /* Layout/font matched against sociabuzz.com's own computed styles
       (getComputedStyle on their live donate page); accent color instead
       matches the Patungan "P" logo's blue gradient (#0e60fa - #2f9afd),
       "Open Sans", white page background, #e5e5e5 progress track. */
    :root{--green:#1e7dfb;--green-light:#4da3ff;--green-deep:#0b56d6;
      --ink:#16243b;--muted:#5b6b82;--border:#d7e5fb;--track:#e5e5e5;--page-bg:#fff;
      --rank-1:#1e7dfb;--rank-2:#4da3ff;--rank-3:#8ec4ff;--rank-other:#dddddd;
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
      box-shadow:0 1px 2px rgba(22,36,59,.04),0 12px 28px -16px rgba(22,36,59,.14);padding:22px}
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
      box-shadow:0 1px 2px rgba(30,125,251,.15)}
    .btn-primary:hover{background:var(--green-deep);transform:translateY(-1px);box-shadow:0 10px 24px -8px rgba(30,125,251,.45)}
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
      box-shadow:0 1px 2px rgba(22,36,59,.04)}
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
    .yt-toggle.expanded{border-color:var(--green);background:#eef5ff}
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
    @keyframes avatar-glow{0%,100%{box-shadow:0 0 0 3px var(--green)}50%{box-shadow:0 0 0 7px rgba(30,125,251,.3)}}
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
    .wish-card:hover{transform:translateY(-4px);box-shadow:0 14px 28px -12px rgba(30,125,251,.25);border-color:#bcd8fb}
    .pill:hover{border-color:var(--green)}
    .pill:active{transform:scale(.94)}
    @media (prefers-reduced-motion: reduce){
      #avatarCircle,.fade-in,.bar-fill,button,.wish-card,.view-enter,.reveal{animation:none !important;transition:none !important}
      .fade-in,.reveal{opacity:1 !important;transform:none !important}
    }

    .site-footer{margin-top:32px;padding-top:20px;border-top:1px solid var(--border);text-align:center}
    .site-footer .brand{display:flex;align-items:center;justify-content:center}
    .site-footer .brand img{height:17px;width:auto;margin-right:1px}
    .site-footer .brand span{font-weight:800;font-size:15px;color:var(--ink)}
    .site-footer .copyright{margin:6px 0 0;font-size:11px;color:var(--muted)}
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
        <input type="text" inputmode="numeric" class="rupiah-input" name="amount" id="amount" required style="margin-top:10px" placeholder="Atau isi nominal lain" />

        <label>Nama<span class="required-mark">*</span></label>
        <input type="text" name="donorName" id="donorName" maxlength="40" placeholder="Nama kamu" required />
        <label class="check"><input type="checkbox" id="anon" name="isAnonymous" /> Donasi sebagai Anonim</label>

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
    <footer class="site-footer">
      <div class="brand"><img src="/overlay/assets/patungan-mark.png" alt="P" /><span>atungan Yuk!</span></div>
      <p class="copyright">&copy; ${new Date().getFullYear()} Patungan. All Rights Reserved.</p>
    </footer>
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
          amountInput.dispatchEvent(new Event("input", { bubbles: true }));
          updateYoutubeLock();
        });
      });
      amountInput.addEventListener("input", () => {
        const rawAmount = amountInput.value.replace(/\\./g, "");
        document.querySelectorAll(".pill").forEach((b) => b.classList.toggle("active", b.dataset.amount === rawAmount));
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
        const locked = (Number(amountInput.value.replace(/\\./g, "")) || 0) < ${VIDEO_MIN_AMOUNT};
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
    <script src="/overlay/assets/rupiah-format.js"></script>
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
  const trimmedName = (req.body.donorName || "").trim().slice(0, 40);
  const isAnonymous = req.body.isAnonymous === "on";
  if (!isAnonymous && !trimmedName) {
    return res.status(400).send('Nama wajib diisi, atau centang "Donasi sebagai Anonim".');
  }
  const donorName = trimmedName || "Anonim";
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

const ALERT_APPEARANCE_DEFAULTS = {
  nameColor: "#86efac",
  fontFamily: "Inter",
  fontSize: 19,
  animation: "slide-up",
  showDecorations: true,
  layout: "classic",
  bannerColor: "#1d4ed8",
  bannerHeadline: "HEY!",
  highlightColor: "#fbbf24",
  avatarPreset: "photo",
};

/** Same shape as entranceKeyframes() above, but every transform keeps the
 * `-50%` X-anchor the Alert stage's `left:50%` centering relies on — a plain
 * slide-left/right here still needs to end up centered, not just offset. */
function centeredEntranceKeyframes(animation, distance = 16) {
  const d = distance;
  const settle = Math.round(d * 0.6);
  switch (animation) {
    case "slide-down":
      return { base: `translate(-50%,-${d}px)`, show: "translate(-50%,0)", hide: `translate(-50%,${settle}px)` };
    case "slide-left":
      return { base: `translate(calc(-50% + ${d}px),0)`, show: "translate(-50%,0)", hide: `translate(calc(-50% - ${settle}px),0)` };
    case "slide-right":
      return { base: `translate(calc(-50% - ${d}px),0)`, show: "translate(-50%,0)", hide: `translate(calc(-50% + ${settle}px),0)` };
    case "fade":
      return { base: "translate(-50%,0)", show: "translate(-50%,0)", hide: "translate(-50%,0)" };
    case "pop":
      return { base: "translate(-50%,0) scale(.5)", show: "translate(-50%,0) scale(1)", hide: "translate(-50%,0) scale(.92)" };
    case "slide-up":
    default:
      return { base: `translate(-50%,${d}px)`, show: "translate(-50%,0)", hide: `translate(-50%,-${settle}px)` };
  }
}

export async function handleOverlayPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");
  const alertStyle = { ...ALERT_APPEARANCE_DEFAULTS, ...(settings.alert_appearance || {}) };
  const alertFontStack = FONT_STACKS[alertStyle.fontFamily] || FONT_STACKS.Inter;
  const alertAnim = centeredEntranceKeyframes(alertStyle.animation, 16);
  const avatarPreset = AVATAR_PRESETS[alertStyle.avatarPreset] || AVATAR_PRESETS.photo;
  const defaultAvatarInner = avatarPreset.emoji
    ? avatarPreset.emoji
    : settings.avatar_data
      ? `<img src="/overlay/${token}/avatar" alt="" />`
      : "🙏";
  const avatarBgStyle = avatarPreset.gradient ? ` style="background:${avatarPreset.gradient}"` : "";

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=${GOOGLE_FONT_QUERY}&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;overflow:hidden;font-family:${alertFontStack}}

      #stage{position:fixed;bottom:56px;left:50%;width:340px;transform:${alertAnim.base};
        display:flex;flex-direction:column;align-items:center;text-align:center;
        opacity:0;transition:opacity .4s ease,transform .4s ease}
      #stage.show{opacity:1;transform:${alertAnim.show}}
      #stage.hide{opacity:0;transform:${alertAnim.hide}}
      @media (prefers-reduced-motion: reduce){
        #stage{transition:opacity .2s linear}
        #stage.show,#stage.hide{transform:translate(-50%,0)}
      }
      /* A configured tier effect gets a punchier, bigger entrance than a plain donation. */
      #stage.fx-entrance.show{animation:fx-pop .55s cubic-bezier(.2,1.4,.4,1)}
      @keyframes fx-pop{0%{transform:translate(-50%,0) scale(.3);opacity:0}
        55%{transform:translate(-50%,0) scale(1.12);opacity:1}100%{transform:translate(-50%,0) scale(1)}}

      /* Banner layout: a bold color-block headline instead of the circle avatar,
         with the donation text drawn as highlighter-marker chips underneath. */
      #banner-box{display:none}
      #stage.layout-banner #banner-box{display:inline-block;background:${escapeHtml(alertStyle.bannerColor)};
        color:#fff;font-weight:900;font-size:30px;padding:8px 30px;border-radius:14px;
        border:3px solid rgba(255,255,255,.9);box-shadow:0 6px 20px rgba(0,0,0,.4);margin-bottom:12px;letter-spacing:1px}
      #stage.layout-banner #avatar-wrap{display:none}
      #stage.layout-banner .hl{background:${escapeHtml(alertStyle.highlightColor)};padding:1px 9px;
        border-radius:5px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
      #stage.layout-banner #line2:empty{display:none}

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

      #line1{font-size:${alertStyle.fontSize}px;font-weight:800;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.55);line-height:1.3}
      #line1 .name{color:${alertStyle.nameColor}}
      #line2{margin-top:4px;font-size:${Math.max(11, alertStyle.fontSize - 5)}px;font-weight:500;color:rgba(255,255,255,.92);
        text-shadow:0 1px 4px rgba(0,0,0,.55);max-width:300px}

      #avatar.fx-framed{box-shadow:0 4px 18px rgba(0,0,0,.35),0 0 0 4px #ffd700,0 0 40px 10px rgba(255,215,0,.55)}

      /* Amount-tier effects — see bot_donation_alert_tiers / Tampilan Alert dashboard page.
         Reworked to be a real screen-level "wow" moment, not a subtle accent: every effect
         also fires a full-viewport flash + the stage's own punchy pop-in entrance above. */
      #screen-flash{position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5;
        background:radial-gradient(circle at 50% 65%,rgba(255,255,255,.9),rgba(255,215,0,.35) 45%,transparent 75%)}
      #screen-flash.fire{animation:fx-flash 1.4s ease-out}
      @keyframes fx-flash{0%{opacity:0}10%{opacity:1}100%{opacity:0}}

      #stage.fx-shake{animation:fx-pop .55s cubic-bezier(.2,1.4,.4,1),fx-shake .7s ease .1s}
      @keyframes fx-shake{0%,100%{transform:translate(-50%,0) translateX(0) scale(1)}
        10%{transform:translate(-50%,0) translateX(-10px) scale(1.06)}20%{transform:translate(-50%,0) translateX(10px) scale(1.06)}
        30%{transform:translate(-50%,0) translateX(-9px) scale(1.04)}40%{transform:translate(-50%,0) translateX(9px) scale(1.04)}
        50%{transform:translate(-50%,0) translateX(-6px)}60%{transform:translate(-50%,0) translateX(6px)}
        70%{transform:translate(-50%,0) translateX(-3px)}80%{transform:translate(-50%,0) translateX(3px)}
        90%{transform:translate(-50%,0) translateX(-1px)}}
      #stage.fx-glow{animation:fx-pop .55s cubic-bezier(.2,1.4,.4,1)}
      #stage.fx-glow #avatar-wrap::before{content:"";position:absolute;inset:-18px;border-radius:50%;
        background:radial-gradient(circle,rgba(255,215,0,.85),transparent 70%);animation:fx-glow-ring 1.1s ease-in-out infinite;z-index:-1}
      @keyframes fx-glow-ring{0%,100%{opacity:.5;transform:scale(.9)}50%{opacity:1;transform:scale(1.35)}}
      #stage.fx-glow #avatar{animation:fx-glow 1.1s ease-in-out infinite}
      @keyframes fx-glow{0%,100%{box-shadow:0 4px 18px rgba(0,0,0,.35),0 0 10px 2px rgba(255,215,0,.7)}
        50%{box-shadow:0 4px 18px rgba(0,0,0,.35),0 0 46px 16px rgba(255,215,0,.9)}}

      #effect-layer{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:4}
      .particle{position:absolute;top:-24px;animation:fx-fall linear forwards}
      @keyframes fx-fall{to{transform:translateY(110vh) rotate(720deg);opacity:.15}}
      .confetti-cannon{position:fixed;bottom:-10px;animation:fx-cannon ease-out forwards}
      @keyframes fx-cannon{to{transform:translate(var(--cdx),var(--cdy)) rotate(var(--crot));opacity:0}}
      .spark{position:fixed;border-radius:50%;pointer-events:none;animation:fx-spark ease-out forwards;
        box-shadow:0 0 8px 2px currentColor}
      @keyframes fx-spark{to{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0}}
      .shell{position:fixed;bottom:0;width:4px;height:4px;border-radius:50%;pointer-events:none;
        animation:fx-shell ease-in forwards}
      @keyframes fx-shell{to{transform:translateY(var(--rise))}}
      @media (prefers-reduced-motion: reduce){
        #stage.fx-shake,#stage.fx-glow,#stage.fx-entrance.show{animation:none}
        #stage.fx-glow #avatar{animation:none}#stage.fx-glow #avatar-wrap::before{animation:none;display:none}
        #screen-flash.fire{animation:none;opacity:0}
        .particle,.spark,.shell,.confetti-cannon{display:none}
      }
    </style></head><body>
    <div id="screen-flash"></div>
    <div id="effect-layer"></div>
    <div id="stage" class="${alertStyle.layout === "banner" ? "layout-banner" : ""}">
      <div id="banner-box">${escapeHtml(alertStyle.bannerHeadline || "HEY!")}</div>
      <div id="avatar-wrap">
        <div id="avatar"${avatarBgStyle}>${defaultAvatarInner}</div>
        ${
          alertStyle.showDecorations
            ? `<span class="deco d1">💛</span><span class="deco d2">✨</span><span class="deco d3">💚</span>`
            : ""
        }
      </div>
      <div id="line1" class="hl"></div>
      <p id="line2" class="hl"></p>
    </div>
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      const CONFETTI_COLORS = ["#76cc11", "#5da80d", "#aced60", "#fbbf24", "#f472b6", "#60a5fa", "#ffffff", "#ff6b6b"];
      function flashScreen() {
        const flash = document.getElementById("screen-flash");
        flash.classList.remove("fire");
        void flash.offsetWidth;
        flash.classList.add("fire");
      }
      function runConfetti() {
        const layer = document.getElementById("effect-layer");
        // Falling confetti across the whole top edge — bigger, denser, mixed shapes.
        for (let i = 0; i < 140; i++) {
          const p = document.createElement("div");
          p.className = "particle";
          const size = 8 + Math.random() * 10;
          const round = Math.random() > 0.5;
          p.style.width = size + "px";
          p.style.height = (round ? size : size * 0.4) + "px";
          p.style.borderRadius = round ? "50%" : "2px";
          p.style.left = Math.random() * 100 + "vw";
          p.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
          p.style.animationDuration = 2.2 + Math.random() * 1.8 + "s";
          p.style.animationDelay = Math.random() * 0.6 + "s";
          layer.appendChild(p);
          setTimeout(() => p.remove(), 5000);
        }
        // Two corner cannons shooting confetti up and inward, like a real party popper.
        [0, 100].forEach((originVw, idx) => {
          for (let i = 0; i < 45; i++) {
            const c = document.createElement("div");
            c.className = "confetti-cannon";
            const size = 6 + Math.random() * 8;
            c.style.width = size + "px";
            c.style.height = size * 0.5 + "px";
            c.style.left = originVw + "vw";
            c.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
            const angle = idx === 0 ? -60 + Math.random() * 50 : -120 - Math.random() * 50;
            const dist = 45 + Math.random() * 40;
            c.style.setProperty("--cdx", Math.cos((angle * Math.PI) / 180) * dist + "vw");
            c.style.setProperty("--cdy", Math.sin((angle * Math.PI) / 180) * dist + "vh");
            c.style.setProperty("--crot", 360 + Math.random() * 720 + "deg");
            c.style.animationDuration = 1.6 + Math.random() * 0.8 + "s";
            layer.appendChild(c);
            setTimeout(() => c.remove(), 2600);
          }
        });
      }
      function runFireworks() {
        const layer = document.getElementById("effect-layer");
        const bursts = 6;
        for (let b = 0; b < bursts; b++) {
          setTimeout(() => {
            const cx = 15 + Math.random() * 70;
            const cy = 15 + Math.random() * 45;
            const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

            // Rising shell trail before the burst, like a real firework launch.
            const shell = document.createElement("div");
            shell.className = "shell";
            shell.style.left = cx + "vw";
            shell.style.background = color;
            shell.style.color = color;
            shell.style.setProperty("--rise", "-" + (100 - cy) + "vh");
            shell.style.animationDuration = "0.35s";
            layer.appendChild(shell);

            setTimeout(() => {
              shell.remove();
              const sparkCount = 36;
              for (let i = 0; i < sparkCount; i++) {
                const angle = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.2;
                const dist = 90 + Math.random() * 90;
                const spark = document.createElement("div");
                spark.className = "spark";
                spark.style.left = cx + "vw";
                spark.style.top = cy + "vh";
                spark.style.width = spark.style.height = 4 + Math.random() * 5 + "px";
                spark.style.background = color;
                spark.style.color = color;
                spark.style.setProperty("--dx", Math.cos(angle) * dist + "px");
                spark.style.setProperty("--dy", Math.sin(angle) * dist + "px");
                spark.style.animationDuration = 0.9 + Math.random() * 0.5 + "s";
                layer.appendChild(spark);
                setTimeout(() => spark.remove(), 1500);
              }
            }, 350);
          }, b * 280);
        }
      }
      function applyTierEffect(effect) {
        stage.classList.remove("fx-shake", "fx-glow", "fx-entrance");
        document.getElementById("avatar").classList.remove("fx-framed");
        if (effect === "none") return;
        // restart entrance/flash even if one just played a moment ago
        void stage.offsetWidth;
        stage.classList.add("fx-entrance");
        document.getElementById("avatar").classList.add("fx-framed");
        flashScreen();
        if (effect === "shake") {
          stage.classList.add("fx-shake");
        } else if (effect === "glow") {
          stage.classList.add("fx-glow");
        } else if (effect === "confetti") {
          runConfetti();
        } else if (effect === "fireworks") {
          runFireworks();
        }
      }
      const stage = document.getElementById("stage");
      const avatarEl = document.getElementById("avatar");
      const defaultAvatarHTML = avatarEl.innerHTML; // streamer's own avatar (or the 🙏 fallback), restored once a tiered donation's card hides
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

      // Donations are queued, not shown as soon as they arrive: without this,
      // a second donation landing while the first is still on screen (or
      // still being narrated) would instantly cut the first one's card and
      // audio off. Each queued item is fully shown + narrated before the
      // next one starts.
      const donationQueue = [];
      const pendingTtsByAlertId = new Map(); // alertId -> audio url, for tts that arrives for a LATER queued item
      let queueBusy = false;

      function renderDonationCard(d) {
        const line1 = document.getElementById("line1");
        line1.innerHTML = "";
        const amountEl = document.createElement("span");
        amountEl.textContent = "Rp" + Number(d.amount).toLocaleString("id-ID") + " dari ";
        const nameEl = document.createElement("span");
        nameEl.className = "name";
        nameEl.textContent = d.donorName;
        line1.append(amountEl, nameEl);
        document.getElementById("line2").textContent = d.message || "";
        if (d.tierImage) {
          avatarEl.innerHTML = "";
          const img = document.createElement("img");
          img.alt = "";
          img.onerror = () => { avatarEl.innerHTML = defaultAvatarHTML; };
          img.src = d.tierImage;
          avatarEl.appendChild(img);
        } else {
          avatarEl.innerHTML = defaultAvatarHTML;
        }
        stage.classList.remove("hide");
        stage.classList.add("show");
        if (d.tierEffect && d.tierEffect !== "none") applyTierEffect(d.tierEffect);
        if (d.sound) chime();
      }

      function hideDonationCard() {
        stage.classList.add("hide");
        stage.classList.remove("show");
      }

      // Narration is normally generated server-side (Gemini TTS) and arrives
      // a few seconds later as its own "tts" event. If that never shows up
      // (no API key configured, quota out, or generation failed), this falls
      // back to the viewer's own browser voice via the Web Speech API so the
      // donation still gets read out loud one way or another. Both resolve
      // their promise once playback actually finishes, so the queue can wait
      // for the real narration length instead of a guessed fixed duration.
      function speakFallback(text) {
        return new Promise((resolve) => {
          if (!text || !("speechSynthesis" in window)) return resolve();
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
              utter.onend = () => resolve();
              utter.onerror = () => resolve();
              window.speechSynthesis.speak(utter);
            } catch {
              resolve();
            }
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
        });
      }

      function playAudioUrl(url) {
        return new Promise((resolve) => {
          try {
            const audio = new Audio(url);
            audio.addEventListener("ended", () => resolve());
            audio.addEventListener("error", () => resolve());
            audio.play().catch(() => resolve());
          } catch {
            resolve();
          }
        });
      }

      const MIN_SHOW_MS = 8000; // how long a donation with no narration at all stays up

      function showAndNarrate(d) {
        return new Promise((resolve) => {
          if (d.youtubeVideoId) return resolve(); // shown below the video widget instead
          renderDonationCard(d);

          const finish = () => {
            hideDonationCard();
            setTimeout(resolve, 300); // matches the card's own fade-out transition
          };

          const already = d.alertId && pendingTtsByAlertId.get(d.alertId);
          if (already) {
            pendingTtsByAlertId.delete(d.alertId);
            playAudioUrl(already).then(finish);
            return;
          }

          let handled = false;
          const ttsHandler = (e) => {
            const payload = JSON.parse(e.data);
            if (d.alertId && payload.alertId && payload.alertId !== d.alertId) {
              // Belongs to a donation further down the queue — stash it for
              // when the queue actually gets there.
              pendingTtsByAlertId.set(payload.alertId, payload.url);
              return;
            }
            handled = true;
            events.removeEventListener("tts", ttsHandler);
            playAudioUrl(payload.url).then(finish);
          };
          events.addEventListener("tts", ttsHandler);

          setTimeout(() => {
            if (handled) return;
            events.removeEventListener("tts", ttsHandler);
            if (d.narration) {
              speakFallback(d.narration).then(finish);
            } else {
              setTimeout(finish, MIN_SHOW_MS);
            }
          }, 4000);
        });
      }

      async function processQueue() {
        if (queueBusy || !donationQueue.length) return;
        queueBusy = true;
        const d = donationQueue.shift();
        await showAndNarrate(d);
        queueBusy = false;
        processQueue();
      }

      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("donation", (e) => {
        donationQueue.push(JSON.parse(e.data));
        processQueue();
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
    <script src="/overlay/assets/overlay-relay.js"></script>
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
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/events`)});
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
    <script src="/overlay/assets/overlay-relay.js"></script>
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
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/events`)});
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
    <script src="/overlay/assets/overlay-relay.js"></script>
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

      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/events`)});
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

const CHAT_BUBBLE_DEFAULTS = {
  bubbleColor: "#ffffff",
  bubbleOpacity: 97,
  textColor: "#122e1e",
  usernameColor: "#76cc11",
  showAvatar: true,
  shape: "rounded", // "rounded" | "square" | "pill"
  fontFamily: "Open Sans",
  fontSize: 13,
  borderWidth: 0,
  borderColor: "#76cc11",
  animation: "slide-up",
};

// Shared with hostAlertAppearance.js's own copies of these maps (kept in
// sync there since that file builds the <select> options) — this side just
// needs the CSS font stack / entrance keyframe for each key.
const FONT_STACKS = {
  "Open Sans": "'Open Sans',sans-serif",
  Inter: "'Inter',sans-serif",
  Poppins: "'Poppins',sans-serif",
  Montserrat: "'Montserrat',sans-serif",
  "Bebas Neue": "'Bebas Neue',sans-serif",
  "Comic Neue": "'Comic Neue',cursive",
};
const GOOGLE_FONT_QUERY = "Open+Sans:wght@400;600;700;800&family=Inter:wght@500;600;700;800&family=Poppins:wght@400;600;700;800&family=Montserrat:wght@400;600;700;800&family=Bebas+Neue&family=Comic+Neue:wght@400;700";

/** Entrance transform for each shared animation choice, keyed the same as
 * hostAlertAppearance.js's ANIMATION_OPTIONS. `base`/`hide` shift is 3x
 * `showAmount` in the opposite direction, matching how the Alert widget's
 * existing slide-up already worked (16px, then -10px on hide). */
function entranceKeyframes(animation, distance = 20) {
  const d = distance;
  switch (animation) {
    case "slide-down":
      return { base: `translateY(-${d}px)`, show: "translateY(0)", hide: `translateY(${Math.round(d * 0.6)}px)` };
    case "slide-left":
      return { base: `translateX(${d}px)`, show: "translateX(0)", hide: `translateX(-${Math.round(d * 0.6)}px)` };
    case "slide-right":
      return { base: `translateX(-${d}px)`, show: "translateX(0)", hide: `translateX(${Math.round(d * 0.6)}px)` };
    case "fade":
      return { base: "translateY(0)", show: "translateY(0)", hide: "translateY(0)" };
    case "pop":
      return { base: "scale(.5)", show: "scale(1)", hide: "scale(.92)" };
    case "slide-up":
    default:
      return { base: `translateY(${d}px)`, show: "translateY(0)", hide: `translateY(-${Math.round(d * 0.6)}px)` };
  }
}

export async function handleChatPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");
  const style = { ...CHAT_BUBBLE_DEFAULTS, ...(settings.chat_bubble_style || {}) };
  const radius = style.shape === "square" ? "4px" : style.shape === "pill" ? "999px" : "12px";
  const bubbleRgba = hexToRgba(style.bubbleColor, style.bubbleOpacity);
  const fontStack = FONT_STACKS[style.fontFamily] || FONT_STACKS["Open Sans"];
  const border = style.borderWidth > 0 ? `${style.borderWidth}px solid ${style.borderColor}` : "none";
  const anim = entranceKeyframes(style.animation, 14);

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=${GOOGLE_FONT_QUERY}&display=swap" rel="stylesheet">
    <style>
      /* Same white-card/green language as the Leaderboard/Wishlist overlays, customizable via
         the "Tampilan Alert" dashboard page (settings.chat_bubble_style). */
      html,body{margin:0;background:transparent;font-family:${fontStack}}
      #feed{width:340px;display:flex;flex-direction:column;justify-content:flex-end;gap:6px;min-height:400px}
      .msg{display:flex;align-items:center;gap:8px;background:${bubbleRgba};border-radius:${radius};border:${border};
        padding:7px 12px;box-shadow:0 2px 10px rgba(0,0,0,.12);
        opacity:0;transform:${anim.base};animation:msgIn .3s ease forwards}
      @keyframes msgIn{to{opacity:1;transform:${anim.show}}}
      @media (prefers-reduced-motion: reduce){.msg{animation:none;opacity:1;transform:none}}
      .msg .avatar{width:22px;height:22px;border-radius:50%;flex:none;object-fit:cover;background:#e5e5e5}
      .msg .body{display:flex;align-items:baseline;gap:6px;min-width:0}
      .msg .user{font-size:${style.fontSize}px;font-weight:800;color:${style.usernameColor};flex:none}
      .msg .text{color:${style.textColor};font-size:${style.fontSize}px;font-weight:400;word-break:break-word}
    </style></head><body>
    <div id="feed"></div>
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      const SHOW_AVATAR = ${JSON.stringify(Boolean(style.showAvatar))};
      const feed = document.getElementById("feed");
      const MAX_MESSAGES = 8;
      function addMessage(m) {
        const row = document.createElement("div");
        row.className = "msg";
        if (SHOW_AVATAR) {
          const avatar = document.createElement("img");
          avatar.className = "avatar";
          avatar.src = m.avatarUrl || "";
          avatar.onerror = () => { avatar.style.display = "none"; };
          if (!m.avatarUrl) avatar.style.display = "none";
          row.appendChild(avatar);
        }
        const body = document.createElement("div");
        body.className = "body";
        const user = document.createElement("span");
        user.className = "user";
        user.textContent = m.user + ":";
        const text = document.createElement("span");
        text.className = "text";
        text.textContent = m.message;
        body.append(user, text);
        row.appendChild(body);
        feed.appendChild(row);
        while (feed.children.length > MAX_MESSAGES) feed.removeChild(feed.firstChild);
      }
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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
    <script src="/overlay/assets/overlay-relay.js"></script>
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
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      const tag = document.getElementById("tag");
      let flashTimer = null;
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      const tag = document.getElementById("tag");
      let flashTimer = null;
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      const JAR_STEP = 10;
      const JAR_TOP = 21, JAR_BOTTOM = 127; // inner clip bounds, matches the SVG path above
      let total = 0;
      const fill = document.getElementById("fill");
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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

export async function handleSubathonPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #wrap{display:inline-block;text-align:center;padding:10px 22px;border-radius:16px;
        background:rgba(0,0,0,.55);box-shadow:0 10px 30px rgba(0,0,0,.35)}
      #label{color:rgba(255,255,255,.75);font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
      #clock-wrap{position:relative;display:inline-block}
      #clock{color:#fff;font-size:52px;font-weight:800;letter-spacing:.02em;text-shadow:0 2px 10px rgba(0,0,0,.5);
        font-variant-numeric:tabular-nums;transition:transform .25s ease}
      #clock.bump{animation:bump .4s ease}
      #clock.ended{color:#f87171}
      @keyframes bump{0%{transform:scale(1)}30%{transform:scale(1.12)}100%{transform:scale(1)}}
      #added-badge{position:absolute;top:-6px;right:-14px;color:#4ade80;font-size:18px;font-weight:800;
        text-shadow:0 2px 6px rgba(0,0,0,.6);opacity:0;pointer-events:none}
      #added-badge.show{animation:added-pop 2.2s ease forwards}
      @keyframes added-pop{0%{opacity:0;transform:translateY(4px) scale(.8)}
        15%{opacity:1;transform:translateY(-6px) scale(1.15)}30%{transform:translateY(-6px) scale(1)}
        75%{opacity:1;transform:translateY(-10px) scale(1)}100%{opacity:0;transform:translateY(-18px) scale(1)}}
      @media (prefers-reduced-motion: reduce){#clock.bump{animation:none}#added-badge.show{animation:none;opacity:0}}
    </style></head><body>
    <div id="wrap">
      <div id="label">${escapeHtml(settings.subathon_label || "Waktu")}</div>
      <div id="clock-wrap">
        <div id="clock">--:--:--</div>
        <div id="added-badge"></div>
      </div>
    </div>
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      let endAt = ${settings.subathon_end_at ? `new Date(${JSON.stringify(settings.subathon_end_at)}).getTime()` : "null"};
      const clockEl = document.getElementById("clock");
      const labelEl = document.getElementById("label");
      const addedBadgeEl = document.getElementById("added-badge");

      function render() {
        if (!endAt) { clockEl.textContent = "--:--:--"; clockEl.classList.remove("ended"); return; }
        const remainingMs = endAt - Date.now();
        if (remainingMs <= 0) {
          clockEl.textContent = "00:00:00";
          clockEl.classList.add("ended");
          return;
        }
        clockEl.classList.remove("ended");
        const totalSeconds = Math.floor(remainingMs / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        const pad = (n) => String(n).padStart(2, "0");
        clockEl.textContent = (h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(s);
      }
      render();
      setInterval(render, 1000);

      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("subathon", (e) => {
        const d = JSON.parse(e.data);
        endAt = d.endAt ? new Date(d.endAt).getTime() : null;
        clockEl.classList.remove("bump");
        void clockEl.offsetWidth;
        clockEl.classList.add("bump");
        if (d.addedMinutes > 0) {
          const rounded = Math.round(d.addedMinutes * 10) / 10;
          addedBadgeEl.textContent = "+" + rounded + " menit";
          addedBadgeEl.classList.remove("show");
          void addedBadgeEl.offsetWidth;
          addedBadgeEl.classList.add("show");
        }
        render();
      });
      events.addEventListener("subathon-label", (e) => {
        labelEl.textContent = JSON.parse(e.data).label;
      });
    </script>
  </body></html>`);
}

// Maps a milestone's DB "metric" to the live-events SSE event name that
// already carries a running total for it (see tiktokLiveEvents.js).
const MILESTONE_EVENT_BY_METRIC = {
  likes: "likes",
  follows: "follow",
  shares: "share",
  gifts: "gift-total",
};

export async function handleMilestonePage(req, res) {
  const { token, id } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");
  const milestone = await db.getMilestone(settings.guild_id, id);
  if (!milestone) return res.status(404).send("Milestone not found.");
  const eventName = MILESTONE_EVENT_BY_METRIC[milestone.metric] || "likes";

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Open Sans',sans-serif}
      #wrap{display:inline-block;min-width:260px;padding:14px 20px;border-radius:14px;
        background:rgba(0,0,0,.55);box-shadow:0 10px 30px rgba(0,0,0,.35)}
      #label{color:#fff;font-size:15px;font-weight:800;margin-bottom:8px;display:flex;justify-content:space-between;gap:12px}
      #count{color:#4ade80}
      #bar{height:14px;background:rgba(255,255,255,.25);border-radius:8px;overflow:hidden}
      #fill{height:100%;background:#4ade80;width:0%;transition:width .5s ease}
      #wrap.reached #fill{background:#facc15}
      #wrap.reached #count{color:#facc15}
      @keyframes reached-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
      #wrap.reached{animation:reached-pulse 1s ease infinite}
      @media (prefers-reduced-motion: reduce){#wrap.reached{animation:none}#fill{transition:none}}
    </style></head><body>
    <div id="wrap">
      <div id="label"><span>${escapeHtml(milestone.label)}</span><span><span id="count">0</span> / ${Number(milestone.target).toLocaleString("id-ID")}</span></div>
      <div id="bar"><div id="fill"></div></div>
    </div>
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      const target = ${Number(milestone.target)};
      const wrapEl = document.getElementById("wrap");
      const countEl = document.getElementById("count");
      const fillEl = document.getElementById("fill");

      function render(total) {
        countEl.textContent = total.toLocaleString("id-ID");
        const pct = Math.min(100, (total / target) * 100);
        fillEl.style.width = pct + "%";
        wrapEl.classList.toggle("reached", total >= target);
      }
      render(0);

      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener(${JSON.stringify(eventName)}, (e) => {
        render(Number(JSON.parse(e.data).total) || 0);
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
    <script src="/overlay/assets/overlay-relay.js"></script>
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
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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
    <script src="/overlay/assets/overlay-relay.js"></script>
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

      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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
    <script src="/overlay/assets/overlay-relay.js"></script>
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
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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
      .row{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;color:#122e1e;border-top:1px solid #eee}
      .row:first-of-type{border-top:none}
      .rank{color:#76cc11;font-weight:800;width:1.4em;flex:none}
      .avatar{width:22px;height:22px;border-radius:50%;flex:none;object-fit:cover;background:#e5e5e5}
      .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .val{flex:none;font-weight:700}
    </style></head><body>
    <div id="card"><h3>Likeathon</h3><div id="rows"></div></div>
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
      events.addEventListener("likeathon", (e) => {
        const data = JSON.parse(e.data);
        const rowsEl = document.getElementById("rows");
        rowsEl.innerHTML = "";
        data.ranking.forEach((r, i) => {
          const row = document.createElement("div");
          row.className = "row";
          row.innerHTML = '<span class="rank">#' + (i + 1) + '</span><img class="avatar" alt="" /><span class="name"></span><span class="val"></span>';
          const avatar = row.querySelector(".avatar");
          avatar.src = r.avatarUrl || "";
          avatar.onerror = () => { avatar.style.display = "none"; };
          if (!r.avatarUrl) avatar.style.display = "none";
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
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      const toast = document.getElementById("toast");
      let hideTimer = null;
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      const banner = document.getElementById("banner");
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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
    <script src="/overlay/assets/overlay-relay.js"></script>
    <script>
      const card = document.getElementById("card");
      let hideTimer = null;
      const events = connectOverlayEvents(${JSON.stringify(`/overlay/${token}/live-events`)});
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
