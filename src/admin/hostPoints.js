import * as db from "../services/db.js";
import { POINTS_TEMPLATES } from "../services/overlayTemplates.js";
import { FONT_STACKS as FONT_OPTIONS } from "../services/overlayStyleShared.js";
import { HEX_RE, hexToRgba, fontSelect, templateGallery } from "./overlayStyleUi.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

const POINTS_STYLE_DEFAULTS = {
  panelColor: "#ffffff",
  panelOpacity: 97,
  titleColor: "#122e1e",
  rankColor: "#76cc11",
  nameColor: "#122e1e",
  valColor: "#122e1e",
  fontFamily: "Open Sans",
  fontSize: 13,
};

function pointsPreviewHTML(style) {
  return `<div class="tpl-preview" style="align-items:stretch">
    <div style="background:${hexToRgba(style.panelColor, style.panelOpacity)};padding:8px 10px;border-radius:10px;width:100%;
      font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS["Open Sans"]}">
      <div style="font-size:11px;font-weight:800;color:${escapeHtml(style.titleColor)};margin-bottom:5px">Papan Poin</div>
      <div style="display:flex;align-items:center;gap:6px;font-size:${style.fontSize}px;color:${escapeHtml(style.nameColor)}">
        <span style="color:${escapeHtml(style.rankColor)};font-weight:800">#1</span><span style="flex:1;text-align:left">Nama</span><span style="font-weight:700;color:${escapeHtml(style.valColor)}">500 Poin</span>
      </div>
    </div>
  </div>`;
}

export async function handleHostPointsPage(req, res, notice) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const search = (req.query.q || "").trim();
  const rows = await db.listDonationPoints(settings.guild_id, { search, limit: 50 });
  const pointsStyle = { ...POINTS_STYLE_DEFAULTS, ...(settings.points_style || {}) };

  const body = `
    <div class="topbar"><div><h1>Poin</h1><p>Sistem poin buat viewer TikTok LIVE kamu — dari gift, chat, follow, dan share.</p></div></div>
    ${notice ? `<p class="hint" style="color:var(--success)">${escapeHtml(notice)}</p>` : ""}
    ${!settings.tiktok_url ? `<p class="hint" style="color:var(--warning)">Poin cuma kekumpul pas kamu live — isi username TikTok dulu di halaman <a href="/host/${identifier}/tampilan" style="color:inherit">Tampilan</a>.</p>` : ""}

    <form class="panel" method="post" action="/host/${identifier}/poin/pengaturan">
      <h2>Pengaturan poin</h2>
      <label class="checkbox-row"><input type="checkbox" name="pointsEnabled" ${settings.points_enabled ? "checked" : ""} /> Aktifin sistem poin</label>
      <label for="currencyName">Nama mata uang poin</label>
      <input id="currencyName" type="text" name="currencyName" value="${escapeHtml(settings.points_currency_name || "Poin")}" maxlength="20" />
      <div class="grid grid-2">
        <div>
          <label for="perCoin">Poin per koin gift</label>
          <input id="perCoin" type="number" step="0.1" min="0" name="perCoin" value="${settings.points_per_coin}" />
        </div>
        <div>
          <label for="perChat">Poin per chat</label>
          <input id="perChat" type="number" step="0.1" min="0" name="perChat" value="${settings.points_per_chat_message}" />
        </div>
        <div>
          <label for="perFollow">Poin per follow</label>
          <input id="perFollow" type="number" step="0.1" min="0" name="perFollow" value="${settings.points_per_follow}" />
        </div>
        <div>
          <label for="perShare">Poin per share</label>
          <input id="perShare" type="number" step="0.1" min="0" name="perShare" value="${settings.points_per_share}" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Link widget</h2>
      <p class="hint">Papan poin viewer buat OBS.</p>
      <div class="widget-card">
        <h3>Papan Poin</h3>
        <div class="widget-url-row">
          <input class="url-box" type="text" readonly value="${escapeHtml(`${req.protocol}://${req.get("host")}/overlay/${settings.overlay_token}/points-leaderboard`)}" onclick="this.select()" />
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:1.25rem">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <h2>Papan poin viewer</h2>
        <form method="get" action="/host/${identifier}/poin">
          <input type="text" name="q" value="${escapeHtml(search)}" placeholder="Cari username..." style="width:auto" />
        </form>
      </div>
      <table>
        <thead><tr><th>Username TikTok</th><th>Poin</th><th>Terakhir aktif</th></tr></thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (r) =>
                      `<tr><td>${escapeHtml(r.tiktok_user)}</td><td class="mono">${Math.round(r.points)}</td><td>${r.last_seen_at ? new Date(r.last_seen_at).toLocaleString("id-ID") : "-"}</td></tr>`
                  )
                  .join("")
              : `<tr><td colspan="3" class="empty">Belum ada data poin.</td></tr>`
          }
        </tbody>
      </table>
    </div>

    <form class="panel" method="post" action="/host/${identifier}/poin/adjust" style="margin-top:1.25rem">
      <h2>Atur poin manual</h2>
      <p class="hint">Tambah atau kurangi poin satu viewer (pakai angka negatif buat mengurangi).</p>
      <div class="grid grid-2">
        <div>
          <label for="adjustUser">Username TikTok</label>
          <input id="adjustUser" type="text" name="username" required />
        </div>
        <div>
          <label for="adjustAmount">Jumlah</label>
          <input id="adjustAmount" type="number" step="1" name="amount" required />
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Terapkan</button>
    </form>

    <form class="panel" method="post" action="/host/${identifier}/poin/halving" style="margin-top:1.25rem;border-color:var(--error)"
      onsubmit="return confirm('Yakin? Ini bakal bagi 2 poin SEMUA viewer sekarang juga.')">
      <h2 style="color:var(--error)">Halving</h2>
      <p class="hint">Bagi dua semua poin viewer sekaligus — biasanya dipakai buat bikin kompetisi tetap seru di akhir sesi live.</p>
      <button type="submit" class="btn btn-danger" style="margin-top:12px">Halving semua poin sekarang</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Template Papan Poin</h2>
      <p class="hint">Klik salah satu buat langsung pakai gaya siap-jadi ini — bisa diubah lagi manual di bawah kapan aja.</p>
      ${templateGallery(POINTS_TEMPLATES, `/host/${identifier}/poin/style`, pointsPreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/poin/style" style="margin-top:1.25rem">
      <h2>Papan Poin (Manual)</h2>
      <div class="grid grid-2">
        <div>
          <label for="ptPanelColor">Warna panel</label>
          <input id="ptPanelColor" type="color" name="panelColor" value="${escapeHtml(pointsStyle.panelColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="ptPanelOpacity">Transparansi panel (%)</label>
          <input id="ptPanelOpacity" type="number" name="panelOpacity" min="0" max="100" value="${pointsStyle.panelOpacity}" />
        </div>
        <div>
          <label for="ptTitleColor">Warna judul</label>
          <input id="ptTitleColor" type="color" name="titleColor" value="${escapeHtml(pointsStyle.titleColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="ptRankColor">Warna nomor urut</label>
          <input id="ptRankColor" type="color" name="rankColor" value="${escapeHtml(pointsStyle.rankColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="ptNameColor">Warna nama</label>
          <input id="ptNameColor" type="color" name="nameColor" value="${escapeHtml(pointsStyle.nameColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="ptValColor">Warna jumlah poin</label>
          <input id="ptValColor" type="color" name="valColor" value="${escapeHtml(pointsStyle.valColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="ptFontFamily">Font</label>
          ${fontSelect("ptFontFamily", "fontFamily", pointsStyle.fontFamily)}
        </div>
        <div>
          <label for="ptFontSize">Ukuran teks (px)</label>
          <input id="ptFontSize" type="number" name="fontSize" min="10" max="20" value="${pointsStyle.fontSize}" />
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>`;

  res.send(hostLayout(body, { active: "poin", identifier, settings }));
}

export async function handleHostPointsStyleUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    points_style: {
      panelColor: HEX_RE.test(req.body.panelColor || "") ? req.body.panelColor : POINTS_STYLE_DEFAULTS.panelColor,
      panelOpacity: Math.min(100, Math.max(0, Number(req.body.panelOpacity) || 0)),
      titleColor: HEX_RE.test(req.body.titleColor || "") ? req.body.titleColor : POINTS_STYLE_DEFAULTS.titleColor,
      rankColor: HEX_RE.test(req.body.rankColor || "") ? req.body.rankColor : POINTS_STYLE_DEFAULTS.rankColor,
      nameColor: HEX_RE.test(req.body.nameColor || "") ? req.body.nameColor : POINTS_STYLE_DEFAULTS.nameColor,
      valColor: HEX_RE.test(req.body.valColor || "") ? req.body.valColor : POINTS_STYLE_DEFAULTS.valColor,
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : POINTS_STYLE_DEFAULTS.fontFamily,
      fontSize: Math.min(20, Math.max(10, Number(req.body.fontSize) || POINTS_STYLE_DEFAULTS.fontSize)),
    },
  });
  res.redirect(`/host/${req.params.identifier}/poin`);
}

export async function handleHostPointsSettingsUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    points_enabled: req.body.pointsEnabled === "on",
    points_currency_name: req.body.currencyName?.trim().slice(0, 20) || "Poin",
    points_per_coin: Number(req.body.perCoin) || 0,
    points_per_chat_message: Number(req.body.perChat) || 0,
    points_per_follow: Number(req.body.perFollow) || 0,
    points_per_share: Number(req.body.perShare) || 0,
  });
  res.redirect(`/host/${req.params.identifier}/poin`);
}

export async function handleHostPointsAdjust(req, res) {
  const settings = req.donationSettings;
  const username = req.body.username?.trim();
  const amount = Number(req.body.amount);
  if (username && Number.isFinite(amount) && amount !== 0) {
    await db.awardDonationPoints(settings.guild_id, username, amount);
  }
  res.redirect(`/host/${req.params.identifier}/poin`);
}

export async function handleHostPointsHalving(req, res) {
  const settings = req.donationSettings;
  await db.halveDonationPoints(settings.guild_id);
  res.redirect(`/host/${req.params.identifier}/poin`);
}
