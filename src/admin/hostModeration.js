import * as db from "../services/db.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

export async function handleHostModerationPage(req, res, notice) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const flagged = await db.listFlaggedChat(settings.guild_id, 50);

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

  res.send(hostLayout(body, { active: "moderasi", identifier, title: settings.display_name, avatarUrl: settings.avatar_data ? `/${identifier}/avatar` : null }));
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
