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

/** Parses "mm:ss", "h:mm:ss", or a plain number of seconds into an integer. Returns null if empty/unparseable/negative. */
export function parseTimeToSeconds(input) {
  if (input == null) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3 || !parts.every((p) => /^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const seconds = nums.length === 3 ? nums[0] * 3600 + nums[1] * 60 + nums[2] : nums[0] * 60 + nums[1];
  return seconds >= 0 ? seconds : null;
}
