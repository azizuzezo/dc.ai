import * as db from "../services/db.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

const METRIC_LABELS = {
  likes: "Like",
  follows: "Follower baru",
  shares: "Share",
  gifts: "Koin (gift)",
};

export async function handleHostMilestonesPage(req, res) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const milestones = await db.listMilestones(settings.guild_id);
  const baseUrl = `${req.protocol}://${req.get("host")}`;

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
