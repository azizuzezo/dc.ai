const NAV_ITEMS = [
  { href: "/guilds", label: "Guilds", key: "guilds" },
  { href: "/settings", label: "Global AI Settings", key: "settings" },
  { href: "/scan-operators", label: "Scan Operators", key: "scan-operators" },
];

const GUILD_TABS = [
  { key: "features", label: "Features" },
  { key: "allowlist", label: "Allowlist" },
  { key: "knowledge", label: "Knowledge" },
  { key: "conversations", label: "Conversations" },
  { key: "donations", label: "Patungan" },
];

const STYLE = `<style>
  :root{
    --bg:#0f172a; --surface:#1b2336; --surface-2:#232c42; --border:#2f3b57;
    --text:#f8fafc; --text-muted:#94a3b8; --accent:#22c55e; --accent-hover:#16a34a;
    --accent-ink:#052e16; --danger:#f87171; --danger-hover:#dc2626; --radius:10px;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--text);
    font-family:'Fira Sans',system-ui,sans-serif;font-size:15px;line-height:1.5}
  a{color:var(--accent)}
  code,.mono{font-family:'Fira Code',monospace;font-size:0.9em}

  #shell{display:flex;min-height:100vh}
  #sidebar{width:220px;flex:none;background:var(--surface);border-right:1px solid var(--border);
    padding:20px 16px;display:flex;flex-direction:column;gap:4px}
  #sidebar .brand{font-weight:700;font-size:15px;margin-bottom:16px;color:var(--text)}
  #sidebar .brand .dot{color:var(--accent)}
  #sidebar a.nav-link{display:block;padding:8px 10px;border-radius:8px;color:var(--text-muted);
    text-decoration:none;font-size:14px;transition:background-color 150ms,color 150ms}
  #sidebar a.nav-link:hover{background:var(--surface-2);color:var(--text)}
  #sidebar a.nav-link.active{background:var(--accent);color:var(--accent-ink);font-weight:600}
  #sidebar form{margin-top:auto}

  #main{flex:1;min-width:0;padding:32px 40px}
  .content{max-width:1040px}
  h1{font-size:22px;margin:0 0 4px}
  h2{font-size:17px;margin:28px 0 10px}
  .lede{color:var(--text-muted);font-size:14px;margin:0 0 24px;max-width:640px}
  .crumbs{font-size:13px;color:var(--text-muted);margin-bottom:6px}
  .crumbs a{color:var(--text-muted);text-decoration:none}
  .crumbs a:hover{color:var(--text);text-decoration:underline}

  .tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin:16px 0 24px}
  .tabs a{padding:9px 14px;color:var(--text-muted);text-decoration:none;font-size:14px;
    border-bottom:2px solid transparent;margin-bottom:-1px;transition:color 150ms,border-color 150ms}
  .tabs a:hover{color:var(--text)}
  .tabs a.active{color:var(--text);border-bottom-color:var(--accent);font-weight:600}

  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
  .card + .card{margin-top:16px}

  label{display:block;font-size:13px;font-weight:600;margin:16px 0 6px}
  label:first-child{margin-top:0}
  .hint{font-size:12px;color:var(--text-muted);margin:2px 0 0;font-weight:400}
  input[type=text],input[type=number],input[type=password],input[type=url],textarea,select{
    width:100%;padding:9px 11px;border-radius:8px;border:1px solid var(--border);
    background:var(--bg);color:var(--text);font:inherit;font-size:14px}
  input:focus-visible,textarea:focus-visible,select:focus-visible,
  a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  input[type=file]{width:100%;padding:7px;border-radius:8px;border:1px dashed var(--border);
    background:var(--bg);color:var(--text-muted);font:inherit;font-size:13px}
  input[type=file]::file-selector-button{
    margin-right:10px;border:none;border-radius:999px;padding:8px 16px;
    background:var(--accent);color:var(--accent-ink);font:600 13px 'Fira Sans',sans-serif;cursor:pointer;
    transition:background-color 150ms}
  input[type=file]::file-selector-button:hover{background:var(--accent-hover)}
  textarea{resize:vertical}
  .checkbox-row{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:400;margin:10px 0}
  .checkbox-row input{width:16px;height:16px}

  button,.btn{font:600 14px 'Fira Sans',sans-serif;padding:9px 16px;border-radius:8px;
    border:1px solid var(--border);background:var(--surface-2);color:var(--text);
    cursor:pointer;transition:background-color 150ms,border-color 150ms;text-decoration:none;display:inline-block}
  button:hover,.btn:hover{background:var(--border)}
  .btn-primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
  .btn-primary:hover{background:var(--accent-hover);border-color:var(--accent-hover)}
  .btn-danger{background:transparent;color:var(--danger);border-color:var(--danger)}
  .btn-danger:hover{background:var(--danger);color:#fff}
  .btn-sm{padding:5px 10px;font-size:13px}
  .actions{display:flex;gap:8px;margin-top:18px}

  table{width:100%;border-collapse:collapse;font-size:14px}
  th{text-align:left;color:var(--text-muted);font-weight:600;font-size:12px;
    text-transform:uppercase;letter-spacing:.03em;padding:0 12px 8px;border-bottom:1px solid var(--border)}
  td{padding:11px 12px;border-bottom:1px solid var(--border);vertical-align:top}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:var(--surface-2)}

  .badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600}
  .badge-on{background:rgba(34,197,94,.15);color:var(--accent)}
  .badge-off{background:rgba(148,163,184,.15);color:var(--text-muted)}

  .empty{padding:28px;text-align:center;color:var(--text-muted);font-size:14px;
    border:1px dashed var(--border);border-radius:var(--radius)}

  .error{background:rgba(239,68,68,.12);border:1px solid var(--danger);color:#fca5a5;
    border-radius:8px;padding:10px 14px;font-size:14px;margin-bottom:16px}

  @media (max-width:720px){
    #shell{flex-direction:column}
    #sidebar{width:auto;flex-direction:row;flex-wrap:wrap;border-right:none;border-bottom:1px solid var(--border)}
    #sidebar .brand{width:100%}
    #sidebar form{margin-top:0;margin-left:auto}
    #main{padding:20px}
  }
</style>`;

function navLink(item, active) {
  return `<a class="nav-link${item.key === active ? " active" : ""}" href="${item.href}">${item.label}</a>`;
}

/** Wraps admin page content in the shared shell. `active` highlights the matching sidebar item ("guilds", "settings", "scan-operators", or omitted). */
export function layout(body, { active } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>DC.AI Admin</title>
    <link rel="icon" type="image/png" href="/overlay/assets/patungan.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Fira+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    ${STYLE}
    </head><body>
    <div id="shell">
      <nav id="sidebar">
        <div class="brand">DC<span class="dot">.</span>AI Admin</div>
        ${NAV_ITEMS.map((item) => navLink(item, active)).join("")}
        <form method="post" action="/logout"><button type="submit" class="btn-sm" style="width:100%">Logout</button></form>
      </nav>
      <div id="main"><div class="content">${body}</div></div>
    </div>
    <script src="/overlay/assets/rupiah-format.js"></script>
  </body></html>`;
}

/** Sub-nav tabs shown on every per-guild page. `active` is one of GUILD_TABS' keys. */
export function guildTabs(guildId, active) {
  return `<div class="tabs">${GUILD_TABS.map(
    (t) => `<a class="${t.key === active ? "active" : ""}" href="/guilds/${guildId}/${t.key}">${t.label}</a>`
  ).join("")}</div>`;
}

export function crumbs(guildId, guildName) {
  return `<p class="crumbs"><a href="/guilds">Guilds</a> / ${guildName ? `${guildName} ` : ""}<span class="mono">${guildId}</span></p>`;
}
