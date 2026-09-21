/** In-process SSE hub so the payment poller can push "donation"/"leaderboard" events straight to open overlay pages (OBS/TikTok Live Studio browser sources). */

const subscribers = new Map(); // overlayToken -> Set<res>

export function subscribe(token, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(":ok\n\n");

  if (!subscribers.has(token)) subscribers.set(token, new Set());
  subscribers.get(token).add(res);

  const heartbeat = setInterval(() => res.write(":hb\n\n"), 25_000);
  res.on("close", () => {
    clearInterval(heartbeat);
    subscribers.get(token)?.delete(res);
  });
}

export function broadcast(token, event, data) {
  const clients = subscribers.get(token);
  if (!clients?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}
