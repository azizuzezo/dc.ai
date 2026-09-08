export function layout(body) {
  return `<!doctype html><html><body style="font-family:sans-serif;max-width:720px;margin:40px auto;">
    <nav>
      <a href="/guilds">Guilds</a> |
      <a href="/settings">Global AI Settings</a> |
      <a href="/scan-operators">Scan Operators</a> |
      <form style="display:inline" method="post" action="/logout"><button>Logout</button></form>
    </nav>
    <hr/>
    ${body}
  </body></html>`;
}
