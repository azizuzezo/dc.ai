import * as db from "../services/db.js";
import { announceDonation } from "../services/donationPolling.js";
import { AVATAR_PRESETS, ALERT_LAYOUTS } from "../services/alertPresets.js";
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

// Shared across Chat Bubble + Alert so both widgets draw from the same
// curated set instead of the host needing to know real Google Fonts names.
const FONT_OPTIONS = {
  "Open Sans": "'Open Sans',sans-serif",
  Inter: "'Inter',sans-serif",
  Poppins: "'Poppins',sans-serif",
  Montserrat: "'Montserrat',sans-serif",
  "Bebas Neue": "'Bebas Neue',sans-serif",
  "Comic Neue": "'Comic Neue',cursive",
};

const ANIMATION_OPTIONS = {
  "slide-up": "Geser dari bawah",
  "slide-down": "Geser dari atas",
  "slide-left": "Geser dari kanan",
  "slide-right": "Geser dari kiri",
  fade: "Muncul halus (fade)",
  pop: "Muncul membesar (pop)",
};

function fontSelect(id, name, current) {
  return `<select id="${id}" name="${name}">
    ${Object.keys(FONT_OPTIONS).map((f) => `<option value="${escapeHtml(f)}" ${f === current ? "selected" : ""}>${escapeHtml(f)}</option>`).join("")}
  </select>`;
}

function animationSelect(id, name, current) {
  return `<select id="${id}" name="${name}">
    ${Object.entries(ANIMATION_OPTIONS).map(([k, label]) => `<option value="${k}" ${k === current ? "selected" : ""}>${label}</option>`).join("")}
  </select>`;
}

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
  const tiers = await db.listAlertTiers(settings.guild_id);

  const body = `
    <div class="topbar"><div><h1>Tampilan Alert</h1><p>Kustomisasi bubble chat TikTok LIVE dan tampilan widget Alert donasi berdasarkan nominal.</p></div></div>
    ${notice ? `<p class="hint" style="color:var(--success)">${escapeHtml(notice)}</p>` : ""}

    <form class="panel" method="post" action="/host/${identifier}/tampilan-alert/chat-bubble">
      <h2>Bubble Chat</h2>
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

    <form class="panel" method="post" action="/host/${identifier}/tampilan-alert/appearance" style="margin-top:1.25rem">
      <h2>Tampilan Alert (Dasar)</h2>
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

const HEX_RE = /^#[0-9a-f]{6}$/i;

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
