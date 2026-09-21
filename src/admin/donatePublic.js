import * as db from "../services/db.js";
import { createQris, qrisImageUrl } from "../services/gopayGateway.js";
import { subscribe } from "../services/donationOverlay.js";
import { logError } from "../services/logger.js";

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export async function handleDonatePage(req, res) {
  const { guildId } = req.params;
  const settings = await db.getDonationSettings(guildId);
  if (!settings?.gateway_url || !settings?.gateway_api_key) {
    return res.status(404).send("Halaman donasi belum diaktifkan untuk server ini.");
  }

  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Kirim Dukungan</title>
    <style>
      body{font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px;background:#0f0f14;color:#fff}
      input,textarea,button{width:100%;box-sizing:border-box;padding:10px;margin:6px 0;border-radius:8px;border:1px solid #333;background:#1a1a22;color:#fff;font-size:16px}
      button{background:#00c896;color:#04140f;font-weight:bold;border:none;cursor:pointer}
      label{font-size:13px;opacity:.8}
    </style></head><body>
    <h2>💛 Kirim Dukungan</h2>
    <form method="post" action="/donate/${guildId}">
      <label>Nama (opsional)</label>
      <input type="text" name="donorName" maxlength="40" placeholder="Anonim" />
      <label>Jumlah (Rp, minimal ${settings.min_amount.toLocaleString("id-ID")})</label>
      <input type="number" name="amount" min="${settings.min_amount}" step="500" required />
      <label>Pesan (opsional)</label>
      <textarea name="message" maxlength="200" rows="3"></textarea>
      <button type="submit">Buat QRIS</button>
    </form>
  </body></html>`);
}

export async function handleDonateCreate(req, res) {
  const { guildId } = req.params;
  const settings = await db.getDonationSettings(guildId);
  if (!settings?.gateway_url || !settings?.gateway_api_key) {
    return res.status(404).send("Halaman donasi belum diaktifkan untuk server ini.");
  }

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount < settings.min_amount) {
    return res.status(400).send(`Jumlah minimal Rp${settings.min_amount.toLocaleString("id-ID")}.`);
  }
  const donorName = (req.body.donorName || "").trim().slice(0, 40) || "Anonim";
  const message = (req.body.message || "").trim().slice(0, 200) || null;

  let qris;
  try {
    qris = await createQris({ baseUrl: settings.gateway_url, apiKey: settings.gateway_api_key, amount });
  } catch (err) {
    logError(`create-qris failed for guild ${guildId}:`, err);
    return res.status(502).send("Gagal membuat QRIS. Coba lagi sebentar.");
  }

  try {
    await db.createDonation({
      guildId,
      trxId: qris.trx_id,
      donorName,
      message,
      amount: qris.amount,
      expiresAt: qris.expires_at ? new Date(qris.expires_at) : null,
    });
  } catch (err) {
    logError(`Failed to store donation for guild ${guildId}:`, err);
    return res.status(500).send("Gagal menyimpan data donasi.");
  }

  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Scan untuk Bayar</title>
    <style>
      body{font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px;background:#0f0f14;color:#fff;text-align:center}
      img{width:100%;max-width:320px;border-radius:12px;background:#fff;padding:8px}
      #status{margin-top:16px;font-weight:bold}
    </style></head><body>
    <h2>Scan QRIS ini</h2>
    <p>Rp${Number(qris.amount).toLocaleString("id-ID")}</p>
    <img src="${escapeHtml(qrisImageUrl(settings.gateway_url, qris.qris_id))}" alt="QRIS" />
    <p id="status">⏳ Menunggu pembayaran...</p>
    <script>
      const trxId = ${JSON.stringify(qris.trx_id)};
      async function poll() {
        try {
          const res = await fetch("/donate/status/" + trxId);
          const data = await res.json();
          if (data.status === "paid") {
            document.getElementById("status").textContent = "✅ Terima kasih atas dukungannya!";
            return;
          }
          if (data.status === "expired") {
            document.getElementById("status").textContent = "⌛ QRIS sudah expired, silakan buat ulang.";
            return;
          }
        } catch {}
        setTimeout(poll, 4000);
      }
      poll();
    </script>
  </body></html>`);
}

export async function handleDonateStatus(req, res) {
  const donation = await db.getDonationByTrxId(req.params.trxId);
  if (!donation) return res.status(404).json({ status: "not_found" });
  res.json({ status: donation.status });
}

export async function handleOverlayPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <style>
      html,body{margin:0;background:transparent;overflow:hidden;font-family:sans-serif}
      #card{position:fixed;bottom:40px;left:50%;transform:translate(-50%,140%);width:420px;padding:20px 24px;border-radius:16px;
        background:linear-gradient(135deg,#00c896,#00997a);color:#04140f;box-shadow:0 8px 30px rgba(0,0,0,.4);
        transition:transform .5s cubic-bezier(.2,.9,.3,1.3);}
      #card.show{transform:translate(-50%,0)}
      #card h3{margin:0 0 4px;font-size:22px}
      #card p{margin:0;font-size:15px;opacity:.85}
      #card .amount{font-size:20px;font-weight:bold;margin-top:6px}
    </style></head><body>
    <div id="card">
      <h3 id="name"></h3>
      <div class="amount" id="amount"></div>
      <p id="message"></p>
    </div>
    <script>
      const card = document.getElementById("card");
      const audioCtx = window.AudioContext ? new AudioContext() : null;
      function beep() {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        osc.start(); osc.stop(audioCtx.currentTime + 0.25);
      }
      function showDonation(d) {
        document.getElementById("name").textContent = d.donorName;
        document.getElementById("amount").textContent = "Rp" + Number(d.amount).toLocaleString("id-ID");
        document.getElementById("message").textContent = d.message || "";
        card.classList.add("show");
        if (d.sound) beep();
        if (d.tts && window.speechSynthesis) {
          const text = d.donorName + " berdonasi Rp" + d.amount + (d.message ? ". " + d.message : "");
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
        }
        setTimeout(() => card.classList.remove("show"), 7000);
      }
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("donation", (e) => showDonation(JSON.parse(e.data)));
    </script>
  </body></html>`);
}

export async function handleOverlayEvents(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).end();
  subscribe(token, res);
}

export async function handleLeaderboardPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <style>
      html,body{margin:0;background:transparent;font-family:sans-serif;color:#fff}
      #board{width:280px;padding:16px;border-radius:16px;background:rgba(15,15,20,.8)}
      #board h3{margin:0 0 8px;font-size:16px}
      #board ol{margin:0;padding-left:20px}
      #board li{margin:4px 0;font-size:14px}
    </style></head><body>
    <div id="board"><h3>🏆 Top Donatur</h3><ol id="list"></ol></div>
    <script>
      function render(leaderboard) {
        document.getElementById("list").innerHTML = leaderboard
          .map((d) => "<li>" + d.donorName + " — Rp" + Number(d.total).toLocaleString("id-ID") + "</li>")
          .join("");
      }
      fetch(${JSON.stringify(`/overlay/${token}/leaderboard/data`)}).then((r) => r.json()).then((d) => render(d.leaderboard));
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("leaderboard", (e) => render(JSON.parse(e.data).leaderboard));
    </script>
  </body></html>`);
}

export async function handleLeaderboardData(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).json({ leaderboard: [] });
  const leaderboard = await db.getDonationLeaderboard(settings.guild_id, 10);
  res.json({ leaderboard });
}
