import * as db from "../services/db.js";
import { hostLayout } from "./hostLayout.js";
import { escapeHtml } from "./htmlEscape.js";

/** Single overview of every overlay widget across the whole dashboard — each
 * one's link is also shown contextually on its own settings page (Poin, Aksi
 * & Event, Efek Suara, Tools, Tampilan Alert), but with ~20 widgets scattered
 * across 7 pages, this is the "one place to set up OBS" catalog. */
function buildWidgetGroups(baseUrl, token) {
  const url = (path) => `${baseUrl}/overlay/${token}${path}`;
  return [
    {
      label: "Donasi",
      widgets: [
        { name: "Alert", desc: "Muncul tiap ada donasi masuk. Efek tingkatan (confetti/kembang api) butuh Full Screen — lihat catatan di bawah.", url: url(""), w: 800, h: 600, fullScreen: true },
        { name: "Leaderboard", desc: "Papan peringkat donatur terbesar.", url: url("/leaderboard"), w: 280, h: 360 },
        { name: "Wishlist", desc: "Progress milestone wishlist yang lagi dikejar.", url: url("/wishlist"), w: 320, h: 160 },
        { name: "Video", desc: "Muterin klip YouTube yang di-request lewat donasi.", url: url("/video"), w: 640, h: 480 },
        { name: "Waktu", desc: "Timer countdown yang otomatis nambah tiap ada donasi — atur durasi/aturan di Waktu.", url: url("/subathon"), w: 320, h: 140 },
      ],
    },
    {
      label: "TikTok LIVE",
      widgets: [
        { name: "Chat Live", desc: "Chat TikTok LIVE beneran, bubble-nya bisa dikustom di Tampilan Alert.", url: url("/chat"), w: 360, h: 420 },
        { name: "Gift", desc: "Popup tiap ada yang ngirim gift, pakai ikon gift asli.", url: url("/gift"), w: 420, h: 100 },
        { name: "Like Counter", desc: "Jumlah like real-time.", url: url("/likes"), w: 220, h: 80 },
        { name: "Follower Count", desc: "Jumlah follower baru selama live.", url: url("/followers"), w: 260, h: 80 },
        { name: "Share Count", desc: "Jumlah share live kamu.", url: url("/share"), w: 220, h: 80 },
        { name: "Coin Jar", desc: "Toples visual yang keisi tiap ada gift.", url: url("/jar"), w: 140, h: 190 },
        { name: "Link Preview", desc: "Kartu preview kalau ada yang share link di chat (aktifin dulu di Moderasi).", url: url("/link-preview"), w: 360, h: 220 },
      ],
    },
    {
      label: "Poin & Efek Suara",
      widgets: [
        { name: "Papan Poin", desc: "Ranking poin viewer TikTok LIVE.", url: url("/points-leaderboard"), w: 280, h: 320 },
        { name: "Sound Alert", desc: "Gak nampilin apa-apa, cuma mainin suara — tetep perlu ditambahin sebagai source.", url: url("/sound-alerts"), w: 80, h: 80 },
      ],
    },
    {
      label: "Aksi & Event",
      widgets: [
        { name: "Layar 1", desc: "Media + efek custom dari Aksi & Event. Butuh Full Screen buat nampung efeknya. Tambah lebih banyak layar dengan ganti angka di ?screen=.", url: url("/actions?screen=1"), w: 1280, h: 720, fullScreen: true },
      ],
    },
    {
      label: "Tools",
      widgets: [
        { name: "Wheel of Fortune", desc: "Roda undian hadiah, dipicu dari perintah chat atau tombol manual.", url: url("/wheel"), w: 280, h: 320 },
        { name: "Likeathon", desc: "Ranking top-liker real-time, dengan foto profil.", url: url("/likeathon"), w: 280, h: 320 },
        { name: "Command Response", desc: "Nunjukin hasil perintah chat (!score, !send, dst).", url: url("/commands"), w: 440, h: 100 },
        { name: "Points Drop", desc: "Banner pas Points Drop lagi aktif.", url: url("/points-drop"), w: 420, h: 80 },
      ],
    },
  ];
}

export async function handleHostWidgetHubPage(req, res) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const groups = buildWidgetGroups(baseUrl, settings.overlay_token);

  const body = `
    <div class="topbar"><div><h1>Semua Widget</h1><p>Satu tempat buat lihat &amp; copy semua link widget OBS kamu, lengkap sama ukuran yang disaranin.</p></div>
      <a href="/host/${identifier}/widget/preview" target="_blank" rel="noopener" class="btn btn-primary">Preview Semua Widget (Live) ↗</a>
    </div>
    ${!settings.tiktok_url ? `<p class="hint" style="color:var(--warning)">Widget TikTok LIVE butuh username TikTok — isi dulu di halaman <a href="/host/${identifier}/tampilan" style="color:inherit">Tampilan</a>.</p>` : ""}
    <div class="panel" style="border-color:var(--brand);background:var(--brand-soft)">
      <p class="hint" style="color:var(--ink);margin:0"><strong>Widget bertanda "Full Screen"</strong> (Alert &amp; Aksi &amp; Event) punya efek yang nutupin seluruh layar (confetti, kembang api, flash) — tambahin sebagai Browser Source sebesar <strong>resolusi canvas OBS kamu</strong> (biasanya 1920×1080), bukan kotak kecil, biar efeknya gak kepotong.</p>
    </div>
    ${groups
      .map(
        (group) => `
    <div class="panel" style="margin-top:1.25rem">
      <h2>${escapeHtml(group.label)}</h2>
      ${group.widgets
        .map(
          (w) => `<div class="widget-card">
          <h3>${escapeHtml(w.name)}${w.fullScreen ? ' <span class="badge" style="margin-left:.4rem;font-weight:700">Full Screen</span>' : ""}</h3>
          <p class="hint" style="margin:-.4rem 0 .75rem">${escapeHtml(w.desc)}</p>
          <div class="widget-url-row">
            <input class="url-box" type="text" readonly value="${escapeHtml(w.url)}" onclick="this.select()" />
            <button type="button" class="widget-btn" onclick="copyWidgetUrl(this)" data-url="${escapeHtml(w.url)}">Copy URL</button>
            <button type="button" class="widget-btn" onclick="openWidgetWindow(this)" data-url="${escapeHtml(w.url)}" data-w="${w.w}" data-h="${w.h}">Buka</button>
          </div>
          <p class="hint" style="margin-top:.5rem">Ukuran disaranin: ${w.w}×${w.h}px</p>
        </div>`
        )
        .join("")}
    </div>`
      )
      .join("")}
    <script>
      function copyWidgetUrl(btn) {
        navigator.clipboard.writeText(btn.dataset.url).then(() => {
          const original = btn.textContent;
          btn.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(() => { btn.textContent = original; btn.classList.remove("copied"); }, 1500);
        });
      }
      function openWidgetWindow(btn) {
        const w = btn.dataset.w || 400, h = btn.dataset.h || 300;
        const left = (screen.width - w) / 2, top = (screen.height - h) / 2;
        window.open(btn.dataset.url, "_blank", "noopener,width=" + w + ",height=" + h + ",left=" + left + ",top=" + top);
      }
    </script>`;

  res.send(hostLayout(body, { active: "widget", identifier, settings }));
}

/** Absolutely-positioned iframes on one mock "OBS canvas" so every transparent
 * overlay widget can be checked live, together, without opening ~20 tabs.
 * Positions are a reasonable default arrangement (counters top-left, boards
 * top-right, chat far-right, Waktu/Alert/transient banners center), not a
 * prescription — hosts still pick their own real layout per-widget in OBS. */
export async function handleHostPreviewPage(req, res) {
  const settings = req.donationSettings;
  const identifier = req.params.identifier;
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const token = settings.overlay_token;
  // ?relay=1 tells each widget (via overlay-relay.js) to listen for events
  // relayed from this page's own 2 connections instead of opening its own —
  // see the relay wiring script below for why that's necessary here.
  const url = (path) => `${baseUrl}/overlay/${token}${path}${path.includes("?") ? "&" : "?"}relay=1`;
  const milestones = await db.listMilestones(settings.guild_id);

  // Design coordinates are against a real 1920×1080 canvas (matches a real
  // OBS/stream resolution 1:1) — the whole canvas is scaled down uniformly to
  // fit the browser window (see the stage-wrap/scaling script below), the
  // same way OBS's own preview monitor works. Widgets bigger than what fits
  // comfortably alongside everything else (Alert, Chat Live, the ranking
  // boards) are shown at a reduced scale here — that's just this overview's
  // thumbnail size, not a change to their real suggested OBS size.
  // `demo` is the test-live-event "type" (see hostDashboard.js's
  // handleHostTestLiveEvent) that makes this specific widget react — every
  // widget gets one, even ones sharing an underlying event (e.g. Coin Jar
  // reacts to the same "gift" event as the Gift popup).
  const demoBtn = (demo) =>
    demo ? `<button type="button" class="demo-btn" onclick="fireDemo('${demo}')">▶ Demo</button>` : "";

  const frame = (name, src, { top, left, right, w, h, origW = w, origH = h, demo }) => {
    const scale = w / origW;
    const pos = left !== undefined ? `left:${left}px` : `right:${right}px`;
    return `<div class="mock-item" style="top:${top}px;${pos};width:${w}px;height:${h}px">
      <div class="mock-label">${escapeHtml(name)}${demoBtn(demo)}</div>
      <iframe src="${escapeHtml(src)}"
        style="width:${origW}px;height:${origH}px;transform:scale(${scale});transform-origin:top left"></iframe>
    </div>`;
  };

  const canvasItems = [
    frame("Like Counter", url("/likes"), { top: 24, left: 24, w: 220, h: 80, demo: "likes" }),
    frame("Follower Count", url("/followers"), { top: 112, left: 24, w: 260, h: 80, demo: "follow" }),
    frame("Share Count", url("/share"), { top: 200, left: 24, w: 220, h: 80, demo: "share" }),
    frame("Coin Jar", url("/jar"), { top: 288, left: 24, w: 140, h: 190, demo: "gift" }),
    frame("Wishlist", url("/wishlist"), { top: 486, left: 24, origW: 320, origH: 160, w: 288, h: 144, demo: "wishlist" }),
    ...milestones.map((m, i) =>
      frame(`Milestone: ${m.label}`, url(`/milestone/${m.id}`), {
        top: 638 + i * 98,
        left: 24,
        w: 300,
        h: 90,
        demo: m.metric === "gifts" ? "gift-total" : m.metric === "follows" ? "follow" : m.metric === "shares" ? "share" : "likes",
      })
    ),
    frame("Waktu", url("/subathon"), { top: 24, left: 800, w: 320, h: 140, demo: "subathon-demo" }),
    frame("Gift", url("/gift"), { top: 180, left: 792, origW: 420, origH: 100, w: 336, h: 80, demo: "gift" }),
    frame("Link Preview", url("/link-preview"), { top: 276, left: 816, origW: 360, origH: 220, w: 288, h: 176, demo: "link-preview" }),
    frame("Points Drop", url("/points-drop"), { top: 468, left: 792, origW: 420, origH: 80, w: 336, h: 64, demo: "points-drop" }),
    frame("Command Response", url("/commands"), { top: 548, left: 784, origW: 440, origH: 100, w: 352, h: 80, demo: "command-response" }),
    frame("Alert", url(""), { top: 726, left: 740, origW: 800, origH: 600, w: 440, h: 330, demo: "donation" }),
    frame("Chat Live", url("/chat"), { top: 24, right: 24, origW: 360, origH: 420, w: 252, h: 294, demo: "chat" }),
    // A compact row under Chat Live instead of a full-size stacked column —
    // full-size boards here collided with either Chat Live or the centered
    // Alert/Waktu column; this is still enough to see each one update live.
    frame("Leaderboard", url("/leaderboard"), { top: 342, left: 1410, origW: 280, origH: 360, w: 154, h: 198, demo: "donation" }),
    frame("Papan Poin", url("/points-leaderboard"), { top: 342, left: 1576, origW: 280, origH: 320, w: 154, h: 176 }),
    frame("Likeathon", url("/likeathon"), { top: 342, left: 1742, origW: 280, origH: 320, w: 154, h: 176, demo: "likeathon" }),
  ].join("");

  const standaloneItems = [
    { name: "Video (klip YouTube donasi)", src: url("/video"), w: 640, h: 480, demo: "video" },
    { name: "Layar 1 — Aksi & Event (Full Screen)", src: url("/actions?screen=1"), w: 960, h: 540, demo: "action-demo" },
    { name: "Wheel of Fortune", src: url("/wheel"), w: 280, h: 320, demo: "wheel" },
    { name: "Sound Alert (audio doang, gak ada tampilan)", src: url("/sound-alerts"), w: 80, h: 80, demo: "gift" },
  ]
    .map(
      (w) => `<div class="standalone-card">
        <h3>${escapeHtml(w.name)}${demoBtn(w.demo)}</h3>
        <iframe src="${escapeHtml(w.src)}" style="width:${w.w}px;height:${w.h}px"></iframe>
      </div>`
    )
    .join("");

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <title>Preview Semua Widget — ${escapeHtml(settings.display_name || "Patungan")}</title>
    <link rel="icon" type="image/png" href="/overlay/assets/patungan.png">
    <style>
      *{box-sizing:border-box}
      html,body{margin:0;background:#1c1c1c;font-family:'Segoe UI',Arial,sans-serif;color:#fff}
      #topbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;
        gap:1rem;padding:10px 20px;background:#111;border-bottom:1px solid #333}
      #topbar h1{font-size:15px;margin:0;font-weight:700}
      #topbar p{font-size:12px;margin:2px 0 0;color:#999}
      #topbar a,#topbar button{color:#fff;background:#333;border:1px solid #444;border-radius:8px;padding:8px 14px;
        font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap;cursor:pointer}
      #topbar a:hover,#topbar button:hover{background:#444}
      #topbar button.active{background:#22c55e;border-color:#22c55e;color:#06280f}
      #canvas-wrap{padding:24px}
      /* Real 16:9 stage — a genuine 1920×1080 canvas (same as an actual OBS
         canvas resolution) uniformly scaled down to fit the window, exactly
         like OBS's own preview monitor does. Everything inside is designed
         at real 1920×1080 coordinates, never at whatever size the browser
         window happens to be. */
      #stage-wrap{position:relative;width:100%;max-width:1800px;aspect-ratio:16/9;margin:0 auto;
        overflow:hidden;border-radius:12px;border:1px solid #444;background:#000}
      #mock-canvas{position:absolute;top:0;left:0;width:1920px;height:1080px;transform-origin:top left;
        background-color:#2a2a2a;background-image:linear-gradient(45deg,#3a3a3a 25%,transparent 25%),linear-gradient(-45deg,#3a3a3a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3a3a3a 75%),linear-gradient(-45deg,transparent 75%,#3a3a3a 75%);
        background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}
      .mock-item{position:absolute}
      .mock-item iframe{border:1px dashed rgba(255,255,255,.35);border-radius:6px;background:transparent}
      .mock-label{color:#fff;font-size:11px;font-weight:700;background:rgba(0,0,0,.6);display:inline-flex;
        align-items:center;gap:6px;padding:2px 4px 2px 6px;border-radius:4px;margin-bottom:2px}
      .demo-btn{background:#4ade80;color:#0a2e1a;border:none;border-radius:3px;font-size:10px;font-weight:800;
        padding:2px 6px;cursor:pointer}
      .demo-btn:hover{background:#6ee89a}
      .demo-btn:disabled{opacity:.6;cursor:default}
      .standalone-card h3{display:flex;align-items:center;gap:8px}
      #standalone{padding:0 24px 32px}
      #standalone h2{font-size:16px}
      #standalone p{font-size:13px;color:#999}
      .standalone-card{display:inline-block;margin:0 16px 16px 0;vertical-align:top;background:#242424;
        border:1px solid #3a3a3a;border-radius:10px;padding:14px}
      .standalone-card h3{margin:0 0 10px;font-size:13px}
      .standalone-card iframe{border:1px solid #3a3a3a;border-radius:8px;background:#111}
    </style></head><body>
    <div id="topbar">
      <div><h1>Preview Semua Widget</h1><p>Semua widget transparan digabung di satu "kanvas" — posisinya cuma perkiraan, layout asli tetap kamu atur sendiri per-widget di OBS. Klik "▶ Demo" di tiap widget buat lihat reaksinya, atau nyalain Demo Semua biar jalan sendiri.</p></div>
      <div style="display:flex;gap:10px;flex:none">
        <button type="button" id="demoAllToggle" onclick="toggleDemoAll(this)">▶ Demo Semua</button>
        <a href="/host/${identifier}/widget">← Kembali ke Semua Widget</a>
      </div>
    </div>
    <div id="canvas-wrap">
      <div id="stage-wrap">
        <div id="mock-canvas">
          ${canvasItems}
        </div>
      </div>
    </div>
    <div id="standalone">
      <h2>Widget lain (bukan overlay transparan)</h2>
      <p>Video, layar Aksi &amp; Event, dan Wheel of Fortune biasanya cuma aktif di momen tertentu (atau butuh ukuran gede sendiri), jadi ditampilin terpisah dari kanvas di atas.</p>
      ${standaloneItems}
    </div>
    <script>
      const stageWrap = document.getElementById("stage-wrap");
      const stage = document.getElementById("mock-canvas");
      function fitStage() {
        stage.style.transform = "scale(" + (stageWrap.clientWidth / 1920) + ")";
      }
      fitStage();
      window.addEventListener("resize", fitStage);

      // This page embeds far more than the ~6 simultaneous connections a
      // single browser tab is allowed per origin (HTTP/1.1) — past that,
      // widgets just hang forever waiting for a socket that never frees up.
      // Real OBS use isn't affected (every Browser Source is its own
      // isolated process), but this preview page needs its own fix: hold
      // just these 2 real connections here, and relay every event down to
      // every embedded widget's iframe via postMessage instead (see
      // overlay-relay.js, loaded by each widget when given ?relay=1).
      const RELAY_EVENT_NAMES = [
        "donation", "tts", "leaderboard", "wishlist", "subathon", "subathon-label",
        "chat", "gift", "gift-total", "likes", "follow", "share", "action", "wheel",
        "likeathon", "command-response", "points-drop", "link-preview", "volume-change",
      ];
      function wireRelay(path, channel) {
        const es = new EventSource(path);
        RELAY_EVENT_NAMES.forEach((eventName) => {
          es.addEventListener(eventName, (e) => {
            document.querySelectorAll("iframe").forEach((f) => {
              try {
                f.contentWindow.postMessage({ channel, eventName, eventData: e.data }, "*");
              } catch {}
            });
          });
        });
      }
      wireRelay(${JSON.stringify(`${baseUrl}/overlay/${token}/events`)}, "events");
      wireRelay(${JSON.stringify(`${baseUrl}/overlay/${token}/live-events`)}, "live-events");

      function fireDemo(type) {
        fetch(${JSON.stringify(`/host/${identifier}/pengaturan/test-live-event`)}, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "type=" + encodeURIComponent(type),
        }).catch(() => {});
      }

      // Every widget with a "▶ Demo" button, one after another — lets a host
      // step away and watch the whole canvas come alive on its own instead of
      // clicking through ~15 buttons by hand.
      const ALL_DEMO_TYPES = Array.from(document.querySelectorAll(".demo-btn"))
        .map((btn) => btn.getAttribute("onclick").match(/fireDemo\\('([^']+)'\\)/)?.[1])
        .filter(Boolean);
      let demoAllTimer = null;
      let demoAllIdx = 0;
      function toggleDemoAll(btn) {
        if (demoAllTimer) {
          clearInterval(demoAllTimer);
          demoAllTimer = null;
          btn.textContent = "▶ Demo Semua";
          btn.classList.remove("active");
          return;
        }
        btn.textContent = "■ Berhenti";
        btn.classList.add("active");
        const fireNext = () => {
          if (!ALL_DEMO_TYPES.length) return;
          fireDemo(ALL_DEMO_TYPES[demoAllIdx % ALL_DEMO_TYPES.length]);
          demoAllIdx++;
        };
        fireNext();
        demoAllTimer = setInterval(fireNext, 3500);
      }
    </script>
  </body></html>`);
}
