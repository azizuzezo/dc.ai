import * as db from "../services/db.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

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

  const body = `
    <div class="topbar"><div><h1>Parkiran Link</h1><p>Link atau catatan khusus yang donatur titipkan lewat form donasi (field "Parkiran Link") — cuma kamu yang bisa liat ini, gak pernah tampil di overlay.</p></div></div>

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
    }`;

  res.send(hostLayout(body, { active: "parkiran-link", identifier, settings }));
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
