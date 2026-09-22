import * as db from "../services/db.js";
import { broadcast } from "../services/donationOverlay.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

export async function handleHostSubathonPage(req, res, notice) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const endAt = settings.subathon_end_at ? new Date(settings.subathon_end_at) : null;
  const running = !!endAt && endAt.getTime() > Date.now();

  const body = `
    <div class="topbar"><div><h1>Subathon</h1><p>Timer countdown buat live subathon — mulai dengan durasi awal, terus tiap ada yang donate waktunya otomatis nambah sesuai aturan di bawah.</p></div></div>
    ${notice ? `<p class="hint" style="color:var(--success)">${escapeHtml(notice)}</p>` : ""}

    <div class="panel">
      <h2>Status</h2>
      ${
        running
          ? `<p class="hint">Lagi jalan, berakhir <strong id="countdownLabel" data-end-at="${endAt.toISOString()}">${endAt.toLocaleString("id-ID")}</strong>.</p>
             <form method="post" action="/host/${identifier}/subathon/stop"><button type="submit" class="btn btn-danger btn-sm">Stop Subathon</button></form>`
          : `<p class="empty">Subathon belum jalan. Set durasi awal di bawah buat mulai.</p>`
      }
    </div>

    <form class="panel" method="post" action="/host/${identifier}/subathon/start" style="margin-top:1.25rem">
      <h2>${running ? "Restart" : "Mulai"} Subathon</h2>
      <label for="hours">Durasi awal dari sekarang (jam)</label>
      <input id="hours" type="number" name="hours" min="0.1" step="0.1" value="1" required />
      <button type="submit" class="btn btn-primary" style="margin-top:16px">${running ? "Restart" : "Mulai"} Subathon</button>
    </form>

    <form class="panel" method="post" action="/host/${identifier}/subathon/rate" style="margin-top:1.25rem">
      <h2>Aturan Tambahan Waktu</h2>
      <p class="hint">Tiap donasi otomatis nambah waktu subathon, proporsional ke aturan ini. Contoh: Rp10.000 = 5 menit berarti donasi Rp5.000 nambah 2.5 menit.</p>
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
      <button type="submit" class="btn btn-primary" style="margin-top:16px">Simpan Aturan</button>
    </form>`;

  res.send(hostLayout(body, { active: "subathon", identifier, settings }));
}

export async function handleHostSubathonStart(req, res) {
  const settings = req.donationSettings;
  const hours = Number(req.body.hours);
  if (hours > 0) {
    const endAt = new Date(Date.now() + hours * 3600000);
    await db.updateDonationSettings(settings.guild_id, { subathon_end_at: endAt.toISOString() });
    broadcast(settings.overlay_token, "subathon", { endAt: endAt.toISOString() });
  }
  res.redirect(`/host/${req.params.identifier}/subathon`);
}

export async function handleHostSubathonStop(req, res) {
  const settings = req.donationSettings;
  await db.updateDonationSettings(settings.guild_id, { subathon_end_at: null });
  broadcast(settings.overlay_token, "subathon", { endAt: null });
  res.redirect(`/host/${req.params.identifier}/subathon`);
}

export async function handleHostSubathonRateUpdate(req, res) {
  const settings = req.donationSettings;
  const rateAmount = Math.max(1, Number(req.body.rateAmount) || 10000);
  const rateMinutes = Math.max(0.1, Number(req.body.rateMinutes) || 5);
  await db.updateDonationSettings(settings.guild_id, { subathon_rate_amount: rateAmount, subathon_rate_minutes: rateMinutes });
  res.redirect(`/host/${req.params.identifier}/subathon`);
}
