import * as db from "../services/db.js";
import { verifyPassword } from "../services/password.js";
import { escapeHtml } from "./htmlEscape.js";

const loginPage = (title, error) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Masuk · ${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{--paper:#f7f9f5;--ink:#122e1e;--ink-2:#1e3a2a;--muted:#5b7267;
      --rule-strong:#c8d6c0;--brand:#76cc11;--brand-strong:#5da80d;--error:#dc2626}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--paper);
      color:var(--ink-2);font-family:'Open Sans',ui-sans-serif,sans-serif;padding:16px}
    .card{width:100%;max-width:360px;background:#fff;border:1px solid var(--rule-strong);border-radius:1.25rem;
      padding:28px;box-shadow:0 10px 24px rgba(18,46,30,.1)}
    h1{margin:0 0 6px;color:var(--ink);font-size:1.4rem}
    p.lede{margin:0 0 18px;color:var(--muted);font-size:.9rem}
    label{display:block;font-size:.82rem;font-weight:700;color:var(--ink);margin:14px 0 6px}
    label:first-of-type{margin-top:0}
    input{width:100%;padding:.7rem .8rem;border-radius:.6rem;border:1.5px solid var(--rule-strong);
      background:var(--paper);color:var(--ink-2);font:500 .95rem 'Open Sans',sans-serif}
    input:focus-visible,button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
    button{width:100%;margin-top:18px;padding:.75rem;border-radius:999px;border:1.5px solid var(--brand);
      background:var(--brand);color:#fff;font:700 .95rem 'Open Sans',sans-serif;cursor:pointer}
    button:hover{background:var(--brand-strong);border-color:var(--brand-strong)}
    .error{background:#fee2e2;border:1.5px solid var(--error);color:var(--error);
      border-radius:.6rem;padding:9px 12px;font-size:13px;margin-bottom:16px}
  </style></head><body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p class="lede">Masuk buat kelola halaman patungan kamu.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
    <form method="post">
      <label for="username">Username</label>
      <input id="username" name="username" required autofocus />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required />
      <button type="submit">Masuk</button>
    </form>
  </div>
  </body></html>`;

const notSetUpPage = (title) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>body{font-family:system-ui,sans-serif;max-width:440px;margin:80px auto;padding:0 16px;color:#012641;text-align:center}</style>
  </head><body>
    <h1>Dashboard belum diaktifkan</h1>
    <p>Minta admin server buat setup username &amp; password dashboard host kamu dulu, lewat dashboard admin → Patungan.</p>
  </body></html>`;

/** Guards every /host/:identifier* route. Each browser session can be logged into several guilds' host dashboards at once. */
export async function requireHostAuth(req, res, next) {
  const settings = await db.getDonationSettingsByIdentifier(req.params.identifier);
  if (!settings) return res.status(404).send("Halaman tidak ditemukan.");
  if (!settings.host_username || !settings.host_password_hash) {
    return res.status(404).send(notSetUpPage(settings.display_name || "Dashboard"));
  }
  if (req.session?.hostAuth?.[settings.guild_id]) {
    req.donationSettings = settings;
    return next();
  }
  res.redirect(`/host/${req.params.identifier}/login`);
}

export async function handleHostLoginPage(req, res, error) {
  const settings = await db.getDonationSettingsByIdentifier(req.params.identifier);
  if (!settings) return res.status(404).send("Halaman tidak ditemukan.");
  if (!settings.host_username || !settings.host_password_hash) {
    return res.status(404).send(notSetUpPage(settings.display_name || "Dashboard"));
  }
  if (req.session?.hostAuth?.[settings.guild_id]) return res.redirect(`/host/${req.params.identifier}`);
  res.send(loginPage(settings.display_name || "Patungan", error));
}

export async function handleHostLogin(req, res) {
  const settings = await db.getDonationSettingsByIdentifier(req.params.identifier);
  if (!settings) return res.status(404).send("Halaman tidak ditemukan.");
  const { username, password } = req.body;
  if (
    settings.host_username &&
    username === settings.host_username &&
    verifyPassword(password || "", settings.host_password_hash)
  ) {
    req.session.hostAuth = req.session.hostAuth || {};
    req.session.hostAuth[settings.guild_id] = true;
    return res.redirect(`/host/${req.params.identifier}`);
  }
  res.status(401).send(loginPage(settings.display_name || "Patungan", "Username atau password salah."));
}

export async function handleHostLogout(req, res) {
  const settings = await db.getDonationSettingsByIdentifier(req.params.identifier);
  if (req.session?.hostAuth && settings) delete req.session.hostAuth[settings.guild_id];
  res.redirect(`/host/${req.params.identifier}/login`);
}
