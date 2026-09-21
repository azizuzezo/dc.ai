import * as db from "../services/db.js";
import { createQris, qrisImageUrl } from "../services/gopayGateway.js";
import { subscribe } from "../services/donationOverlay.js";
import { logError } from "../services/logger.js";

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export async function handleDonatePage(req, res) {
  const settings = await db.getDonationSettingsByIdentifier(req.params.identifier);
  if (!settings?.gateway_url || !settings?.gateway_api_key) {
    return res.status(404).send("Halaman donasi belum diaktifkan untuk server ini.");
  }

  const title = escapeHtml(settings.display_name || "Kirim Dukungan");

  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    <style>
      body{font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px;background:#0f0f14;color:#fff}
      input,textarea,button{width:100%;box-sizing:border-box;padding:10px;margin:6px 0;border-radius:8px;border:1px solid #333;background:#1a1a22;color:#fff;font-size:16px}
      button{background:#00c896;color:#04140f;font-weight:bold;border:none;cursor:pointer}
      label{font-size:13px;opacity:.8}
    </style></head><body>
    <h2>💛 ${title}</h2>
    ${settings.description ? `<p style="opacity:.8">${escapeHtml(settings.description)}</p>` : ""}
    <form method="post" action="/donate/${req.params.identifier}">
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
  const settings = await db.getDonationSettingsByIdentifier(req.params.identifier);
  if (!settings?.gateway_url || !settings?.gateway_api_key) {
    return res.status(404).send("Halaman donasi belum diaktifkan untuk server ini.");
  }
  const guildId = settings.guild_id;

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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;overflow:hidden;font-family:'Poppins',sans-serif}

      #unlock{position:fixed;top:16px;right:16px;padding:8px 14px;border-radius:999px;background:rgba(20,10,35,.85);
        color:#ffd66b;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.4);
        animation:pulse 1.6s ease-in-out infinite;z-index:10}
      #unlock.hidden{display:none}
      @keyframes pulse{0%,100%{opacity:.85}50%{opacity:1}}

      #stage{position:fixed;bottom:48px;left:50%;width:440px;transform:translate(-50%,0)}
      #card{position:relative;padding:22px 26px;border-radius:22px;text-align:center;
        background:linear-gradient(160deg,#241238,#160a24);
        box-shadow:0 0 0 2px rgba(255,214,107,.55),0 12px 40px rgba(0,0,0,.55),0 0 40px rgba(255,110,199,.25);
        opacity:0;transform:scale(.6) translateY(60px);
        transition:opacity .5s cubic-bezier(.34,1.56,.64,1),transform .5s cubic-bezier(.34,1.56,.64,1)}
      #card.show{opacity:1;transform:scale(1) translateY(0)}
      #card.hide{opacity:0;transform:scale(.85) translateY(30px);transition:opacity .35s ease-in,transform .35s ease-in}
      #badge{display:inline-block;padding:4px 12px;border-radius:999px;background:linear-gradient(90deg,#ffd66b,#ff9a5a);
        color:#2a1400;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      #name{margin:12px 0 2px;font-size:24px;font-weight:800;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.4)}
      #amount{font-size:34px;font-weight:800;margin:2px 0 8px;
        background:linear-gradient(90deg,#ffe9a8,#ffd66b);-webkit-background-clip:text;background-clip:text;color:transparent}
      #message{margin:0;font-size:15px;font-style:italic;color:rgba(255,255,255,.85);
        border-left:3px solid #ffd66b;padding-left:10px;text-align:left;display:inline-block;max-width:340px}

      .confetti{position:absolute;top:40%;left:50%;width:8px;height:8px;border-radius:2px;pointer-events:none;
        animation:confetti-burst var(--dur) ease-out forwards}
      @keyframes confetti-burst{
        0%{transform:translate(-50%,-50%) rotate(0) scale(1);opacity:1}
        100%{transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) rotate(var(--rot)) scale(.4);opacity:0}
      }
    </style></head><body>
    <div id="unlock">🔈 Klik buat aktifin suara</div>
    <div id="stage">
      <div id="card">
        <span id="badge">🎉 Donasi Baru</span>
        <div id="name"></div>
        <div id="amount"></div>
        <p id="message"></p>
      </div>
    </div>
    <script>
      const card = document.getElementById("card");
      const stage = document.getElementById("stage");
      const unlockBtn = document.getElementById("unlock");
      let audioCtx = window.AudioContext ? new AudioContext() : null;
      let audioUnlocked = false;

      function unlockAudio() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        unlockBtn.classList.add("hidden");
        try { audioCtx?.resume(); } catch {}
        try {
          const warm = new SpeechSynthesisUtterance(" ");
          warm.volume = 0;
          window.speechSynthesis?.speak(warm);
        } catch {}
      }
      unlockBtn.addEventListener("click", unlockAudio);
      document.addEventListener("click", unlockAudio, { once: true });
      setTimeout(unlockAudio, 300); // OBS/TikTok Live Studio browser sources aren't a real user session, so this is usually already allowed there.

      function chime() {
        if (!audioCtx) return;
        const notes = [880, 1108, 1318];
        notes.forEach((freq, i) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.frequency.value = freq;
          const start = audioCtx.currentTime + i * 0.09;
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
          osc.start(start); osc.stop(start + 0.3);
        });
      }

      function burstConfetti() {
        const colors = ["#ffd66b", "#ff6ec7", "#7ef2c3", "#7db8ff", "#fff"];
        for (let i = 0; i < 18; i++) {
          const el = document.createElement("span");
          el.className = "confetti";
          const angle = Math.random() * Math.PI * 2;
          const dist = 60 + Math.random() * 90;
          el.style.setProperty("--tx", Math.cos(angle) * dist + "px");
          el.style.setProperty("--ty", Math.sin(angle) * dist - 20 + "px");
          el.style.setProperty("--rot", Math.random() * 360 + "deg");
          el.style.setProperty("--dur", 0.7 + Math.random() * 0.5 + "s");
          el.style.background = colors[i % colors.length];
          card.appendChild(el);
          el.addEventListener("animationend", () => el.remove());
        }
      }

      function showDonation(d) {
        document.getElementById("name").textContent = d.donorName;
        document.getElementById("amount").textContent = "Rp" + Number(d.amount).toLocaleString("id-ID");
        document.getElementById("message").textContent = d.message || "";
        card.classList.remove("hide");
        card.classList.add("show");
        burstConfetti();
        if (d.sound) chime();
        if (d.tts && window.speechSynthesis) {
          try {
            window.speechSynthesis.cancel();
            const text = d.donorName + " berdonasi Rp" + d.amount + (d.message ? ". " + d.message : "");
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = "id-ID";
            utter.rate = 1;
            utter.volume = 1;
            window.speechSynthesis.speak(utter);
          } catch {}
        }
        setTimeout(() => {
          card.classList.add("hide");
          card.classList.remove("show");
        }, 7000);
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
