import * as db from "../services/db.js";
import { createQris, qrisImageUrl } from "../services/gopayGateway.js";
import { subscribe } from "../services/donationOverlay.js";
import { getAudio } from "../services/ttsCache.js";
import { extractYouTubeId } from "../services/youtube.js";
import { logError } from "../services/logger.js";
import { escapeHtml } from "./htmlEscape.js";

/** Clean green checkout style (matches the streamer's SociaBuzz reference) for the donate form + QR pages. */
const CHECKOUT_STYLE = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{--green:#15803d;--green-light:#22c55e;--green-deep:#166534;--ink:#111827;--muted:#6b7280;--border:#e5e7eb;--track:#eef2f0}
    *{box-sizing:border-box}
    body{font-family:'Inter',sans-serif;max-width:440px;margin:0 auto;padding:32px 16px 48px;background:#fff;color:var(--ink)}
    .card{background:#fff;border:1px solid var(--border);border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);padding:22px}
    label{display:block;font-size:13px;font-weight:600;margin:16px 0 6px}
    input[type=text],input[type=number],textarea{width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--border);
      background:#fff;color:var(--ink);font:500 15px 'Inter',sans-serif}
    input:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid var(--green);outline-offset:2px}
    textarea{resize:vertical}
    button{font:700 15px 'Inter',sans-serif;border:none;border-radius:999px;cursor:pointer}
    .btn-primary{width:100%;padding:14px;margin-top:18px;background:var(--green-deep);color:#fff}
    .btn-primary:hover{background:var(--green)}
    .pill{padding:9px 4px;background:#fff;color:var(--ink);font-size:14px;border:1px solid var(--border);border-radius:999px}
    .pill.active{background:var(--green);color:#fff;border-color:var(--green)}
    .pills{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
    .hint{font-size:12px;color:var(--muted);margin-top:2px}
    .counter{font-size:12px;color:var(--muted);text-align:right}
    .check{display:flex;align-items:flex-start;gap:8px;font-size:13px;font-weight:500;margin-top:14px}
    .check input{width:18px;height:18px;margin-top:2px;accent-color:var(--green)}
    .wish{border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-top:10px;cursor:pointer}
    .wish.active{border-color:var(--green);box-shadow:0 0 0 1px var(--green)}
    .wish-row{display:flex;align-items:flex-start;gap:10px}
    .wish-row input{width:18px;height:18px;margin-top:2px;accent-color:var(--green);flex:none}
    .wish-title{font-weight:700;font-size:14px}
    .wish-amounts{font-size:12px;color:var(--muted);margin-top:2px}
    .bar{height:6px;background:var(--track);border-radius:999px;margin-top:8px;overflow:hidden}
    .bar-fill{height:100%;background:var(--green-light)}
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
  const wishlistItems = await db.listWishlistItemsWithProgress(settings.guild_id);

  const wishlistHtml = wishlistItems.length
    ? `<label>Kontribusi ke wishlist (opsional)</label>
       ${wishlistItems
         .map((w) => {
           const pct = Math.min(100, Math.round((w.total / w.target_amount) * 100));
           return `<label class="wish" for="wish-${w.id}">
             <div class="wish-row">
               <input type="radio" name="wishlistItemId" id="wish-${w.id}" value="${w.id}" />
               <div style="flex:1">
                 <div class="wish-title">${escapeHtml(w.title)}</div>
                 <div class="wish-amounts">Rp${w.total.toLocaleString("id-ID")} / Rp${Number(w.target_amount).toLocaleString("id-ID")} (${pct}%)</div>
                 <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
               </div>
             </div>
           </label>`;
         })
         .join("")}
       <label class="wish" for="wish-none">
         <div class="wish-row">
           <input type="radio" name="wishlistItemId" id="wish-none" value="" checked />
           <div class="wish-title" style="font-weight:500">Tidak, donasi biasa aja</div>
         </div>
       </label>`
    : "";

  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    ${CHECKOUT_STYLE}
    </head><body>
    <div style="text-align:center;margin-bottom:20px">
      <div style="width:76px;height:76px;border-radius:50%;background:var(--green);border:3px solid #fff;box-shadow:0 0 0 3px var(--green);
        display:flex;align-items:center;justify-content:center;margin:0 auto 10px;color:#fff;font-size:32px;font-weight:800">${initial}</div>
      <h1 style="margin:0;font-size:22px">${title}</h1>
      ${settings.description ? `<p style="margin:6px 0 0;color:var(--muted);font-size:14px">${escapeHtml(settings.description)}</p>` : ""}
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

      ${wishlistHtml}

      <label for="youtubeUrl">Link video YouTube (opsional)</label>
      <input type="text" name="youtubeUrl" id="youtubeUrl" placeholder="https://youtube.com/watch?v=..." />
      <p class="hint">Diputar di layar live pas donasi kamu muncul.</p>

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

      document.querySelectorAll('input[name="wishlistItemId"]').forEach((radio) => {
        radio.addEventListener("change", () => {
          document.querySelectorAll(".wish").forEach((w) => w.classList.remove("active"));
          radio.closest(".wish")?.classList.add("active");
        });
      });
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
  const rawWishlistItemId = req.body.wishlistItemId ? Number(req.body.wishlistItemId) : null;
  const wishlistItem = rawWishlistItemId ? await db.getWishlistItem(guildId, rawWishlistItemId) : null;
  const youtubeVideoId = extractYouTubeId(req.body.youtubeUrl);

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
      wishlistItemId: wishlistItem?.id || null,
      youtubeVideoId,
    });
  } catch (err) {
    logError(`Failed to store donation for guild ${guildId}:`, err);
    return res.status(500).send("Gagal menyimpan data donasi.");
  }

  const expiresAt = qris.expires_at ? new Date(qris.expires_at).getTime() : null;

  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Scan untuk Bayar</title>
    ${CHECKOUT_STYLE}
    </head><body style="text-align:center">
    <div class="card">
      <h1 style="margin:0 0 4px;font-size:20px">Scan QRIS ini</h1>
      ${wishlistItem ? `<p class="hint">Patungan ke wishlist <strong>${escapeHtml(wishlistItem.title)}</strong></p>` : ""}
      <div style="display:inline-block;margin:8px 0;padding:6px 16px;background:var(--track);
        border-radius:999px;font-size:22px;font-weight:800;color:var(--green)">Rp${Number(qris.amount).toLocaleString("id-ID")}</div>
      <div style="margin:14px auto 0;padding:10px;background:#fff;border:1px solid var(--border);border-radius:12px;max-width:260px">
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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;overflow:hidden;font-family:'Inter',sans-serif}

      #unlock{position:fixed;top:16px;right:16px;padding:8px 14px;border-radius:999px;background:rgba(17,24,39,.85);
        color:#fff;font:600 12px 'Inter',sans-serif;cursor:pointer;border:1px solid rgba(255,255,255,.15);z-index:10}
      #unlock.hidden{display:none}

      #stage{position:fixed;bottom:56px;left:50%;width:340px;transform:translate(-50%,16px);
        display:flex;flex-direction:column;align-items:center;text-align:center;
        opacity:0;transition:opacity .4s ease,transform .4s ease}
      #stage.show{opacity:1;transform:translate(-50%,0)}
      #stage.hide{opacity:0;transform:translate(-50%,-10px)}
      @media (prefers-reduced-motion: reduce){
        #stage{transition:opacity .2s linear}
        #stage.show,#stage.hide{transform:translate(-50%,0)}
      }

      #avatar-wrap{position:relative;width:88px;height:88px;margin-bottom:14px}
      #avatar{width:100%;height:100%;border-radius:50%;background:radial-gradient(circle at 35% 30%,#4ade80,#16a34a);
        display:flex;align-items:center;justify-content:center;font-size:40px;
        box-shadow:0 4px 18px rgba(0,0,0,.35);overflow:hidden}
      #avatar img{width:100%;height:100%;object-fit:cover}
      .deco{position:absolute;font-size:20px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));animation:float 2.4s ease-in-out infinite}
      .deco.d1{top:-8px;left:-10px;animation-delay:0s}
      .deco.d2{top:-6px;right:-12px;font-size:16px;animation-delay:.4s}
      .deco.d3{bottom:-4px;left:50%;transform:translateX(-50%);font-size:15px;animation-delay:.8s}
      @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
      .deco.d3{animation-name:float-center}
      @keyframes float-center{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-5px)}}

      #line1{font-size:19px;font-weight:800;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.55);line-height:1.3}
      #line1 .name{color:#86efac}
      #line2{margin-top:4px;font-size:14px;font-weight:500;color:rgba(255,255,255,.92);
        text-shadow:0 1px 4px rgba(0,0,0,.55);max-width:300px}
    </style></head><body>
    <button id="unlock" type="button">🔈 Klik buat aktifin suara</button>
    <div id="stage">
      <div id="avatar-wrap">
        <div id="avatar">${settings.avatar_data ? `<img src="/overlay/${token}/avatar" alt="" />` : "🙏"}</div>
        <span class="deco d1">💛</span>
        <span class="deco d2">✨</span>
        <span class="deco d3">💚</span>
      </div>
      <div id="line1"></div>
      <p id="line2"></p>
    </div>
    <script>
      const stage = document.getElementById("stage");
      const unlockBtn = document.getElementById("unlock");
      const bellSound = new Audio("/overlay/assets/bell.wav");
      let audioUnlocked = false;

      // Browsers block audio/speech until this page gets a real click, a timer
      // doesn't count, so this only hides once that click genuinely happens.
      function unlockAudio() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        unlockBtn.classList.add("hidden");
        try {
          bellSound.volume = 0;
          bellSound.play().then(() => { bellSound.pause(); bellSound.currentTime = 0; bellSound.volume = 1; }).catch(() => {});
        } catch {}
      }
      unlockBtn.addEventListener("click", unlockAudio);
      document.addEventListener("click", unlockAudio);

      function chime() {
        bellSound.currentTime = 0;
        bellSound.play().catch(() => {});
      }

      function showDonation(d) {
        const line1 = document.getElementById("line1");
        line1.innerHTML = "";
        const amountEl = document.createElement("span");
        amountEl.textContent = "Rp" + Number(d.amount).toLocaleString("id-ID") + " dari ";
        const nameEl = document.createElement("span");
        nameEl.className = "name";
        nameEl.textContent = d.donorName;
        line1.append(amountEl, nameEl);
        document.getElementById("line2").textContent = d.message || "";
        stage.classList.remove("hide");
        stage.classList.add("show");
        if (d.sound) chime();
        setTimeout(() => {
          stage.classList.add("hide");
          stage.classList.remove("show");
        }, 8000); // gives the TTS narration (arrives separately, a few seconds later) room to finish
      }
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("donation", (e) => showDonation(JSON.parse(e.data)));
      // Narration is generated server-side (Gemini TTS, always works the
      // same regardless of the viewer's browser/OS) and arrives a few
      // seconds after the "donation" event, so it's played on its own here.
      events.addEventListener("tts", (e) => {
        try {
          new Audio(JSON.parse(e.data).url).play().catch(() => {});
        } catch {}
      });
    </script>
  </body></html>`);
}

export async function handleOverlayEvents(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).end();
  subscribe(token, res);
}

export function handleOverlayAudio(req, res) {
  const buffer = getAudio(req.params.id);
  if (!buffer) return res.status(404).end();
  res.set("Content-Type", "audio/wav");
  res.send(buffer);
}

export async function handleOverlayAvatar(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings?.avatar_data) return res.status(404).end();
  res.set("Content-Type", settings.avatar_mime || "image/png");
  res.set("Cache-Control", "no-cache");
  res.send(Buffer.from(settings.avatar_data, "base64"));
}

export async function handleLeaderboardPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Inter',sans-serif}
      #board{width:260px;padding:16px 18px;border-radius:14px;background:rgba(17,24,39,.82);
        border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(6px)}
      #board h3{margin:0 0 12px;font-size:13px;font-weight:600;color:rgba(255,255,255,.6);
        text-transform:uppercase;letter-spacing:.04em}
      #list{list-style:none;margin:0;padding:0}
      #list li{display:flex;justify-content:space-between;gap:10px;margin:8px 0;font-size:14px;font-weight:600;color:#fff}
      #list .rank{color:#4ade80;font-weight:700;width:20px}
      #list .amount{font-weight:700;color:rgba(255,255,255,.85)}
    </style></head><body>
    <div id="board"><h3>Top Donatur</h3><ol id="list"></ol></div>
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

export async function handleWishlistPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;font-family:'Inter',sans-serif}
      #board{width:300px;padding:16px 18px;border-radius:14px;background:rgba(17,24,39,.82);
        border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(6px)}
      #board h3{margin:0 0 12px;font-size:13px;font-weight:600;color:rgba(255,255,255,.6);
        text-transform:uppercase;letter-spacing:.04em}
      .item{margin:0 0 14px}
      .item:last-child{margin-bottom:0}
      .item-top{display:flex;justify-content:space-between;align-items:baseline;font-size:14px;font-weight:600;color:#fff;margin-bottom:4px}
      .item-top .pct{font-size:12px;font-weight:600;color:#4ade80}
      .item-amounts{font-size:11px;color:rgba(255,255,255,.5);margin-bottom:6px}
      .bar{height:6px;background:rgba(255,255,255,.12);border-radius:999px;overflow:hidden}
      .bar-fill{height:100%;background:#22c55e;border-radius:999px;transition:width .4s ease}
    </style></head><body>
    <div id="board"><h3>Wishlist</h3><div id="list"></div></div>
    <script>
      function render(items) {
        const list = document.getElementById("list");
        list.innerHTML = "";
        items.forEach((w) => {
          const pct = Math.min(100, Math.round((w.total / w.target_amount) * 100));
          const div = document.createElement("div");
          div.className = "item";
          const top = document.createElement("div");
          top.className = "item-top";
          const title = document.createElement("span");
          title.textContent = w.title;
          const pctEl = document.createElement("span");
          pctEl.className = "pct";
          pctEl.textContent = pct + "%";
          top.append(title, pctEl);
          const amounts = document.createElement("div");
          amounts.className = "item-amounts";
          amounts.textContent = "Rp" + Number(w.total).toLocaleString("id-ID") + " dari Rp" + Number(w.target_amount).toLocaleString("id-ID");
          const bar = document.createElement("div");
          bar.className = "bar";
          const fill = document.createElement("div");
          fill.className = "bar-fill";
          fill.style.width = pct + "%";
          bar.appendChild(fill);
          div.append(top, amounts, bar);
          list.appendChild(div);
        });
      }
      fetch(${JSON.stringify(`/overlay/${token}/wishlist/data`)}).then((r) => r.json()).then((d) => render(d.items));
      const events = new EventSource(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("wishlist", (e) => render(JSON.parse(e.data).items));
    </script>
  </body></html>`);
}

export async function handleWishlistData(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).json({ items: [] });
  const items = await db.listWishlistItemsWithProgress(settings.guild_id);
  res.json({ items });
}

const VIDEO_MAX_SECONDS = 60;

export async function handleVideoPage(req, res) {
  const { token } = req.params;
  const settings = await db.getDonationSettingsByOverlayToken(token);
  if (!settings) return res.status(404).send("Overlay not found.");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@600&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;background:transparent;overflow:hidden;font-family:'Inter',sans-serif}
      #unlock{position:fixed;top:16px;right:16px;padding:8px 14px;border-radius:999px;background:rgba(17,24,39,.85);
        color:#fff;font:600 12px 'Inter',sans-serif;cursor:pointer;border:1px solid rgba(255,255,255,.15);z-index:10}
      #unlock.hidden{display:none}
      #wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
        opacity:0;transition:opacity .3s ease}
      #wrap.show{opacity:1}
      #player{width:100%;height:100%}
    </style></head><body>
    <button id="unlock" type="button">🔈 Klik buat aktifin suara</button>
    <div id="wrap"><div id="player"></div></div>
    <script src="https://www.youtube.com/iframe_api"></script>
    <script>
      const wrap = document.getElementById("wrap");
      const unlockBtn = document.getElementById("unlock");
      let audioUnlocked = false;
      function unlockAudio() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        unlockBtn.classList.add("hidden");
      }
      unlockBtn.addEventListener("click", unlockAudio);
      document.addEventListener("click", unlockAudio);

      let player = null;
      let ready = false;
      let hideTimer = null;
      const queue = [];

      function onYouTubeIframeAPIReady() {
        player = new YT.Player("player", {
          playerVars: { autoplay: 1, playsinline: 1, controls: 0, modestbranding: 1 },
          events: {
            onReady: () => { ready = true; drain(); },
            onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) hideVideo(); },
          },
        });
      }
      window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

      function drain() {
        if (!ready || !queue.length) return;
        playVideo(queue.shift());
      }

      function playVideo(videoId) {
        clearTimeout(hideTimer);
        player.loadVideoById(videoId);
        player.unMute?.();
        wrap.classList.add("show");
        hideTimer = setTimeout(hideVideo, ${VIDEO_MAX_SECONDS * 1000});
      }

      function hideVideo() {
        clearTimeout(hideTimer);
        wrap.classList.remove("show");
        try { player?.stopVideo(); } catch {}
      }

      const events = new EventSource(${JSON.stringify(`/overlay/${token}/events`)});
      events.addEventListener("donation", (e) => {
        const d = JSON.parse(e.data);
        if (!d.youtubeVideoId) return;
        queue.push(d.youtubeVideoId);
        drain();
      });
    </script>
  </body></html>`);
}
