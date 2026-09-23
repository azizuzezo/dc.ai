import * as db from "../services/db.js";
import { broadcast } from "../services/donationOverlay.js";
import { WAKTU_TEMPLATES } from "../services/overlayTemplates.js";
import { FONT_STACKS as FONT_OPTIONS } from "../services/overlayStyleShared.js";
import { HEX_RE, hexToRgba, fontSelect, templateGallery } from "./overlayStyleUi.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

const WAKTU_STYLE_DEFAULTS = {
  panelColor: "#000000",
  panelOpacity: 55,
  labelColor: "#ffffff",
  clockColor: "#ffffff",
  addedColor: "#4ade80",
  fontFamily: "Open Sans",
  clockSize: 52,
};

function waktuPreviewHTML(style) {
  return `<div class="tpl-preview" style="background:${hexToRgba(style.panelColor, style.panelOpacity)};
    font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS["Open Sans"]}">
    <div style="font-size:8px;font-weight:700;color:${escapeHtml(style.labelColor)};text-transform:uppercase;letter-spacing:.06em">Waktu</div>
    <div style="font-size:22px;font-weight:800;color:${escapeHtml(style.clockColor)};font-variant-numeric:tabular-nums">01:23:45</div>
  </div>`;
}

export async function handleHostSubathonPage(req, res, notice) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const endAt = settings.subathon_end_at ? new Date(settings.subathon_end_at) : null;
  const running = !!endAt && endAt.getTime() > Date.now();
  const waktuStyle = { ...WAKTU_STYLE_DEFAULTS, ...(settings.waktu_style || {}) };

  const body = `
    <div class="topbar"><div><h1>Waktu</h1><p>Timer countdown buat live — mulai dengan durasi awal, terus tiap ada yang donate waktunya otomatis nambah sesuai aturan di bawah.</p></div></div>
    ${notice ? `<p class="hint" style="color:var(--success)">${escapeHtml(notice)}</p>` : ""}

    <div class="panel">
      <h2>Status</h2>
      ${
        running
          ? `<p class="hint">Lagi jalan, berakhir <strong id="countdownLabel" data-end-at="${endAt.toISOString()}">${endAt.toLocaleString("id-ID")}</strong>.</p>
             <form method="post" action="/host/${identifier}/subathon/stop"><button type="submit" class="btn btn-danger btn-sm">Stop Timer</button></form>`
          : `<p class="empty">Timer belum jalan. Set durasi awal di bawah buat mulai.</p>`
      }
    </div>

    <form class="panel" method="post" action="/host/${identifier}/subathon/start" style="margin-top:1.25rem">
      <h2>${running ? "Restart" : "Mulai"} Timer</h2>
      <label for="hours">Durasi awal dari sekarang (jam)</label>
      <input id="hours" type="number" name="hours" min="0.1" step="0.1" value="1" required />
      <button type="submit" class="btn btn-primary" style="margin-top:16px">${running ? "Restart" : "Mulai"} Timer</button>
    </form>

    <form class="panel" method="post" action="/host/${identifier}/subathon/rate" style="margin-top:1.25rem">
      <h2>Nama & Aturan Tambahan Waktu</h2>
      <label for="label">Nama widget (ditampilin di overlay)</label>
      <input id="label" type="text" name="label" maxlength="40" value="${escapeHtml(settings.subathon_label || "Waktu")}" required />
      <p class="hint" style="margin-top:14px">Tiap donasi otomatis nambah waktu, proporsional ke aturan ini. Contoh: Rp10.000 = 5 menit berarti donasi Rp5.000 nambah 2.5 menit.</p>
      <div class="grid grid-2">
        <div>
          <label for="rateAmount">Setiap donasi Rp</label>
          <input id="rateAmount" type="text" inputmode="numeric" class="rupiah-input" name="rateAmount" value="${settings.subathon_rate_amount}" required />
        </div>
        <div>
          <label for="rateMinutes">Nambah (menit)</label>
          <input id="rateMinutes" type="number" name="rateMinutes" min="0.1" step="0.1" value="${settings.subathon_rate_minutes}" required />
        </div>
      </div>
      <label for="maxHours" style="margin-top:14px">Batas maksimal total durasi (jam, kosongkan buat tanpa batas)</label>
      <input id="maxHours" type="number" name="maxHours" min="0.1" step="0.1" value="${settings.subathon_max_hours ?? ""}" placeholder="Tanpa batas" />
      <p class="hint">Dihitung dari waktu Mulai/Restart terakhir — donasi gak akan nambah waktu lewat batas ini.</p>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan Aturan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Template Tampilan</h2>
      <p class="hint">Klik salah satu buat langsung pakai gaya siap-jadi ini — bisa diubah lagi manual di bawah kapan aja.</p>
      ${templateGallery(WAKTU_TEMPLATES, `/host/${identifier}/subathon/style`, waktuPreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/subathon/style" style="margin-top:1.25rem">
      <h2>Tampilan (Manual)</h2>
      <p class="hint">Warna, font, dan ukuran jam widget Waktu.</p>
      <div class="grid grid-2">
        <div>
          <label for="wkPanelColor">Warna panel</label>
          <input id="wkPanelColor" type="color" name="panelColor" value="${escapeHtml(waktuStyle.panelColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="wkPanelOpacity">Transparansi panel (%)</label>
          <input id="wkPanelOpacity" type="number" name="panelOpacity" min="0" max="100" value="${waktuStyle.panelOpacity}" />
        </div>
        <div>
          <label for="wkLabelColor">Warna label "Waktu"</label>
          <input id="wkLabelColor" type="color" name="labelColor" value="${escapeHtml(waktuStyle.labelColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="wkClockColor">Warna angka jam</label>
          <input id="wkClockColor" type="color" name="clockColor" value="${escapeHtml(waktuStyle.clockColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="wkAddedColor">Warna badge "+X menit"</label>
          <input id="wkAddedColor" type="color" name="addedColor" value="${escapeHtml(waktuStyle.addedColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="wkFontFamily">Font</label>
          ${fontSelect("wkFontFamily", "fontFamily", waktuStyle.fontFamily)}
        </div>
        <div>
          <label for="wkClockSize">Ukuran angka jam (px)</label>
          <input id="wkClockSize" type="number" name="clockSize" min="24" max="90" value="${waktuStyle.clockSize}" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>`;

  res.send(hostLayout(body, { active: "subathon", identifier, settings }));
}

export async function handleHostSubathonStart(req, res) {
  const settings = req.donationSettings;
  const hours = Number(req.body.hours);
  if (hours > 0) {
    const now = new Date();
    const endAt = new Date(now.getTime() + hours * 3600000);
    await db.updateDonationSettings(settings.guild_id, {
      subathon_end_at: endAt.toISOString(),
      subathon_started_at: now.toISOString(),
    });
    broadcast(settings.overlay_token, "subathon", { endAt: endAt.toISOString() });
  }
  res.redirect(`/host/${req.params.identifier}/subathon`);
}

export async function handleHostSubathonStop(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, { subathon_end_at: null, subathon_started_at: null });
  broadcast(settings.overlay_token, "subathon", { endAt: null });
  res.redirect(`/host/${req.params.identifier}/subathon`);
}

export async function handleHostSubathonRateUpdate(req, res) {
  const settings = req.donationSettings;
  const rateAmount = Math.max(1, Number(req.body.rateAmount) || 10000);
  const rateMinutes = Math.max(0.1, Number(req.body.rateMinutes) || 5);
  const label = (req.body.label || "").trim().slice(0, 40) || "Waktu";
  const maxHours = req.body.maxHours ? Math.max(0.1, Number(req.body.maxHours)) : null;
  await db.updateDonationSettings(settings.guild_id, {
    subathon_rate_amount: rateAmount,
    subathon_rate_minutes: rateMinutes,
    subathon_label: label,
    subathon_max_hours: maxHours,
  });
  broadcast(settings.overlay_token, "subathon-label", { label });
  res.redirect(`/host/${req.params.identifier}/subathon`);
}

export async function handleHostSubathonStyleUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    waktu_style: {
      panelColor: HEX_RE.test(req.body.panelColor || "") ? req.body.panelColor : WAKTU_STYLE_DEFAULTS.panelColor,
      panelOpacity: Math.min(100, Math.max(0, Number(req.body.panelOpacity) || 0)),
      labelColor: HEX_RE.test(req.body.labelColor || "") ? req.body.labelColor : WAKTU_STYLE_DEFAULTS.labelColor,
      clockColor: HEX_RE.test(req.body.clockColor || "") ? req.body.clockColor : WAKTU_STYLE_DEFAULTS.clockColor,
      addedColor: HEX_RE.test(req.body.addedColor || "") ? req.body.addedColor : WAKTU_STYLE_DEFAULTS.addedColor,
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : WAKTU_STYLE_DEFAULTS.fontFamily,
      clockSize: Math.min(90, Math.max(24, Number(req.body.clockSize) || WAKTU_STYLE_DEFAULTS.clockSize)),
    },
  });
  res.redirect(`/host/${req.params.identifier}/subathon`);
}
