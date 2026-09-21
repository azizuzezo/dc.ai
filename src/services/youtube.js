/** Extracts an 11-char YouTube video ID from watch/share/shorts/embed URL formats. Returns null if unparseable. */
export function extractYouTubeId(input) {
  if (!input) return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  let id = null;

  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (url.pathname.startsWith("/embed/")) id = url.pathname.split("/")[2];
    else if (url.pathname.startsWith("/shorts/")) id = url.pathname.split("/")[2];
    else if (url.pathname.startsWith("/live/")) id = url.pathname.split("/")[2];
  }

  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
