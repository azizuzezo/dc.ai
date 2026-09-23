import * as db from "../services/db.js";
import { PARKIRAN_LINK_TEMPLATES } from "../services/overlayTemplates.js";
import { HEX_RE, hexToRgba, fontSelect, templateGallery } from "./overlayStyleUi.js";
import { FONT_STACKS as FONT_OPTIONS } from "../services/overlayStyleShared.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

const PARKIRAN_LINK_STYLE_DEFAULTS = {
  panelColor: "#ffffff",
  panelOpacity: 97,
  titleColor: "#122e1e",
  rankColor: "#76cc11",
  nameColor: "#122e1e",
  amountColor: "#76cc11",
  fontFamily: "Open Sans",
  fontSize: 13,
};

function parkiranLinkPreviewHTML(style) {
  return `<div class="tpl-preview" style="background:${hexToRgba(style.panelColor, style.panelOpacity)};flex-direction:column;align-items:stretch;gap:2px">
    <div style="display:flex;justify-content:space-between;font-size:.68rem;font-weight:700;color:${escapeHtml(style.nameColor)};font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS["Open Sans"]}">
      <span><span style="color:${escapeHtml(style.rankColor)};font-weight:800">#1</span> Nama</span>
      <span style="color:${escapeHtml(style.amountColor)};font-weight:700">Rp50.000</span>
    </div>
  </div>`;
}

function rupiah(n) {
  return "Rp" + Number(n || 0).toLocaleString("id-ID");
}

function itemRow(identifier, item) {
  return `<div class="widget-card">
    <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;flex-wrap:wrap">
      <div style="min-width:0">
        <div style="font-weight:700">${escapeHtml(item.donor_name)}${item.amount ? ` &middot; ${rupiah(item.amount)}` : ""}</div>
        <div class="hint" style="margin-top:.25rem;word-break:break-all">${escapeHtml(item.content)}</div>
        <div class="hint" style="margin-top:.25rem;font-size:.75rem">${new Date(item.created_at).toLocaleString("id-ID")}</div>
      </div>
      <div style="display:flex;gap:.4rem;flex:none">
        <form method="post" action="/host/${identifier}/parkiran-link/${item.id}/toggle">
          <button type="submit" class="btn btn-sm${item.done ? "" : " btn-primary"}">${item.done ? "Batal tandai" : "Tandai selesai"}</button>
        </form>
        <form method="post" action="/host/${identifier}/parkiran-link/${item.id}/delete" onsubmit="return confirm('Hapus item ini?')">
          <button type="submit" class="btn btn-danger btn-sm">Hapus</button>
        </form>
      </div>
    </div>
  </div>`;
}

export async function handleHostLinkQueuePage(req, res) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const items = await db.listLinkQueue(settings.guild_id);
  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const style = { ...PARKIRAN_LINK_STYLE_DEFAULTS, ...(settings.parkiran_link_style || {}) };

  const body = `
    <div class="topbar"><div><h1>Parkiran Link</h1><p>Link atau catatan khusus yang donatur titipkan lewat form donasi (field "Parkiran Link") — link-nya cuma kamu yang bisa liat di sini, gak pernah tampil di overlay. Diurutkan dari nominal donasi tertinggi.</p></div></div>

    <div class="panel">
      <h2>Belum selesai (${pending.length})</h2>
      ${pending.length ? pending.map((item) => itemRow(identifier, item)).join("") : `<p class="empty">Belum ada yang masuk.</p>`}
    </div>

    ${
      done.length
        ? `<div class="panel" style="margin-top:1.25rem">
      <h2>Sudah selesai (${done.length})</h2>
      ${done.map((item) => itemRow(identifier, item)).join("")}
    </div>`
        : ""
    }

    <div class="panel" style="margin-top:1.25rem">
      <h2>Overlay Antrian Parkiran Link</h2>
      <p class="hint">Overlay buat OBS yang cuma nampilin nama donatur dan nominalnya (urut dari nominal tertinggi) — link/catatannya sendiri tetap ga pernah keluar dari sini. Tambahin ke OBS lewat halaman "Semua Widget".</p>
      <h3 style="margin-bottom:.4rem">Template</h3>
      ${templateGallery(PARKIRAN_LINK_TEMPLATES, `/host/${identifier}/parkiran-link/style`, parkiranLinkPreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/parkiran-link/style" style="margin-top:1.25rem">
      <h2>Overlay Antrian (Manual)</h2>
      <div class="grid grid-2">
        <div>
          <label for="pkPanelColor">Warna panel</label>
          <input id="pkPanelColor" type="color" name="panelColor" value="${escapeHtml(style.panelColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="pkPanelOpacity">Transparansi panel (%)</label>
          <input id="pkPanelOpacity" type="number" name="panelOpacity" min="0" max="100" value="${style.panelOpacity}" />
        </div>
        <div>
          <label for="pkTitleColor">Warna judul</label>
          <input id="pkTitleColor" type="color" name="titleColor" value="${escapeHtml(style.titleColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="pkRankColor">Warna nomor urut</label>
          <input id="pkRankColor" type="color" name="rankColor" value="${escapeHtml(style.rankColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="pkNameColor">Warna nama</label>
          <input id="pkNameColor" type="color" name="nameColor" value="${escapeHtml(style.nameColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="pkAmountColor">Warna nominal</label>
          <input id="pkAmountColor" type="color" name="amountColor" value="${escapeHtml(style.amountColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="pkFontFamily">Font</label>
          ${fontSelect("pkFontFamily", "fontFamily", style.fontFamily)}
        </div>
        <div>
          <label for="pkFontSize">Ukuran font</label>
          <input id="pkFontSize" type="number" name="fontSize" min="10" max="20" value="${style.fontSize}" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>`;

  res.send(hostLayout(body, { active: "parkiran-link", identifier, settings }));
}

export async function handleHostLinkQueueStyleUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    parkiran_link_style: {
      panelColor: HEX_RE.test(req.body.panelColor || "") ? req.body.panelColor : PARKIRAN_LINK_STYLE_DEFAULTS.panelColor,
      panelOpacity: Math.min(100, Math.max(0, Number(req.body.panelOpacity) || 0)),
      titleColor: HEX_RE.test(req.body.titleColor || "") ? req.body.titleColor : PARKIRAN_LINK_STYLE_DEFAULTS.titleColor,
      rankColor: HEX_RE.test(req.body.rankColor || "") ? req.body.rankColor : PARKIRAN_LINK_STYLE_DEFAULTS.rankColor,
      nameColor: HEX_RE.test(req.body.nameColor || "") ? req.body.nameColor : PARKIRAN_LINK_STYLE_DEFAULTS.nameColor,
      amountColor: HEX_RE.test(req.body.amountColor || "") ? req.body.amountColor : PARKIRAN_LINK_STYLE_DEFAULTS.amountColor,
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : PARKIRAN_LINK_STYLE_DEFAULTS.fontFamily,
      fontSize: Math.min(20, Math.max(10, Number(req.body.fontSize) || PARKIRAN_LINK_STYLE_DEFAULTS.fontSize)),
    },
  });
  res.redirect(`/host/${req.params.identifier}/parkiran-link`);
}

export async function handleHostLinkQueueToggle(req, res) {
  const settings = req.donationSettings;
  const item = await db.getLinkQueueItem(settings.guild_id, req.params.id);
  await db.setLinkQueueItemDone(settings.guild_id, req.params.id, !item?.done);
  res.redirect(`/host/${req.params.identifier}/parkiran-link`);
}

export async function handleHostLinkQueueDelete(req, res) {
  const settings = req.donationSettings;
  await db.deleteLinkQueueItem(settings.guild_id, req.params.id);
  res.redirect(`/host/${req.params.identifier}/parkiran-link`);
}
