import { env } from "../config/env.js";

const page = (body, error) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DC.AI Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0f172a;--surface:#1b2336;--border:#2f3b57;--text:#f8fafc;--text-muted:#94a3b8;
      --accent:#22c55e;--accent-hover:#16a34a;--accent-ink:#052e16;--danger:#f87171}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:var(--bg);color:var(--text);font-family:'Fira Sans',system-ui,sans-serif}
    .card{width:100%;max-width:340px;background:var(--surface);border:1px solid var(--border);
      border-radius:12px;padding:28px;margin:16px}
    .brand{font-weight:700;font-size:16px;margin-bottom:20px}
    .brand .dot{color:var(--accent)}
    label{display:block;font-size:13px;font-weight:600;margin:14px 0 6px}
    label:first-of-type{margin-top:0}
    input{width:100%;padding:10px 11px;border-radius:8px;border:1px solid var(--border);
      background:var(--bg);color:var(--text);font:inherit;font-size:14px}
    input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    button{width:100%;margin-top:18px;padding:10px;border-radius:8px;border:1px solid var(--accent);
      background:var(--accent);color:var(--accent-ink);font:700 14px 'Fira Sans',sans-serif;cursor:pointer}
    button:hover{background:var(--accent-hover);border-color:var(--accent-hover)}
    .error{background:rgba(239,68,68,.12);border:1px solid var(--danger);color:var(--danger);
      border-radius:8px;padding:9px 12px;font-size:13px;margin-bottom:16px}
  </style></head><body>
  <div class="card">
    <div class="brand">DC<span class="dot">.</span>AI Admin</div>
    ${error ? `<p class="error">${error}</p>` : ""}
    ${body}
  </div>
  </body></html>`;

export function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.redirect("/login");
}

export function handleLoginPage(req, res) {
  res.send(
    page(`
      <form method="post" action="/login">
        <label for="username">Username</label>
        <input id="username" name="username" required />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required />
        <button type="submit">Log in</button>
      </form>
    `)
  );
}

export function handleLogin(req, res) {
  const { username, password } = req.body;
  if (env.adminUsername && username === env.adminUsername && password === env.adminPassword) {
    req.session.authenticated = true;
    return res.redirect("/guilds");
  }
  res
    .status(401)
    .send(
      page(
        `<form method="post" action="/login">
          <label for="username">Username</label>
          <input id="username" name="username" required />
          <label for="password">Password</label>
          <input id="password" name="password" type="password" required />
          <button type="submit">Log in</button>
        </form>`,
        "Invalid credentials."
      )
    );
}

export function handleLogout(req, res) {
  req.session.destroy(() => res.redirect("/login"));
}
