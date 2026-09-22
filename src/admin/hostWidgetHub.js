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
        { name: "Subathon", desc: "Timer countdown yang otomatis nambah tiap ada donasi — atur durasi/aturan di Subathon.", url: url("/subathon"), w: 320, h: 140 },
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
    <div class="topbar"><div><h1>Semua Widget</h1><p>Satu tempat buat lihat &amp; copy semua link widget OBS kamu, lengkap sama ukuran yang disaranin.</p></div></div>
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
