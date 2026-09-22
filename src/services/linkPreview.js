/** Fetches Open Graph metadata (title/description/banner image) for a URL
 * posted in TikTok LIVE chat, so the "Link Preview" overlay can show a rich
 * card instead of just the raw link. Since the URL comes from an anonymous
 * viewer's chat message, this guards against SSRF (private/loopback/
 * link-local targets), caps how much of the response it reads, and times out
 * quickly rather than trusting arbitrary input from the public internet. */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { logError } from "./logger.js";

const FETCH_TIMEOUT_MS = 4000;
const MAX_BYTES = 262_144; // 256KB is plenty for a <head> section
const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map(); // url -> { data, expiresAt }

function isPrivateAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a === 0
    );
  }
  // IPv6: loopback (::1), unique-local (fc00::/7), link-local (fe80::/10).
  const lower = address.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

function extractUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

function extractMeta(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

async function readBounded(response) {
  const reader = response.body?.getReader?.();
  if (!reader) return await response.text();
  const chunks = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

/** Returns { url, title, description, image } or null if the message has no
 * URL, the URL is disallowed, or fetching/parsing it fails for any reason. */
export async function fetchLinkPreview(text) {
  const url = extractUrl(text);
  if (!url) return null;

  const cached = cache.get(url);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    const { address } = await lookup(parsed.hostname);
    if (isPrivateAddress(address)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let html;
    try {
      const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) return null;
      html = await readBounded(response);
    } finally {
      clearTimeout(timer);
    }

    const title = extractMeta(html, "og:title") || html.match(/<title>([^<]*)<\/title>/i)?.[1] || url;
    const description = extractMeta(html, "og:description") || extractMeta(html, "description");
    const image = extractMeta(html, "og:image");

    const data = { url, title: title.trim().slice(0, 200), description: description?.trim().slice(0, 300) || null, image: image || null };
    cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    logError(`Link preview fetch failed for ${url}:`, err);
    return null;
  }
}
