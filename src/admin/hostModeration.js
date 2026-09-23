import * as db from "../services/db.js";
import { LINK_PREVIEW_TEMPLATES } from "../services/overlayTemplates.js";
import { FONT_STACKS as FONT_OPTIONS } from "../services/overlayStyleShared.js";
import { HEX_RE, hexToRgba, fontSelect, templateGallery } from "./overlayStyleUi.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

const LINK_PREVIEW_STYLE_DEFAULTS = {
  bgColor: "#ffffff",
  bgOpacity: 97,
  userColor: "#76cc11",
  titleColor: "#122e1e",
  descColor: "#5b7267",
  fontFamily: "Open Sans",
};

function linkPreviewPreviewHTML(style) {
  return `<div class="tpl-preview" style="align-items:stretch">
    <div style="background:${hexToRgba(style.bgColor, style.bgOpacity)};padding:8px 10px;border-radius:10px;width:100%;
      font-family:${FONT_OPTIONS[style.fontFamily] || FONT_OPTIONS["Open Sans"]}">
      <div style="font-size:9px;font-weight:800;color:${escapeHtml(style.userColor)};text-transform:uppercase">Budi membagikan link</div>
      <div style="font-size:12px;font-weight:800;color:${escapeHtml(style.titleColor)};margin-top:2px">Judul Halaman</div>
      <div style="font-size:10px;color:${escapeHtml(style.descColor)};margin-top:2px">Deskripsi singkat halaman...</div>
    </div>
  </div>`;
}

export async function handleHostModerationPage(req, res, notice) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const flagged = await db.listFlaggedChat(settings.guild_id, 50);
  const linkPreviewStyle = { ...LINK_PREVIEW_STYLE_DEFAULTS, ...(settings.link_preview_style || {}) };

  const body = `
    <div class="topbar"><div><h1>Moderasi</h1><p>Filter chat TikTok LIVE kamu — kata kasar, spam judi online, dan spam pesan berulang.</p></div></div>
    ${notice ? `<p class="hint" style="color:var(--success)">${escapeHtml(notice)}</p>` : ""}
    <p class="hint">TikTok gak nyediain cara buat hapus/sembunyiin komentar orang lain lewat API, jadi filter ini cuma ngatur apa yang MUNCUL di widget Chat Live &amp; ikut diproses (poin, perintah chat) di sistem kamu sendiri — bukan di chat TikTok aslinya.</p>

    <form class="panel" method="post" action="/host/${identifier}/moderasi">
      <h2>Pengaturan</h2>
      <label class="checkbox-row"><input type="checkbox" name="moderationEnabled" ${settings.moderation_enabled ? "checked" : ""} /> Aktifin moderasi chat</label>
      <label class="checkbox-row"><input type="checkbox" name="badwordsEnabled" ${settings.moderation_badwords_enabled ? "checked" : ""} /> Filter kata kasar (Bahasa Indonesia)</label>
      <label class="checkbox-row"><input type="checkbox" name="judolEnabled" ${settings.moderation_judol_enabled ? "checked" : ""} /> Filter spam judi online</label>
      <label class="checkbox-row"><input type="checkbox" name="duplicateEnabled" ${settings.moderation_duplicate_enabled ? "checked" : ""} /> Filter spam pesan berulang</label>
      <label class="checkbox-row"><input type="checkbox" name="linkPreviewEnabled" ${settings.link_preview_enabled ? "checked" : ""} /> Tampilin preview link (judul, deskripsi, gambar) kalau ada yang share link di chat</label>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Link widget Link Preview</h2>
      <p class="hint">Nampilin kartu preview (judul, deskripsi, gambar) tiap ada link di chat TikTok LIVE.</p>
      <div class="widget-card">
        <h3>Link Preview</h3>
        <div class="widget-url-row">
          <input class="url-box" type="text" readonly value="${escapeHtml(`${req.protocol}://${req.get("host")}/overlay/${settings.overlay_token}/link-preview`)}" onclick="this.select()" />
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Template Link Preview</h2>
      <p class="hint">Klik salah satu buat langsung pakai gaya siap-jadi ini — bisa diubah lagi manual di bawah kapan aja.</p>
      ${templateGallery(LINK_PREVIEW_TEMPLATES, `/host/${identifier}/moderasi/link-preview-style`, linkPreviewPreviewHTML)}
    </div>

    <form class="panel" method="post" action="/host/${identifier}/moderasi/link-preview-style" style="margin-top:1.25rem">
      <h2>Link Preview (Manual)</h2>
      <div class="grid grid-2">
        <div>
          <label for="lpBgColor">Warna latar</label>
          <input id="lpBgColor" type="color" name="bgColor" value="${escapeHtml(linkPreviewStyle.bgColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lpBgOpacity">Transparansi latar (%)</label>
          <input id="lpBgOpacity" type="number" name="bgOpacity" min="0" max="100" value="${linkPreviewStyle.bgOpacity}" />
        </div>
        <div>
          <label for="lpUserColor">Warna nama pengirim</label>
          <input id="lpUserColor" type="color" name="userColor" value="${escapeHtml(linkPreviewStyle.userColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lpTitleColor">Warna judul</label>
          <input id="lpTitleColor" type="color" name="titleColor" value="${escapeHtml(linkPreviewStyle.titleColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lpDescColor">Warna deskripsi</label>
          <input id="lpDescColor" type="color" name="descColor" value="${escapeHtml(linkPreviewStyle.descColor)}" style="height:2.6rem;padding:.3rem" />
        </div>
        <div>
          <label for="lpFontFamily">Font</label>
          ${fontSelect("lpFontFamily", "fontFamily", linkPreviewStyle.fontFamily)}
        </div>
      </div>
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan</button>
    </form>

    <div class="panel" style="margin-top:1.25rem">
      <h2>Pesan yang ke-filter (${flagged.length})</h2>
      ${
        flagged.length
          ? `<table><thead><tr><th>Waktu</th><th>User</th><th>Pesan</th><th>Alasan</th></tr></thead><tbody>
          ${flagged
            .map(
              (f) => `<tr>
            <td>${new Date(f.created_at).toLocaleString("id-ID")}</td>
            <td>${escapeHtml(f.tiktok_user)}</td>
            <td>${escapeHtml(f.message)}</td>
            <td>${escapeHtml(f.reason)}</td>
          </tr>`
            )
            .join("")}
          </tbody></table>`
          : `<p class="empty">Belum ada pesan yang ke-filter.</p>`
      }
    </div>`;

  res.send(hostLayout(body, { active: "moderasi", identifier, settings }));
}

export async function handleHostModerationUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    moderation_enabled: req.body.moderationEnabled === "on",
    moderation_badwords_enabled: req.body.badwordsEnabled === "on",
    moderation_judol_enabled: req.body.judolEnabled === "on",
    moderation_duplicate_enabled: req.body.duplicateEnabled === "on",
    link_preview_enabled: req.body.linkPreviewEnabled === "on",
  });
  res.redirect(`/host/${req.params.identifier}/moderasi`);
}

export async function handleHostLinkPreviewStyleUpdate(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, {
    link_preview_style: {
      bgColor: HEX_RE.test(req.body.bgColor || "") ? req.body.bgColor : LINK_PREVIEW_STYLE_DEFAULTS.bgColor,
      bgOpacity: Math.min(100, Math.max(0, Number(req.body.bgOpacity) || 0)),
      userColor: HEX_RE.test(req.body.userColor || "") ? req.body.userColor : LINK_PREVIEW_STYLE_DEFAULTS.userColor,
      titleColor: HEX_RE.test(req.body.titleColor || "") ? req.body.titleColor : LINK_PREVIEW_STYLE_DEFAULTS.titleColor,
      descColor: HEX_RE.test(req.body.descColor || "") ? req.body.descColor : LINK_PREVIEW_STYLE_DEFAULTS.descColor,
      fontFamily: Object.keys(FONT_OPTIONS).includes(req.body.fontFamily) ? req.body.fontFamily : LINK_PREVIEW_STYLE_DEFAULTS.fontFamily,
    },
  });
  res.redirect(`/host/${req.params.identifier}/moderasi`);
}
