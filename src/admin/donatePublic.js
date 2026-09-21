import * as db from "../services/db.js";
import { createQris, qrisImageUrl } from "../services/gopayGateway.js";
import { subscribe } from "../services/donationOverlay.js";
import { logError } from "../services/logger.js";
import { escapeHtml } from "./htmlEscape.js";

/** Shared sticker-style palette for every donor-facing page (checkout, QR, overlay). */
const PAGE_STYLE = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{--pink:#ff3b7f;--pink-deep:#c2185b;--yellow:#ffd400;--ink:#14121a;--paper:#faf9f6}
    *{box-sizing:border-box}
    body{font-family:'Baloo 2',sans-serif;max-width:420px;margin:32px auto;padding:0 16px 40px;background:var(--paper);color:var(--ink)}
    .card{background:#fff;border:4px solid var(--ink);border-radius:18px;box-shadow:6px 6px 0 var(--ink);padding:22px}
    label{display:block;font-size:13px;font-weight:600;margin:16px 0 6px}
    input[type=text],input[type=number],textarea{width:100%;padding:11px 12px;border-radius:10px;border:3px solid var(--ink);
      background:#fff;color:var(--ink);font:600 16px 'Baloo 2',sans-serif}
    textarea{resize:vertical}
    button{font:800 16px 'Baloo 2',sans-serif;border:3px solid var(--ink);border-radius:10px;cursor:pointer}
    .btn-primary{width:100%;padding:13px;margin-top:18px;background:var(--pink-deep);color:#fff;box-shadow:4px 4px 0 var(--ink)}
    .btn-primary:active{box-shadow:none;transform:translate(4px,4px)}
    .pill{padding:9px 4px;background:#fff;color:var(--ink);font-size:14px}
    .pill.active{background:var(--yellow)}
    .pills{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
    .hint{font-size:12px;color:#6b6b6b;margin-top:2px}
    .counter{font-size:12px;color:#6b6b6b;text-align:right}
    .check{display:flex;align-items:flex-start;gap:8px;font-size:13px;font-weight:500;margin-top:14px}
    .check input{width:18px;height:18px;margin-top:2px}
  </style>`;

export async function handleDonatePage(req, res) {
  const settings = await db.getDonationSettingsByIdentifier(req.params.identifier);
  if (!settings?.gateway_url || !settings?.gateway_api_key) {
    return res.status(404).send("Halaman donasi belum diaktifkan untuk server ini.");
  }

  const identifier = req.params.identifier;
  const title = escapeHtml(settings.display_name || "Dukung Kami");
  const initial = escapeHtml(title.trim().charAt(0).toUpperCase() || "?");
  const min = settings.min_amount;
  const presets = [10000, 25000, 50000, 100000, 200000, 500000].filter((v) => v >= min).slice(0, 6);
  if (!presets.length) presets.push(min, min * 2, min * 5);

  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    ${PAGE_STYLE}
    </head><body>
    <div style="text-align:center;margin-bottom:20px">
      <div style="width:76px;height:76px;border-radius:50%;background:var(--pink);border:4px solid var(--ink);
        display:flex;align-items:center;justify-content:center;margin:0 auto 10px;color:#fff;font-size:32px;font-weight:800">${initial}</div>
      <h1 style="margin:0;font-size:24px">${title}</h1>
      ${settings.description ? `<p style="margin:6px 0 0;color:#4a4a4a;font-size:14px">${escapeHtml(settings.description)}</p>` : ""}
    </div>
    <form class="card" method="post" action="/donate/${identifier}">
      <label>Nominal (Rp, minimal ${min.toLocaleString("id-ID")})</label>
      <div class="pills">
        ${presets.map((p) => `<button type="button" class="pill" data-amount="${p}">${p.toLocaleString("id-ID")}</button>`).join("")}
      </div>
      <input type="number" name="amount" id="amount" min="${min}" step="500" required style="margin-top:10px" placeholder="Atau isi nominal lain" />

      <label>Nama</label>
      <input type="text" name="donorName" id="donorName" maxlength="40" placeholder="Nama kamu" />
      <label class="check"><input type="checkbox" id="anon" /> Donasi sebagai Anonim</label>

      <label>Pesan (opsional)</label>
      <textarea name="message" id="message" maxlength="200" rows="3"></textarea>
      <div class="counter"><span id="msgCount">0</span>/200</div>

      <label class="check">
        <input type="checkbox" required />
        Saya menyatakan donasi ini dukungan pribadi, bukan transaksi komersial, dan tidak melanggar hukum yang berlaku.
      </label>

      <button type="submit" class="btn-primary">Buat QRIS Sekarang</button>
    </form>
    <script>
      const amountInput = document.getElementById("amount");
      document.querySelectorAll(".pill").forEach((btn) => {
        btn.addEventListener("click", () => {
          document.querySelectorAll(".pill").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          amountInput.value = btn.dataset.amount;
        });
      });
      amountInput.addEventListener("input", () => {
        document.querySelectorAll(".pill").forEach((b) => b.classList.toggle("active", b.dataset.amount === amountInput.value));
      });

      const donorName = document.getElementById("donorName");
      document.getElementById("anon").addEventListener("change", (e) => {
        donorName.disabled = e.target.checked;
        if (e.target.checked) donorName.value = "";
      });

      const message = document.getElementById("message");
      const msgCount = document.getElementById("msgCount");
      message.addEventListener("input", () => { msgCount.textContent = message.value.length; });
    </script>
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

  const expiresAt = qris.expires_at ? new Date(qris.expires_at).getTime() : null;

  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Scan untuk Bayar</title>
    ${PAGE_STYLE}
    </head><body style="text-align:center">
    <div class="card">
      <h1 style="margin:0 0 4px;font-size:20px">Scan QRIS ini</h1>
      <div style="display:inline-block;margin:8px 0;padding:6px 16px;background:var(--yellow);border:3px solid var(--ink);
        border-radius:8px;font-size:22px;font-weight:800">Rp${Number(qris.amount).toLocaleString("id-ID")}</div>
      <div style="margin:14px auto 0;padding:10px;background:#fff;border:3px solid var(--ink);border-radius:12px;max-width:260px">
        <img src="${escapeHtml(qrisImageUrl(settings.gateway_url, qris.qris_id))}" alt="Kode QRIS" style="width:100%;display:block" />
      </div>
      <p id="status" style="font-weight:700;margin:16px 0 4px">⏳ Menunggu pembayaran...</p>
      ${expiresAt ? `<p id="countdown" class="hint"></p>` : ""}
    </div>
    <script>
      const trxId = ${JSON.stringify(qris.trx_id)};
      const expiresAt = ${JSON.stringify(expiresAt)};
      let done = false;

      function tickCountdown() {
        if (done || !expiresAt) return;
        const secondsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
        const el = document.getElementById("countdown");
        if (el) el.textContent = secondsLeft > 0 ? "Kedaluwarsa dalam " + Math.floor(secondsLeft / 60) + ":" + String(secondsLeft % 60).padStart(2, "0") : "";
      }
      setInterval(tickCountdown, 1000);
      tickCountdown();

      async function poll() {
        if (done) return;
        try {
          const res = await fetch("/donate/status/" + trxId);
          const data = await res.json();
          if (data.status === "paid") {
            done = true;
            document.getElementById("status").textContent = "✅ Terima kasih atas dukungannya!";
            return;
          }
          if (data.status === "expired") {
            done = true;
            document.getElementById("status").textContent = "⌛ QRIS sudah kedaluwarsa, silakan buat ulang.";
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
    <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;overflow:hidden;font-family:'Baloo 2',sans-serif}

      #unlock{position:fixed;top:16px;right:16px;padding:9px 16px;border-radius:10px;background:#ffd400;
        color:#14121a;font:700 13px 'Baloo 2',sans-serif;cursor:pointer;border:3px solid #14121a;
        box-shadow:4px 4px 0 #14121a;z-index:10}
      #unlock.hidden{display:none}

      #stage{position:fixed;bottom:48px;left:50%;width:420px;transform:translate(-50%,0)}
      #card{position:relative;padding:22px 28px;text-align:center;border-radius:18px;
        background:#ff3b7f;border:5px solid #14121a;box-shadow:8px 8px 0 #14121a;
        transform:scale(0) rotate(-8deg);opacity:0}
      #card.show{animation:pop-in .5s cubic-bezier(.2,.9,.3,1.1) forwards}
      #card.hide{animation:pop-out .3s ease-in forwards}
      @keyframes pop-in{
        0%{transform:scale(0) rotate(-8deg);opacity:0}
        60%{transform:scale(1.08) rotate(3deg);opacity:1}
        100%{transform:scale(1) rotate(-2deg);opacity:1}
      }
      @keyframes pop-out{
        0%{transform:scale(1) rotate(-2deg);opacity:1}
        100%{transform:scale(.8) rotate(-2deg) translateY(20px);opacity:0}
      }
      @media (prefers-reduced-motion: reduce){
        #card.show{animation:none;transform:rotate(-2deg);opacity:1}
        #card.hide{animation:none;opacity:0}
      }

      #name{font-size:26px;font-weight:800;color:#14121a;line-height:1.15}
      #amount{display:inline-block;margin:10px 0;padding:5px 16px;border-radius:8px;
        background:#ffd400;border:3px solid #14121a;color:#14121a;font-size:26px;font-weight:800;transform:rotate(2deg)}
      #message{margin:0;font-size:15px;font-weight:600;color:#14121a}

      .confetti{position:absolute;top:35%;left:50%;width:9px;height:9px;pointer-events:none;
        animation:confetti-burst var(--dur) ease-out forwards}
      @keyframes confetti-burst{
        0%{transform:translate(-50%,-50%) rotate(0) scale(1);opacity:1}
        100%{transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) rotate(var(--rot)) scale(.5);opacity:0}
      }
    </style></head><body>
    <button id="unlock" type="button">🔈 Klik buat aktifin suara</button>
    <div id="stage">
      <div id="card">
        <div id="name"></div>
        <div id="amount"></div>
        <p id="message"></p>
      </div>
    </div>
    <script>
      const card = document.getElementById("card");
      const unlockBtn = document.getElementById("unlock");
      let audioCtx = window.AudioContext ? new AudioContext() : null;
      let audioUnlocked = false;

      // Browsers block audio until this page gets a real click, a timer
      // doesn't count, so this only hides once that click genuinely happens.
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
      document.addEventListener("click", unlockAudio);

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
        const colors = ["#ff3b7f", "#ffd400", "#14121a", "#fff"];
        for (let i = 0; i < 16; i++) {
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
        document.getElementById("name").textContent = d.donorName + " ngasih dukungan!";
        document.getElementById("amount").textContent = "Rp" + Number(d.amount).toLocaleString("id-ID");
        document.getElementById("message").textContent = d.message || "";
        card.classList.remove("hide");
        card.classList.add("show");
        burstConfetti();
        if (d.sound) chime();
        if (d.tts && window.speechSynthesis) {
          try {
            window.speechSynthesis.cancel();
            const text = "Rp" + d.amount + " dari " + d.donorName + (d.message ? ". " + d.message : "");
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
        }, 6000);
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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Baloo 2',sans-serif}
      #board{width:260px;padding:16px 18px;border-radius:16px;background:#fff;border:5px solid #14121a;box-shadow:6px 6px 0 #14121a}
      #board h3{margin:0 0 10px;font-size:16px;font-weight:800;color:#14121a}
      #list{list-style:none;margin:0;padding:0}
      #list li{display:flex;justify-content:space-between;gap:10px;margin:6px 0;font-size:14px;font-weight:600;color:#14121a}
      #list .rank{color:#ff3b7f;font-weight:800;width:20px}
      #list .amount{font-weight:800}
    </style></head><body>
    <div id="board"><h3>🏆 Top Donatur</h3><ol id="list"></ol></div>
    <script>
      function render(leaderboard) {
        const list = document.getElementById("list");
        list.innerHTML = "";
        leaderboard.forEach((d, i) => {
          const li = document.createElement("li");
          const rank = document.createElement("span");
          rank.className = "rank";
          rank.textContent = "#" + (i + 1);
          const name = document.createElement("span");
          name.textContent = d.donorName;
          const amount = document.createElement("span");
          amount.className = "amount";
          amount.textContent = "Rp" + Number(d.total).toLocaleString("id-ID");
          li.append(rank, name, amount);
          list.appendChild(li);
        });
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
