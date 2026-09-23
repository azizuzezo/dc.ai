import * as db from "../services/db.js";
import { MILESTONE_TEMPLATES } from "../services/overlayTemplates.js";
import { FONT_STACKS as FONT_OPTIONS } from "../services/overlayStyleShared.js";
import { HEX_RE, hexToRgba, fontSelect, templateGallery } from "./overlayStyleUi.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

const METRIC_LABELS = {
  likes: "Like",
  follows: "Follower baru",
  shares: "Share",
  gifts: "Koin (gift)",
};

const MILESTONE_STYLE_DEFAULTS = {
  panelColor: "#000000",
  panelOpacity: 55,
  labelColor: "#ffffff",
  countColor: "#4ade80",
  fillColor: "#4ade80",
  reachedColor: "#facc15",
  fontFamily: "Open Sans",
};

function milestonePreviewHTML(style) {
  return `<div class="tpl-preview" style="background:${hexToRgba(style.panelColor, style.panelOpacity)};align-items:stretch;
    font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS["Open Sans"]}">
    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;color:${escapeHtml(style.labelColor)};margin-bottom:6px">
      <span>Like Goal</span><span style="color:${escapeHtml(style.countColor)}">650 / 1.000</span>
    </div>
    <div style="height:8px;background:rgba(255,255,255,.25);border-radius:6px;overflow:hidden">
      <div style="height:100%;width:65%;background:${escapeHtml(style.fillColor)}"></div>
    </div>
  </div>`;
}

export async function handleHostMilestonesPage(req, res) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const milestones = await db.listMilestones(settings.guild_id);
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const milestoneStyle = { ...MILESTONE_STYLE_DEFAULTS, ...(settings.milestone_style || {}) };

  const body = `
    <div class="topbar"><div><h1>Milestone</h1><p>Widget goal custom buat metrik TikTok LIVE — like, follower, share, atau koin. Progress-nya ke-track otomatis selama widget-nya kebuka.</p></div></div>

    <div class="panel">
      <h2>Milestone Aktif</h2>
      ${
        milestones.length
          ? `<table><thead><tr><th>Label</th><th>Metrik</th><th>Target</th><th>Widget</th><th></th></tr></thead><tbody>
          ${milestones
            .map(
              (m) => `<tr>
            <td>${escapeHtml(m.label)}</td>
            <td>${METRIC_LABELS[m.metric] || m.metric}</td>
            <td>${Number(m.target).toLocaleString("id-ID")}</td>
            <td><a href="${baseUrl}/overlay/${settings.overlay_token}/milestone/${m.id}" target="_blank" rel="noopener">Buka widget</a></td>
            <td><form method="post" action="/host/${identifier}/milestone/${m.id}/delete"><button type="submit" class="btn btn-danger btn-sm">Hapus</button></form></td>
          </tr>`
            )
            .join("")}
          </tbody></table>`
          : `<p class="empty">Belum ada milestone. Tambah di bawah.</p>`
      }
    </div>

    <form class="panel" method="post" action="/host/${identifier}/milestone" style="margin-top:1.25rem">
      <h2>Tambah Milestone</h2>
      <label for="label">Judul (misal "Like Goal", "Follower Goal")</label>
      <input id="label" type="text" name="label" maxlength="40" placeholder="Like Goal" required />
      <label for="metric">Metrik</label>
      <select id="metric" name="metric">
        ${Object.entries(METRIC_LABELS).map(([k, label]) => `<option value="${k}">${label}</option>`).join("")}
      </select>
      <label for="target">Target</label>
      <input id="target" type="number" name="target" min="1" step="1" placeholder="10000" required />
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Tambah Milestone</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Template Tampilan</h2>
      <p class="hint">Berlaku buat semua widget Milestone di server ini. Klik salah satu buat langsung pakai gaya siap-jadi ini — bisa diubah lagi manual di bawah kapan aja.</p>
      ${templateGallery(MILESTONE_TEMPLATES, `/host/${identifier}/milestone/style`, milestonePreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/milestone/style" style="margin-top:1.25rem">
      <h2>Tampilan (Manual)</h2>
      <div class="grid grid-2">
        <div>
          <label for="msPanelColor">Warna panel</label>
          <input id="msPanelColor" type="color" name="panelColor" value="${escapeHtml(milestoneStyle.panelColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="msPanelOpacity">Transparansi panel (%)</label>
          <input id="msPanelOpacity" type="number" name="panelOpacity" min="0" max="100" value="${milestoneStyle.panelOpacity}" />
        </div>
        <div>
          <label for="msLabelColor">Warna judul</label>
          <input id="msLabelColor" type="color" name="labelColor" value="${escapeHtml(milestoneStyle.labelColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="msCountColor">Warna angka progress</label>
          <input id="msCountColor" type="color" name="countColor" value="${escapeHtml(milestoneStyle.countColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="msFillColor">Warna bar progress</label>
          <input id="msFillColor" type="color" name="fillColor" value="${escapeHtml(milestoneStyle.fillColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="msReachedColor">Warna saat target tercapai</label>
          <input id="msReachedColor" type="color" name="reachedColor" value="${escapeHtml(milestoneStyle.reachedColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="msFontFamily">Font</label>
          ${fontSelect("msFontFamily", "fontFamily", milestoneStyle.fontFamily)}
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>`;

  res.send(hostLayout(body, { active: "milestone", identifier, settings }));
}

export async function handleHostMilestoneAdd(req, res) {
  const settings = req.donationSettings;
  const label = (req.body.label || "").trim().slice(0, 40);
  if (label && req.body.target) {
    await db.addMilestone(settings.guild_id, { metric: req.body.metric, target: req.body.target, label });
  }
  res.redirect(`/host/${req.params.identifier}/milestone`);
}

export async function handleHostMilestoneDelete(req, res) {
  const settings = req.donationSettings;
  await db.deleteMilestone(settings.guild_id, req.params.id);
  res.redirect(`/host/${req.params.identifier}/milestone`);
}

export async function handleHostMilestoneStyleUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    milestone_style: {
      panelColor: HEX_RE.test(req.body.panelColor || "") ? req.body.panelColor : MILESTONE_STYLE_DEFAULTS.panelColor,
      panelOpacity: Math.min(100, Math.max(0, Number(req.body.panelOpacity) || 0)),
      labelColor: HEX_RE.test(req.body.labelColor || "") ? req.body.labelColor : MILESTONE_STYLE_DEFAULTS.labelColor,
      countColor: HEX_RE.test(req.body.countColor || "") ? req.body.countColor : MILESTONE_STYLE_DEFAULTS.countColor,
      fillColor: HEX_RE.test(req.body.fillColor || "") ? req.body.fillColor : MILESTONE_STYLE_DEFAULTS.fillColor,
      reachedColor: HEX_RE.test(req.body.reachedColor || "") ? req.body.reachedColor : MILESTONE_STYLE_DEFAULTS.reachedColor,
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : MILESTONE_STYLE_DEFAULTS.fontFamily,
    },
  });
  res.redirect(`/host/${req.params.identifier}/milestone`);
}
