// Every overlay widget normally opens its own EventSource straight to
// /overlay/:token/events or /live-events — fine in real OBS use, since each
// Browser Source is its own isolated browser process. But the "Preview Semua
// Widget" page embeds ~15-20 of these in ONE tab, and Chrome caps a tab to 6
// simultaneous connections per origin (HTTP/1.1) — everything past the 6th
// just hangs forever waiting for a socket that never frees up, since SSE
// connections don't close on their own.
//
// When opened with ?relay=1 inside an iframe, this makes widgets listen for
// events relayed via postMessage from the parent preview page (which holds
// just the 2 real connections total) instead of opening their own — see
// hostWidgetHub.js's handleHostPreviewPage for the relay side. Standalone/
// real OBS use (no ?relay=1, or not embedded) is completely unaffected.
function connectOverlayEvents(path) {
  const relay = new URLSearchParams(location.search).get("relay");
  if (relay && window.parent !== window) {
    const channel = path.endsWith("/live-events") ? "live-events" : "events";
    const target = new EventTarget();
    window.addEventListener("message", (e) => {
      if (e.data && e.data.channel === channel) {
        target.dispatchEvent(new MessageEvent(e.data.eventName, { data: e.data.eventData }));
      }
    });
    return target;
  }
  return new EventSource(path);
}
