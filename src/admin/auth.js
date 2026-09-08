import { env } from "../config/env.js";

const page = (body) =>
  `<!doctype html><html><body style="font-family:sans-serif;max-width:480px;margin:40px auto;">${body}</body></html>`;

export function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.redirect("/login");
}

export function handleLoginPage(req, res) {
  res.send(
    page(`
      <h2>Admin Login</h2>
      <form method="post" action="/login">
        <input name="username" placeholder="Username" required /><br/>
        <input name="password" type="password" placeholder="Password" required /><br/>
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
  res.status(401).send(page(`<p>Invalid credentials.</p><a href="/login">Back</a>`));
}

export function handleLogout(req, res) {
  req.session.destroy(() => res.redirect("/login"));
}
