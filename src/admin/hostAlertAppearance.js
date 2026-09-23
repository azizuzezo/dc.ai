import * as db from "../services/db.js";
import { announceDonation } from "../services/donationPolling.js";
import { AVATAR_PRESETS, ALERT_LAYOUTS } from "../services/alertPresets.js";
import { CHAT_BUBBLE_TEMPLATES, ALERT_TEMPLATES, LEADERBOARD_TEMPLATES, LIKEATHON_TEMPLATES, TAG_TEMPLATES, JAR_TEMPLATES, VIDEO_TEMPLATES } from "../services/overlayTemplates.js";
import { FONT_STACKS as FONT_OPTIONS, ANIMATION_OPTIONS } from "../services/overlayStyleShared.js";
import { HEX_RE, hexToRgba, shadeHex, fontSelect, animationSelect, templateGallery } from "./overlayStyleUi.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

const CHAT_BUBBLE_DEFAULTS = {
  bubbleColor: "#ffffff",
  bubbleOpacity: 97,
  textColor: "#122e1e",
  usernameColor: "#76cc11",
  showAvatar: true,
  shape: "rounded",
  fontFamily: "Open Sans",
  fontSize: 13,
  borderWidth: 0,
  borderColor: "#76cc11",
  animation: "slide-up",
};

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

const LEADERBOARD_STYLE_DEFAULTS = {
  cardStyle: "transparent",
  panelColor: "#000000",
  panelOpacity: 55,
  headerColor: "#ffffff",
  rankColor: "#4ade80",
  nameColor: "#ffffff",
  amountColor: "#ffffff",
  fontFamily: "Inter",
  fontSize: 14,
};

const LIKEATHON_STYLE_DEFAULTS = {
  panelColor: "#ffffff",
  panelOpacity: 97,
  titleColor: "#122e1e",
  titleIcon: "❤️",
  rankColor: "#76cc11",
  nameColor: "#122e1e",
  valColor: "#122e1e",
  fontFamily: "Open Sans",
  fontSize: 13,
};

const TAG_STYLE_DEFAULTS = {
  bgColor: "#ffffff",
  bgOpacity: 97,
  textColor: "#122e1e",
  accentColor: "#76cc11",
  fontFamily: "Open Sans",
  fontSize: 20,
};

const JAR_STYLE_DEFAULTS = {
  lidColor: "#5da80d",
  fillColor: "#76cc11",
  labelBgColor: "#ffffff",
  labelBgOpacity: 97,
  labelTextColor: "#122e1e",
  fontFamily: "Open Sans",
};

const VIDEO_STYLE_DEFAULTS = {
  nameColor: "#86efac",
  line2Color: "#ffffff",
  fontFamily: "Inter",
  fontSize: 38,
};

function layoutSelect(id, name, current) {
  return `<select id="${id}" name="${name}">
    ${Object.entries(ALERT_LAYOUTS).map(([k, label]) => `<option value="${k}" ${k === current ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
  </select>`;
}

/** Radio-card gallery instead of a plain <select> so each avatar preset shows
 * its actual gradient + emoji before picking it — "photo" is a face-shaped
 * card (uses your uploaded avatar), the rest are themed badge alternatives. */
function avatarPresetPicker(name, current) {
  return `<div class="avatar-preset-grid">
    ${Object.entries(AVATAR_PRESETS)
      .map(([key, preset]) => {
        const bg = preset.gradient || "radial-gradient(circle at 35% 30%,#4ade80,#16a34a)";
        return `<label class="avatar-preset-card">
          <input type="radio" name="${name}" value="${key}" ${key === current ? "checked" : ""} />
          <span class="avatar-preset-swatch" style="background:${bg}">${preset.emoji ? escapeHtml(preset.emoji) : "🙂"}</span>
          <span class="avatar-preset-label">${escapeHtml(preset.label)}</span>
        </label>`;
      })
      .join("")}
  </div>
  <style>
    .avatar-preset-grid{display:flex;flex-wrap:wrap;gap:.6rem;margin:.4rem 0 1rem}
    .avatar-preset-card{display:flex;flex-direction:column;align-items:center;gap:.35rem;width:84px;
      padding:.5rem;border-radius:10px;border:2px solid transparent;cursor:pointer;text-align:center}
    .avatar-preset-card:hover{border-color:rgba(255,255,255,.2)}
    .avatar-preset-card:has(input:checked){border-color:var(--accent, #76cc11);background:rgba(118,204,17,.08)}
    .avatar-preset-card input{position:absolute;opacity:0;pointer-events:none}
    .avatar-preset-swatch{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-size:20px;box-shadow:0 2px 8px rgba(0,0,0,.3)}
    .avatar-preset-label{font-size:.72rem;opacity:.85}
  </style>`;
}

const SHAPE_RADIUS = { rounded: "10px", pill: "999px", square: "4px" };

function chatBubblePreviewHTML(style) {
  return `<div class="tpl-preview tpl-preview-bubble" style="background:${hexToRgba(style.bubbleColor, style.bubbleOpacity)};
    border-radius:${SHAPE_RADIUS[style.shape] || "10px"};border:${style.borderWidth}px solid ${escapeHtml(style.borderColor)};
    font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS["Open Sans"]}">
    <span style="color:${escapeHtml(style.usernameColor)};font-weight:700;font-size:${style.fontSize}px">Nama</span>
    <span style="color:${escapeHtml(style.textColor)};font-size:${style.fontSize}px"> halo semua! 👋</span>
  </div>`;
}

function alertPreviewHTML(style) {
  if (style.layout === "banner") {
    return `<div class="tpl-preview tpl-preview-alert-banner">
      <span class="tpl-banner-box" style="background:linear-gradient(135deg,${escapeHtml(style.bannerColor)},${shadeHex(style.bannerColor, -18)})">${escapeHtml(style.bannerHeadline)}</span>
      <span class="tpl-hl" style="background:${escapeHtml(style.highlightColor)}">Rp10.000 dari <b style="color:${escapeHtml(style.nameColor)}">Nama</b></span>
    </div>`;
  }
  const preset = AVATAR_PRESETS[style.avatarPreset] || AVATAR_PRESETS.photo;
  const bg = preset.gradient || "radial-gradient(circle at 35% 30%,#4ade80,#16a34a)";
  return `<div class="tpl-preview tpl-preview-alert-classic">
    <span class="tpl-avatar-badge" style="background:${bg}">${preset.emoji ? escapeHtml(preset.emoji) : "🙂"}</span>
    <span class="tpl-alert-name" style="color:${escapeHtml(style.nameColor)}">Rp10.000 dari Nama</span>
  </div>`;
}

function leaderboardPreviewHTML(style) {
  const panel = style.cardStyle === "panel";
  const panelBg = panel ? `background:${hexToRgba(style.panelColor, style.panelOpacity)};padding:8px 10px;border-radius:10px;width:100%` : "";
  return `<div class="tpl-preview tpl-preview-leaderboard" style="align-items:stretch">
    <div style="font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS.Inter};${panelBg}">
      <div style="font-size:9px;font-weight:700;color:${escapeHtml(style.headerColor)};text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px">Top Donatur</div>
      <div style="display:flex;justify-content:space-between;gap:6px;font-size:${style.fontSize}px;font-weight:700;color:${escapeHtml(style.nameColor)}">
        <span style="color:${escapeHtml(style.rankColor)}">#1</span><span style="flex:1;text-align:left">Nama</span><span style="color:${escapeHtml(style.amountColor)}">Rp50rb</span>
      </div>
    </div>
  </div>`;
}

function likeathonPreviewHTML(style) {
  return `<div class="tpl-preview" style="align-items:stretch">
    <div style="background:${hexToRgba(style.panelColor, style.panelOpacity)};padding:8px 10px;border-radius:10px;width:100%;
      font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS["Open Sans"]}">
      <div style="font-size:11px;font-weight:800;color:${escapeHtml(style.titleColor)};margin-bottom:5px">${escapeHtml(style.titleIcon)} Likeathon</div>
      <div style="display:flex;align-items:center;gap:6px;font-size:${style.fontSize}px;color:${escapeHtml(style.nameColor)}">
        <span style="color:${escapeHtml(style.rankColor)};font-weight:800">#1</span><span style="flex:1;text-align:left">Nama</span><span style="font-weight:700;color:${escapeHtml(style.valColor)}">128</span>
      </div>
    </div>
  </div>`;
}

function tagPreviewHTML(style) {
  return `<div class="tpl-preview" style="align-items:stretch">
    <div style="display:inline-flex;align-items:center;gap:6px;background:${hexToRgba(style.bgColor, style.bgOpacity)};
      color:${escapeHtml(style.textColor)};font-weight:800;padding:6px 12px;border-radius:8px;
      font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS["Open Sans"]};margin:0 auto">
      <span style="color:${escapeHtml(style.accentColor)}">❤</span><span>128</span>
    </div>
  </div>`;
}

function jarPreviewHTML(style) {
  const lidDark = shadeHex(style.lidColor, -18);
  return `<div class="tpl-preview" style="align-items:center;gap:.4rem">
    <svg width="48" height="66" viewBox="0 0 90 140">
      <rect x="30" y="4" width="30" height="10" rx="2" fill="${escapeHtml(style.lidColor)}"/>
      <rect x="34" y="12" width="22" height="8" rx="1" fill="${lidDark}"/>
      <path d="M20 30 Q20 22 30 20 L60 20 Q70 22 70 30 L70 118 Q70 128 60 128 L30 128 Q20 128 20 118 Z"
            fill="rgba(255,255,255,.9)" stroke="${escapeHtml(style.lidColor)}" stroke-width="3"/>
      <rect x="24" y="70" width="42" height="55" fill="${escapeHtml(style.fillColor)}"/>
    </svg>
    <span style="background:${hexToRgba(style.labelBgColor, style.labelBgOpacity)};color:${escapeHtml(style.labelTextColor)};
      font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS["Open Sans"]};font-size:.68rem;font-weight:800;padding:3px 8px;border-radius:6px">Gift: 12</span>
  </div>`;
}

function videoPreviewHTML(style) {
  return `<div class="tpl-preview" style="background:#1a1a1a;flex-direction:column;gap:2px">
    <div style="font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS.Inter};font-weight:800;font-size:.9rem;color:#fff">Rp20.000 dari <span style="color:${escapeHtml(style.nameColor)}">Nama</span></div>
    <div style="font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS.Inter};font-size:.62rem;color:${escapeHtml(style.line2Color)}">Puter lagu ini dong!</div>
  </div>`;
}

const EFFECT_LABELS = {
  none: "Tanpa efek",
  shake: "Goyang (shake)",
  glow: "Bersinar (glow)",
  confetti: "Confetti",
  fireworks: "Kembang api",
};

function rupiah(n) {
  return "Rp" + Number(n || 0).toLocaleString("id-ID");
}

export async function handleHostAlertAppearancePage(req, res, notice) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const style = { ...CHAT_BUBBLE_DEFAULTS, ...(settings.chat_bubble_style || {}) };
  const alertStyle = { ...ALERT_APPEARANCE_DEFAULTS, ...(settings.alert_appearance || {}) };
  const leaderboardStyle = { ...LEADERBOARD_STYLE_DEFAULTS, ...(settings.leaderboard_style || {}) };
  const likeathonStyle = { ...LIKEATHON_STYLE_DEFAULTS, ...(settings.likeathon_style || {}) };
  const tagStyle = { ...TAG_STYLE_DEFAULTS, ...(settings.tag_style || {}) };
  const jarStyle = { ...JAR_STYLE_DEFAULTS, ...(settings.jar_style || {}) };
  const videoStyle = { ...VIDEO_STYLE_DEFAULTS, ...(settings.video_style || {}) };
  const tiers = await db.listAlertTiers(settings.guild_id);

  const body = `
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&family=Inter:wght@500;600;700;800&family=Poppins:wght@400;600;700;800&family=Montserrat:wght@400;600;700;800&family=Bebas+Neue&family=Comic+Neue:wght@400;700&display=swap" rel="stylesheet">
    <div class="topbar"><div><h1>Tampilan Alert</h1><p>Kustomisasi bubble chat TikTok LIVE dan tampilan widget Alert donasi berdasarkan nominal.</p></div></div>
    ${notice ? `<p class="hint" style="color:var(--success)">${escapeHtml(notice)}</p>` : ""}

    <div class="panel">
      <h2>Template Bubble Chat</h2>
      <p class="hint">Klik salah satu buat langsung pakai gaya siap-jadi ini — bisa diubah lagi manual di bawah kapan aja.</p>
      ${templateGallery(CHAT_BUBBLE_TEMPLATES, `/host/${identifier}/tampilan-alert/chat-bubble`, chatBubblePreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/tampilan-alert/chat-bubble" style="margin-top:1.25rem">
      <h2>Bubble Chat (Manual)</h2>
      <p class="hint">Ngatur tampilan widget Chat Live (chat TikTok LIVE beneran).</p>
      <div class="grid grid-2">
        <div>
          <label for="bubbleColor">Warna bubble</label>
          <input id="bubbleColor" type="color" name="bubbleColor" value="${escapeHtml(style.bubbleColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="bubbleOpacity">Transparansi bubble (%)</label>
          <input id="bubbleOpacity" type="number" name="bubbleOpacity" min="0" max="100" value="${style.bubbleOpacity}" />
        </div>
        <div>
          <label for="textColor">Warna teks pesan</label>
          <input id="textColor" type="color" name="textColor" value="${escapeHtml(style.textColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="usernameColor">Warna nama pengirim</label>
          <input id="usernameColor" type="color" name="usernameColor" value="${escapeHtml(style.usernameColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="shape">Bentuk bubble</label>
          <select id="shape" name="shape">
            <option value="rounded" ${style.shape === "rounded" ? "selected" : ""}>Membulat</option>
            <option value="pill" ${style.shape === "pill" ? "selected" : ""}>Pill (bulat penuh)</option>
            <option value="square" ${style.shape === "square" ? "selected" : ""}>Kotak</option>
          </select>
        </div>
        <div>
          <label for="fontFamily">Font</label>
          ${fontSelect("fontFamily", "fontFamily", style.fontFamily)}
        </div>
        <div>
          <label for="fontSize">Ukuran teks (px)</label>
          <input id="fontSize" type="number" name="fontSize" min="10" max="28" value="${style.fontSize}" />
        </div>
        <div>
          <label for="animation">Animasi muncul</label>
          ${animationSelect("animation", "animation", style.animation)}
        </div>
        <div>
          <label for="borderWidth">Lebar border (px, 0 = tanpa border)</label>
          <input id="borderWidth" type="number" name="borderWidth" min="0" max="6" value="${style.borderWidth}" />
        </div>
        <div>
          <label for="borderColor">Warna border</label>
          <input id="borderColor" type="color" name="borderColor" value="${escapeHtml(style.borderColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
      </div>
      <label class="checkbox-row"><input type="checkbox" name="showAvatar" ${style.showAvatar ? "checked" : ""} /> Tampilin foto profil pengirim</label>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Template Alert</h2>
      <p class="hint">Klik salah satu buat langsung pakai gaya siap-jadi ini — bisa diubah lagi manual di bawah kapan aja.</p>
      ${templateGallery(ALERT_TEMPLATES, `/host/${identifier}/tampilan-alert/appearance`, alertPreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/tampilan-alert/appearance" style="margin-top:1.25rem">
      <h2>Tampilan Alert (Dasar, Manual)</h2>
      <p class="hint">Warna, font, dan animasi widget Alert buat donasi biasa (di luar efek tingkatan nominal di bawah).</p>

      <label for="alertLayout">Gaya tampilan</label>
      <div style="max-width:22rem">${layoutSelect("alertLayout", "layout", alertStyle.layout)}</div>
      <p class="hint" style="margin-top:.3rem">Klasik = lingkaran foto seperti sekarang. Banner = kotak judul besar + teks yang di-highlight, cocok buat tampilan yang lebih mencolok.</p>

      <div class="grid grid-2" style="margin-top:1rem">
        <div>
          <label for="nameColor">Warna nama donatur</label>
          <input id="nameColor" type="color" name="nameColor" value="${escapeHtml(alertStyle.nameColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="alertFontFamily">Font</label>
          ${fontSelect("alertFontFamily", "fontFamily", alertStyle.fontFamily)}
        </div>
        <div>
          <label for="alertFontSize">Ukuran teks (px)</label>
          <input id="alertFontSize" type="number" name="fontSize" min="12" max="32" value="${alertStyle.fontSize}" />
        </div>
        <div>
          <label for="alertAnimation">Animasi muncul</label>
          ${animationSelect("alertAnimation", "animation", alertStyle.animation)}
        </div>
      </div>
      <label class="checkbox-row"><input type="checkbox" name="showDecorations" ${alertStyle.showDecorations ? "checked" : ""} /> Tampilin ikon hati/kilau di sekitar foto profil (gaya Klasik)</label>

      <h3 style="margin-top:1.5rem">Gaya Banner</h3>
      <p class="hint">Dipakai kalau gaya tampilan di atas diset ke Banner.</p>
      <div class="grid grid-2">
        <div>
          <label for="bannerColor">Warna kotak judul</label>
          <input id="bannerColor" type="color" name="bannerColor" value="${escapeHtml(alertStyle.bannerColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="bannerHeadline">Teks judul</label>
          <input id="bannerHeadline" type="text" name="bannerHeadline" maxlength="20" value="${escapeHtml(alertStyle.bannerHeadline)}" placeholder="HEY!" />
        </div>
        <div>
          <label for="highlightColor">Warna highlight teks</label>
          <input id="highlightColor" type="color" name="highlightColor" value="${escapeHtml(alertStyle.highlightColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
      </div>

      <h3 style="margin-top:1.5rem">Avatar Default (gaya Klasik)</h3>
      <p class="hint">Selain foto profil kamu, pilih salah satu badge tema kalau mau tampilan yang lebih menarik tanpa perlu foto wajah.</p>
      ${avatarPresetPicker("avatarPreset", alertStyle.avatarPreset)}

      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Template Papan Peringkat</h2>
      <p class="hint">Klik salah satu buat langsung pakai gaya siap-jadi ini — bisa diubah lagi manual di bawah kapan aja.</p>
      ${templateGallery(LEADERBOARD_TEMPLATES, `/host/${identifier}/tampilan-alert/leaderboard`, leaderboardPreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/tampilan-alert/leaderboard" style="margin-top:1.25rem">
      <h2>Papan Peringkat (Manual)</h2>
      <p class="hint">Warna, font, dan tampilan widget "Top Donatur".</p>
      <label for="lbCardStyle">Gaya latar</label>
      <div style="max-width:22rem">
        <select id="lbCardStyle" name="cardStyle">
          <option value="transparent" ${leaderboardStyle.cardStyle === "transparent" ? "selected" : ""}>Transparan (tanpa panel)</option>
          <option value="panel" ${leaderboardStyle.cardStyle === "panel" ? "selected" : ""}>Panel (kotak warna di belakang)</option>
        </select>
      </div>
      <div class="grid grid-2" style="margin-top:1rem">
        <div>
          <label for="lbPanelColor">Warna panel</label>
          <input id="lbPanelColor" type="color" name="panelColor" value="${escapeHtml(leaderboardStyle.panelColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lbPanelOpacity">Transparansi panel (%)</label>
          <input id="lbPanelOpacity" type="number" name="panelOpacity" min="0" max="100" value="${leaderboardStyle.panelOpacity}" />
        </div>
        <div>
          <label for="lbHeaderColor">Warna judul "Top Donatur"</label>
          <input id="lbHeaderColor" type="color" name="headerColor" value="${escapeHtml(leaderboardStyle.headerColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lbRankColor">Warna nomor urut</label>
          <input id="lbRankColor" type="color" name="rankColor" value="${escapeHtml(leaderboardStyle.rankColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lbNameColor">Warna nama donatur</label>
          <input id="lbNameColor" type="color" name="nameColor" value="${escapeHtml(leaderboardStyle.nameColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lbAmountColor">Warna nominal</label>
          <input id="lbAmountColor" type="color" name="amountColor" value="${escapeHtml(leaderboardStyle.amountColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lbFontFamily">Font</label>
          ${fontSelect("lbFontFamily", "fontFamily", leaderboardStyle.fontFamily)}
        </div>
        <div>
          <label for="lbFontSize">Ukuran teks (px)</label>
          <input id="lbFontSize" type="number" name="fontSize" min="10" max="24" value="${leaderboardStyle.fontSize}" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Template Likeathon</h2>
      <p class="hint">Klik salah satu buat langsung pakai gaya siap-jadi ini — bisa diubah lagi manual di bawah kapan aja.</p>
      ${templateGallery(LIKEATHON_TEMPLATES, `/host/${identifier}/tampilan-alert/likeathon`, likeathonPreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/tampilan-alert/likeathon" style="margin-top:1.25rem">
      <h2>Likeathon (Manual)</h2>
      <p class="hint">Warna, font, dan ikon widget papan ranking Likeathon.</p>
      <div class="grid grid-2">
        <div>
          <label for="lkPanelColor">Warna panel</label>
          <input id="lkPanelColor" type="color" name="panelColor" value="${escapeHtml(likeathonStyle.panelColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lkPanelOpacity">Transparansi panel (%)</label>
          <input id="lkPanelOpacity" type="number" name="panelOpacity" min="0" max="100" value="${likeathonStyle.panelOpacity}" />
        </div>
        <div>
          <label for="lkTitleColor">Warna judul</label>
          <input id="lkTitleColor" type="color" name="titleColor" value="${escapeHtml(likeathonStyle.titleColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lkTitleIcon">Ikon judul (emoji)</label>
          <input id="lkTitleIcon" type="text" name="titleIcon" maxlength="4" value="${escapeHtml(likeathonStyle.titleIcon)}" placeholder="❤️" />
        </div>
        <div>
          <label for="lkRankColor">Warna nomor urut</label>
          <input id="lkRankColor" type="color" name="rankColor" value="${escapeHtml(likeathonStyle.rankColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lkNameColor">Warna nama</label>
          <input id="lkNameColor" type="color" name="nameColor" value="${escapeHtml(likeathonStyle.nameColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lkValColor">Warna jumlah</label>
          <input id="lkValColor" type="color" name="valColor" value="${escapeHtml(likeathonStyle.valColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lkFontFamily">Font</label>
          ${fontSelect("lkFontFamily", "fontFamily", likeathonStyle.fontFamily)}
        </div>
        <div>
          <label for="lkFontSize">Ukuran teks (px)</label>
          <input id="lkFontSize" type="number" name="fontSize" min="10" max="20" value="${likeathonStyle.fontSize}" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Template Like / Follower / Share / Gift</h2>
      <p class="hint">Satu gaya yang berlaku ke widget Like, Follower Baru, Share, dan Gift sekaligus — semuanya pakai tampilan "kartu putih" yang sama. Klik salah satu buat langsung pakai.</p>
      ${templateGallery(TAG_TEMPLATES, `/host/${identifier}/tampilan-alert/tag`, tagPreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/tampilan-alert/tag" style="margin-top:1.25rem">
      <h2>Like / Follower / Share / Gift (Manual)</h2>
      <div class="grid grid-2">
        <div>
          <label for="tgBgColor">Warna latar kartu</label>
          <input id="tgBgColor" type="color" name="bgColor" value="${escapeHtml(tagStyle.bgColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="tgBgOpacity">Transparansi latar (%)</label>
          <input id="tgBgOpacity" type="number" name="bgOpacity" min="0" max="100" value="${tagStyle.bgOpacity}" />
        </div>
        <div>
          <label for="tgTextColor">Warna teks</label>
          <input id="tgTextColor" type="color" name="textColor" value="${escapeHtml(tagStyle.textColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="tgAccentColor">Warna ikon/aksen</label>
          <input id="tgAccentColor" type="color" name="accentColor" value="${escapeHtml(tagStyle.accentColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="tgFontFamily">Font</label>
          ${fontSelect("tgFontFamily", "fontFamily", tagStyle.fontFamily)}
        </div>
        <div>
          <label for="tgFontSize">Ukuran teks (px)</label>
          <input id="tgFontSize" type="number" name="fontSize" min="12" max="32" value="${tagStyle.fontSize}" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Template Toples Hadiah (Jar)</h2>
      <p class="hint">Klik salah satu buat langsung pakai gaya siap-jadi ini — bisa diubah lagi manual di bawah kapan aja.</p>
      ${templateGallery(JAR_TEMPLATES, `/host/${identifier}/tampilan-alert/jar`, jarPreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/tampilan-alert/jar" style="margin-top:1.25rem">
      <h2>Toples Hadiah / Jar (Manual)</h2>
      <div class="grid grid-2">
        <div>
          <label for="jrLidColor">Warna tutup</label>
          <input id="jrLidColor" type="color" name="lidColor" value="${escapeHtml(jarStyle.lidColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="jrFillColor">Warna isi (naik tiap gift)</label>
          <input id="jrFillColor" type="color" name="fillColor" value="${escapeHtml(jarStyle.fillColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="jrLabelBgColor">Warna latar label</label>
          <input id="jrLabelBgColor" type="color" name="labelBgColor" value="${escapeHtml(jarStyle.labelBgColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="jrLabelBgOpacity">Transparansi latar label (%)</label>
          <input id="jrLabelBgOpacity" type="number" name="labelBgOpacity" min="0" max="100" value="${jarStyle.labelBgOpacity}" />
        </div>
        <div>
          <label for="jrLabelTextColor">Warna teks label</label>
          <input id="jrLabelTextColor" type="color" name="labelTextColor" value="${escapeHtml(jarStyle.labelTextColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="jrFontFamily">Font</label>
          ${fontSelect("jrFontFamily", "fontFamily", jarStyle.fontFamily)}
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Template Widget Video (Donasi Lagu)</h2>
      <p class="hint">Warna caption yang muncul di atas video YouTube saat donasi disertai clip. Klik salah satu buat langsung pakai.</p>
      ${templateGallery(VIDEO_TEMPLATES, `/host/${identifier}/tampilan-alert/video`, videoPreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/tampilan-alert/video" style="margin-top:1.25rem">
      <h2>Widget Video (Manual)</h2>
      <div class="grid grid-2">
        <div>
          <label for="vdNameColor">Warna nama donatur</label>
          <input id="vdNameColor" type="color" name="nameColor" value="${escapeHtml(videoStyle.nameColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="vdLine2Color">Warna pesan</label>
          <input id="vdLine2Color" type="color" name="line2Color" value="${escapeHtml(videoStyle.line2Color)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="vdFontFamily">Font</label>
          ${fontSelect("vdFontFamily", "fontFamily", videoStyle.fontFamily)}
        </div>
        <div>
          <label for="vdFontSize">Ukuran teks nama (px)</label>
          <input id="vdFontSize" type="number" name="fontSize" min="20" max="60" value="${videoStyle.fontSize}" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Alert Berdasarkan Nominal</h2>
      <p class="hint">Widget Alert (donasi) bisa nampilin gambar &amp; efek beda-beda tergantung nominal donasi — dipilih otomatis dari tingkatan tertinggi yang nominalnya kepenuhin.</p>
      ${
        tiers.length
          ? `<table><thead><tr><th>Minimal nominal</th><th>Gambar</th><th>Efek</th><th></th></tr></thead><tbody>
          ${tiers
            .map(
              (t) => `<tr>
            <td>${rupiah(t.min_amount)}</td>
            <td>${t.image_url ? `<img src="${escapeHtml(t.image_url)}" alt="" style="height:32px;border-radius:4px" />` : "-"}</td>
            <td>${EFFECT_LABELS[t.effect] || t.effect}</td>
            <td><form method="post" action="/host/${identifier}/tampilan-alert/tiers/${t.id}/delete"><button type="submit" class="btn btn-danger btn-sm">Hapus</button></form></td>
          </tr>`
            )
            .join("")}
          </tbody></table>`
          : `<p class="empty">Belum ada tingkatan alert. Alert default (tanpa gambar/efek khusus) yang dipakai.</p>`
      }
    </div>
    <form class="panel" method="post" action="/host/${identifier}/tampilan-alert/tiers" enctype="multipart/form-data" style="margin-top:1.25rem">
      <h2>Tambah Tingkatan</h2>
      <label for="minAmount">Minimal nominal (Rp)</label>
      <input id="minAmount" type="text" inputmode="numeric" class="rupiah-input" name="minAmount" required />
      <label for="imageFile">Gambar (opsional, maks 8MB)</label>
      <input id="imageFile" type="file" name="imageFile" accept="image/*" />
      <label for="effect">Efek</label>
      <select id="effect" name="effect">
        ${Object.entries(EFFECT_LABELS).map(([k, label]) => `<option value="${k}">${label}</option>`).join("")}
      </select>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Tambah Tingkatan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Simulasi</h2>
      <p class="hint">Buka widget Alert dulu, terus test kirim donasi dengan nominal tertentu buat lihat tingkatan mana yang kepakai.</p>
      <form method="post" action="/host/${identifier}/tampilan-alert/simulate-donation" style="display:flex;gap:.5rem;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:10rem"><label for="simAmount">Nominal (Rp)</label><input id="simAmount" type="text" inputmode="numeric" class="rupiah-input" name="amount" value="10000" /></div>
        <button type="submit" class="btn btn-sm">Simulasi Donasi</button>
      </form>
    </div>`;

  res.send(hostLayout(body, { active: "tampilan-alert", identifier, settings }));
}

export async function handleHostChatBubbleUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    chat_bubble_style: {
      bubbleColor: HEX_RE.test(req.body.bubbleColor || "") ? req.body.bubbleColor : CHAT_BUBBLE_DEFAULTS.bubbleColor,
      bubbleOpacity: Math.min(100, Math.max(0, Number(req.body.bubbleOpacity) || 0)),
      textColor: HEX_RE.test(req.body.textColor || "") ? req.body.textColor : CHAT_BUBBLE_DEFAULTS.textColor,
      usernameColor: HEX_RE.test(req.body.usernameColor || "") ? req.body.usernameColor : CHAT_BUBBLE_DEFAULTS.usernameColor,
      showAvatar: req.body.showAvatar === "on",
      shape: ["rounded", "pill", "square"].includes(req.body.shape) ? req.body.shape : "rounded",
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : CHAT_BUBBLE_DEFAULTS.fontFamily,
      fontSize: Math.min(28, Math.max(10, Number(req.body.fontSize) || CHAT_BUBBLE_DEFAULTS.fontSize)),
      borderWidth: Math.min(6, Math.max(0, Number(req.body.borderWidth) || 0)),
      borderColor: HEX_RE.test(req.body.borderColor || "") ? req.body.borderColor : CHAT_BUBBLE_DEFAULTS.borderColor,
      animation: Object.keys(ANIMATION_OPTIONS).includes(req.body.animation) ? req.body.animation : CHAT_BUBBLE_DEFAULTS.animation,
    },
  });
  res.redirect(`/host/${req.params.identifier}/tampilan-alert`);
}

export async function handleHostAlertAppearanceUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    alert_appearance: {
      nameColor: HEX_RE.test(req.body.nameColor || "") ? req.body.nameColor : ALERT_APPEARANCE_DEFAULTS.nameColor,
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : ALERT_APPEARANCE_DEFAULTS.fontFamily,
      fontSize: Math.min(32, Math.max(12, Number(req.body.fontSize) || ALERT_APPEARANCE_DEFAULTS.fontSize)),
      animation: Object.keys(ANIMATION_OPTIONS).includes(req.body.animation) ? req.body.animation : ALERT_APPEARANCE_DEFAULTS.animation,
      showDecorations: req.body.showDecorations === "on",
      layout: Object.keys(ALERT_LAYOUTS).includes(req.body.layout) ? req.body.layout : ALERT_APPEARANCE_DEFAULTS.layout,
      bannerColor: HEX_RE.test(req.body.bannerColor || "") ? req.body.bannerColor : ALERT_APPEARANCE_DEFAULTS.bannerColor,
      bannerHeadline: String(req.body.bannerHeadline || "").trim().slice(0, 20) || ALERT_APPEARANCE_DEFAULTS.bannerHeadline,
      highlightColor: HEX_RE.test(req.body.highlightColor || "") ? req.body.highlightColor : ALERT_APPEARANCE_DEFAULTS.highlightColor,
      avatarPreset: Object.keys(AVATAR_PRESETS).includes(req.body.avatarPreset) ? req.body.avatarPreset : ALERT_APPEARANCE_DEFAULTS.avatarPreset,
    },
  });
  res.redirect(`/host/${req.params.identifier}/tampilan-alert`);
}

export async function handleHostLeaderboardStyleUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    leaderboard_style: {
      cardStyle: ["transparent", "panel"].includes(req.body.cardStyle) ? req.body.cardStyle : LEADERBOARD_STYLE_DEFAULTS.cardStyle,
      panelColor: HEX_RE.test(req.body.panelColor || "") ? req.body.panelColor : LEADERBOARD_STYLE_DEFAULTS.panelColor,
      panelOpacity: Math.min(100, Math.max(0, Number(req.body.panelOpacity) || 0)),
      headerColor: HEX_RE.test(req.body.headerColor || "") ? req.body.headerColor : LEADERBOARD_STYLE_DEFAULTS.headerColor,
      rankColor: HEX_RE.test(req.body.rankColor || "") ? req.body.rankColor : LEADERBOARD_STYLE_DEFAULTS.rankColor,
      nameColor: HEX_RE.test(req.body.nameColor || "") ? req.body.nameColor : LEADERBOARD_STYLE_DEFAULTS.nameColor,
      amountColor: HEX_RE.test(req.body.amountColor || "") ? req.body.amountColor : LEADERBOARD_STYLE_DEFAULTS.amountColor,
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : LEADERBOARD_STYLE_DEFAULTS.fontFamily,
      fontSize: Math.min(24, Math.max(10, Number(req.body.fontSize) || LEADERBOARD_STYLE_DEFAULTS.fontSize)),
    },
  });
  res.redirect(`/host/${req.params.identifier}/tampilan-alert`);
}

export async function handleHostLikeathonStyleUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    likeathon_style: {
      panelColor: HEX_RE.test(req.body.panelColor || "") ? req.body.panelColor : LIKEATHON_STYLE_DEFAULTS.panelColor,
      panelOpacity: Math.min(100, Math.max(0, Number(req.body.panelOpacity) || 0)),
      titleColor: HEX_RE.test(req.body.titleColor || "") ? req.body.titleColor : LIKEATHON_STYLE_DEFAULTS.titleColor,
      titleIcon: String(req.body.titleIcon || "").trim().slice(0, 4) || LIKEATHON_STYLE_DEFAULTS.titleIcon,
      rankColor: HEX_RE.test(req.body.rankColor || "") ? req.body.rankColor : LIKEATHON_STYLE_DEFAULTS.rankColor,
      nameColor: HEX_RE.test(req.body.nameColor || "") ? req.body.nameColor : LIKEATHON_STYLE_DEFAULTS.nameColor,
      valColor: HEX_RE.test(req.body.valColor || "") ? req.body.valColor : LIKEATHON_STYLE_DEFAULTS.valColor,
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : LIKEATHON_STYLE_DEFAULTS.fontFamily,
      fontSize: Math.min(20, Math.max(10, Number(req.body.fontSize) || LIKEATHON_STYLE_DEFAULTS.fontSize)),
    },
  });
  res.redirect(`/host/${req.params.identifier}/tampilan-alert`);
}

export async function handleHostTagStyleUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    tag_style: {
      bgColor: HEX_RE.test(req.body.bgColor || "") ? req.body.bgColor : TAG_STYLE_DEFAULTS.bgColor,
      bgOpacity: Math.min(100, Math.max(0, Number(req.body.bgOpacity) || 0)),
      textColor: HEX_RE.test(req.body.textColor || "") ? req.body.textColor : TAG_STYLE_DEFAULTS.textColor,
      accentColor: HEX_RE.test(req.body.accentColor || "") ? req.body.accentColor : TAG_STYLE_DEFAULTS.accentColor,
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : TAG_STYLE_DEFAULTS.fontFamily,
      fontSize: Math.min(32, Math.max(12, Number(req.body.fontSize) || TAG_STYLE_DEFAULTS.fontSize)),
    },
  });
  res.redirect(`/host/${req.params.identifier}/tampilan-alert`);
}

export async function handleHostJarStyleUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    jar_style: {
      lidColor: HEX_RE.test(req.body.lidColor || "") ? req.body.lidColor : JAR_STYLE_DEFAULTS.lidColor,
      fillColor: HEX_RE.test(req.body.fillColor || "") ? req.body.fillColor : JAR_STYLE_DEFAULTS.fillColor,
      labelBgColor: HEX_RE.test(req.body.labelBgColor || "") ? req.body.labelBgColor : JAR_STYLE_DEFAULTS.labelBgColor,
      labelBgOpacity: Math.min(100, Math.max(0, Number(req.body.labelBgOpacity) || 0)),
      labelTextColor: HEX_RE.test(req.body.labelTextColor || "") ? req.body.labelTextColor : JAR_STYLE_DEFAULTS.labelTextColor,
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : JAR_STYLE_DEFAULTS.fontFamily,
    },
  });
  res.redirect(`/host/${req.params.identifier}/tampilan-alert`);
}

export async function handleHostVideoStyleUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    video_style: {
      nameColor: HEX_RE.test(req.body.nameColor || "") ? req.body.nameColor : VIDEO_STYLE_DEFAULTS.nameColor,
      line2Color: HEX_RE.test(req.body.line2Color || "") ? req.body.line2Color : VIDEO_STYLE_DEFAULTS.line2Color,
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : VIDEO_STYLE_DEFAULTS.fontFamily,
      fontSize: Math.min(60, Math.max(20, Number(req.body.fontSize) || VIDEO_STYLE_DEFAULTS.fontSize)),
    },
  });
  res.redirect(`/host/${req.params.identifier}/tampilan-alert`);
}

export async function handleHostAlertTierAdd(req, res) {
  const settings = req.donationSettings;
  if (req.body.minAmount) {
    let imageUrl = null;
    if (req.file) {
      // Stored in the same media library the Actions & Events media picker
      // uses (Postgres, not disk, so it survives redeploys), just reached
      // through a direct upload here instead of a separate "copy URL" step.
      const mediaId = await db.addDonationMedia(settings.guild_id, {
        filename: req.file.originalname.slice(0, 100),
        mimeType: req.file.mimetype,
        data: req.file.buffer.toString("base64"),
        sizeBytes: req.file.size,
      });
      imageUrl = `/overlay/${settings.overlay_token}/media/${mediaId}`;
    }
    await db.addAlertTier(settings.guild_id, {
      minAmount: req.body.minAmount,
      imageUrl,
      effect: req.body.effect,
    });
  }
  res.redirect(`/host/${req.params.identifier}/tampilan-alert`);
}

export async function handleHostAlertTierDelete(req, res) {
  const settings = req.donationSettings;
  await db.deleteAlertTier(settings.guild_id, req.params.id);
  res.redirect(`/host/${req.params.identifier}/tampilan-alert`);
}

/** Runs a fake donation through the real announceDonation path (so the resolved
 * alert tier's image/effect actually shows) without posting to Discord or needing
 * a real payment. */
export async function handleHostAlertTierSimulate(req, res) {
  const settings = req.donationSettings;
  const amount = Number(req.body.amount) || 10000;
  await announceDonation(
    null,
    settings,
    {
      guild_id: settings.guild_id,
      donor_name: "Test Donatur",
      amount,
      message: "Simulasi tingkatan alert.",
      wishlist_item_id: null,
      youtube_video_id: null,
      youtube_start_seconds: null,
      youtube_end_seconds: null,
    },
    { toDiscord: false }
  );
  res.redirect(`/host/${req.params.identifier}/tampilan-alert`);
}
