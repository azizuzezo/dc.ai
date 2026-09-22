import { escapeHtml } from "./htmlEscape.js";

/** Light green/white dashboard tokens matched exactly against sociabuzz.com's own
 * computed styles (getComputedStyle on their live donate/tribe page, see
 * docs/design-references — brand green #76cc11, rank-tier greens #93dc3e/#aced60,
 * "Open Sans", white page background, #e5e5e5 neutral track/border). */
const HOST_STYLE = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{
      --paper:#fff;--paper-2:#f7f9f5;--paper-3:#eef4e8;
      --surface:#fff;--ink:#122e1e;--ink-2:#1e3a2a;--muted:#5b7267;
      --rule:#e5e5e5;--rule-strong:#c8d6c0;
      --brand:#76cc11;--brand-strong:#5da80d;--brand-soft:#eaffd6;
      --accent-2:#aced60;--accent-ink:#1a3d0a;
      --success:#22c55e;--warning:#f59e0b;--error:#dc2626;
      --radius-sm:0.25rem;--radius-md:0.5rem;--radius-lg:0.75rem;--radius-pill:999px;
      --shadow-brutal:0 20px 25px -5px #0000001a,0 8px 10px -6px #0000001a;
      --shadow-brutal-sm:0 4px 6px -1px #0000001a,0 2px 4px -2px #0000001a;
      --ease-out:cubic-bezier(0.16,1,0.3,1)
    }
    *{box-sizing:border-box}
    body{margin:0;background:var(--paper);color:var(--ink-2);font-family:'Open Sans',ui-sans-serif,sans-serif;
      font-size:16px;font-weight:500;line-height:1.55}
    h1,h2,h3{color:var(--ink);font-family:'Open Sans',ui-sans-serif,sans-serif;letter-spacing:-.03em;
      line-height:1.08;margin:0;font-weight:800}
    a{color:inherit}
    .mono{font-family:'Geist Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
    button,.btn{font:700 14px/1 'Open Sans',sans-serif;cursor:pointer}

    #shell{display:flex;min-height:100vh}
    #rail{width:17rem;flex:none;background:var(--brand);color:#fff;padding:1.5rem 1.25rem;
      display:flex;flex-direction:column;gap:.25rem;position:sticky;top:0;height:100vh;overflow-y:auto}
    .rail-brand{font-weight:800;font-size:1.05rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:.5rem}
    .rail-brand img{width:28px;height:28px;border-radius:50%;object-fit:cover}
    .rail-group-label{font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
      color:#eaffd6;margin:1rem 0 .4rem}
    .rail-link{display:flex;align-items:center;gap:.65rem;padding:.65rem .8rem;border-radius:var(--radius-md);
      color:#fff;text-decoration:none;font-weight:600;font-size:.92rem;transition:background .15s var(--ease-out)}
    .rail-link:hover{background:#5da80d}
    .rail-link.active{background:#fff;color:var(--brand-strong);box-shadow:var(--shadow-brutal-sm)}
    .rail-link svg{flex:none}
    .rail-footer{margin-top:auto;padding-top:1rem;border-top:1px solid #5da80d;display:flex;flex-direction:column;gap:.25rem}

    #main{flex:1;min-width:0;padding:2rem 2.5rem 3rem}
    .topbar{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:1.75rem}
    .topbar h1{font-size:clamp(1.8rem,4vw,2.6rem);font-weight:850}
    .topbar p{margin:.4rem 0 0;color:var(--muted)}

    .panel{background:var(--surface);border:1px solid var(--rule);border-radius:var(--radius-lg);padding:1.5rem}
    .panel-shadow{box-shadow:var(--shadow-brutal)}
    .grid{display:grid;gap:1.25rem}
    @media (min-width:900px){.grid-2{grid-template-columns:1.1fr .9fr}}

    .btn{display:inline-flex;align-items:center;gap:.4rem;border:1px solid var(--rule-strong);border-radius:var(--radius-pill);
      padding:.65rem 1.05rem;background:var(--paper-3);color:var(--ink);transition:background .15s var(--ease-out)}
    .btn:hover{background:var(--brand-soft)}
    .btn-primary{background:var(--brand);border-color:var(--brand);color:#fff;box-shadow:var(--shadow-brutal-sm)}
    .btn-primary:hover{background:var(--brand-strong);border-color:var(--brand-strong)}
    .btn-danger{background:var(--surface);border-color:var(--error);color:var(--error)}
    .btn-danger:hover{background:#dc262633}
    .btn-sm{padding:.45rem .8rem;font-size:.8rem}
    .btn-block{width:100%;justify-content:center}

    label{display:block;font-size:.82rem;font-weight:700;color:var(--ink);margin:1rem 0 .4rem}
    label:first-of-type{margin-top:0}
    input[type=text],input[type=number],input[type=email],input[type=password],input[type=url],textarea,select{
      width:100%;padding:.7rem .8rem;border-radius:var(--radius-sm);border:1px solid var(--rule-strong);
      background:var(--paper-3);color:var(--ink-2);font:500 .95rem 'Open Sans',sans-serif}
    input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible{
      outline:2px solid var(--brand);outline-offset:2px}
    .hint{font-size:.8rem;color:var(--muted);margin-top:.3rem}
    .checkbox-row{display:flex;align-items:center;gap:.5rem;font-size:.85rem;font-weight:600;margin-top:.85rem}
    .checkbox-row input{width:16px;height:16px;accent-color:var(--brand)}

    .stats-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));gap:1rem;margin-top:1rem}
    .stat{border-top:2px solid var(--brand);padding-top:.6rem}
    .stat-label{font-size:.72rem;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.04em}
    .stat-value{font-size:1.6rem;font-weight:800;color:var(--ink);margin-top:.2rem}

    .earnings-value{color:var(--ink);font-family:'Geist Mono',monospace;font-variant-numeric:tabular-nums;
      font-weight:800;font-size:2.1rem;margin:.5rem 0}

    .tab-list{display:flex;gap:.4rem;flex-wrap:wrap}
    .tab-button{border:1px solid var(--rule-strong);border-radius:var(--radius-pill);padding:.4rem .9rem;
      background:var(--paper-3);color:var(--ink);font-size:.82rem;font-weight:700;cursor:pointer}
    .tab-button.active{background:var(--brand);border-color:var(--brand);color:#fff}

    .chart{background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(25% - 1px),
      var(--rule) calc(25% - 1px),var(--rule) 25%);border-block:1px solid var(--rule);display:flex;
      height:13rem;margin-block-start:1.25rem;padding:1rem}
    .chart-bars{align-items:flex-end;display:flex;gap:.4rem;overflow-x:auto;width:100%}
    .chart-bar-group{flex:1 0 1.6rem;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
    .chart-bar-track{display:flex;align-items:flex-end;height:100%;width:100%}
    .chart-bar{width:100%;border-radius:.4rem .4rem 0 0;min-height:2px;background:var(--brand);
      transition:height .18s var(--ease-out)}
    .chart-bar-label{color:var(--muted);font-size:.68rem;margin-top:.3rem;white-space:nowrap}
    .chart-empty{margin:auto;color:var(--muted);font-size:.9rem}

    .badge{display:inline-flex;align-items:center;gap:.3rem;border:1px solid var(--rule-strong);border-radius:var(--radius-pill);
      padding:.15rem .6rem;font-size:.72rem;font-weight:700}
    .badge-live{background:var(--success);border-color:var(--success);color:#fff}

    table{width:100%;border-collapse:collapse;font-size:.88rem;margin-top:1rem}
    th,td{text-align:left;padding:.6rem .5rem;border-bottom:1px solid var(--rule)}
    th{color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;font-weight:700}
    .empty{color:var(--muted);font-size:.88rem;padding:1rem 0}

    /* Widget/goal cards — same layout as before, recolored to the light green/white
       palette (was dark-theme hex literals ported from a different reference). */
    .widget-card{background:var(--paper-2);border:1px solid var(--rule-strong);border-radius:.625rem;padding:1.25rem;
      margin-top:1rem}
    .widget-card:first-of-type{margin-top:1rem}
    .widget-card h3{color:var(--brand-strong);font-size:1.05rem;margin:0 0 .75rem}
    .widget-url-row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:stretch}
    .url-box{flex:1 1 16rem;min-width:0;background:var(--paper-3);border:1px dashed var(--rule-strong);border-radius:.25rem;
      padding:.55rem .65rem;color:var(--ink-2);font-family:'Geist Mono',ui-monospace,monospace;font-size:.82rem;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .widget-btn{background:var(--paper-3);border:1px solid var(--rule-strong);border-radius:.25rem;color:var(--ink-2);
      padding:.55rem .8rem;font-size:.82rem;font-weight:600;cursor:pointer;display:inline-flex;
      align-items:center;gap:.4rem;text-decoration:none}
    .widget-btn:hover{background:var(--brand-soft)}
    .widget-btn.copied{color:var(--success);border-color:var(--success)}

    .progress-track{background:var(--rule);border:1px solid var(--rule-strong);border-radius:var(--radius-pill);
      height:.6rem;overflow:hidden;margin-top:.6rem}
    .progress-fill{background:var(--brand);height:100%;border-radius:var(--radius-pill);transition:width .3s var(--ease-out)}
    .progress-label{display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted);margin-top:.4rem}

    .mobile-bar{display:none}
    @media (max-width:860px){
      #shell{display:block}
      #rail{display:none}
      #main{padding:1.25rem}
      .mobile-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem}
    }
  </style>`;

function icon(name) {
  const paths = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    brush: '<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.34 1.78 2.74 5.66 2.7 6.98 1.37 1.31-1.31 2.4-3.6.9-4.79-.36-.29-.94-1.94-2.88-1.94z"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    "external-link": '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="M16.71 13.88l.7.71-2.82 2.82"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  };
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
}

const NAV = [
  { key: "beranda", label: "Beranda", icon: "home", href: (id) => `/host/${id}` },
  { key: "wishlist", label: "Wishlist", icon: "target", href: (id) => `/host/${id}/wishlist` },
  { key: "pesan", label: "Pesan", icon: "message", href: (id) => `/host/${id}/pesan` },
  { key: "poin", label: "Poin", icon: "coins", href: (id) => `/host/${id}/poin` },
  { key: "aksi", label: "Aksi & Event", icon: "zap", href: (id) => `/host/${id}/aksi` },
  { key: "suara", label: "Efek Suara", icon: "volume", href: (id) => `/host/${id}/suara` },
  { key: "tools", label: "Tools", icon: "wrench", href: (id) => `/host/${id}/tools` },
  { key: "tampilan", label: "Tampilan", icon: "brush", href: (id) => `/host/${id}/tampilan` },
  { key: "pengaturan", label: "Pengaturan", icon: "settings", href: (id) => `/host/${id}/pengaturan` },
];

/** Shared shell for the self-service host dashboard: sidebar + topbar, styled after muter.my.id. */
export function hostLayout(body, { active, identifier, title, avatarUrl }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title || "Patungan")} · Dashboard</title>
    <link rel="icon" type="image/png" href="/overlay/assets/patungan.png">
    ${HOST_STYLE}
    </head><body>
    <div id="shell">
      <nav id="rail">
        <div class="rail-brand">${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="" />` : ""}${escapeHtml(title || "Dashboard")}</div>
        <div class="rail-group-label">Kelola</div>
        ${NAV.map(
          (item) =>
            `<a class="rail-link${item.key === active ? " active" : ""}" href="${item.href(identifier)}">${icon(item.icon)} ${item.label}</a>`
        ).join("")}
        <div class="rail-footer">
          <a class="rail-link" href="/${identifier}" target="_blank" rel="noopener">${icon("external-link")} Lihat halaman</a>
          <form method="post" action="/host/${identifier}/logout">
            <button type="submit" class="rail-link" style="width:100%;text-align:left;background:none;border:none">${icon("log-out")} Keluar</button>
          </form>
        </div>
      </nav>
      <main id="main">
        <div class="mobile-bar">
          <strong>${escapeHtml(title || "Dashboard")}</strong>
          <a class="btn btn-sm" href="/${identifier}" target="_blank" rel="noopener">Lihat halaman</a>
        </div>
        ${body}
      </main>
    </div>
    </body></html>`;
}

export { icon };
