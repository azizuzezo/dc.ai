/** Local TikTok gift icon catalog (820 PNGs, extracted from a user-supplied
 * pack into src/admin/assets/gift-icons/), used instead of relying on
 * TikTok's own CDN URL for a gift's icon — that CDN URL can be missing or
 * inconsistent depending on region/gift, while this set is always available.
 *
 * Files are named "<pack-index>_<Gift_Name_With_Underscores>.png" — the
 * numeric prefix is just the pack's own ordering, not TikTok's real gift ID,
 * so lookups are done by normalized gift NAME instead. */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GIFT_ICONS_DIR = join(__dirname, "..", "admin", "assets", "gift-icons");
const PUBLIC_PREFIX = "/overlay/assets/gift-icons";

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** name (normalized) -> { file, label } */
const catalog = new Map();

try {
  for (const file of readdirSync(GIFT_ICONS_DIR)) {
    if (!file.endsWith(".png")) continue;
    const withoutExt = file.slice(0, -4);
    const firstUnderscore = withoutExt.indexOf("_");
    if (firstUnderscore === -1) continue;
    const label = withoutExt.slice(firstUnderscore + 1).replace(/_/g, " ").trim();
    catalog.set(normalizeName(label), { file, label });
  }
} catch {
  // Directory missing (e.g. zip never extracted in this environment) — icon
  // lookups just return null and callers fall back to TikTok's own CDN URL.
}

/** Best-effort lookup by TikTok gift name (e.g. "Rose", "GG", "You're awesome"). */
export function resolveGiftIconUrl(giftName) {
  const entry = catalog.get(normalizeName(giftName));
  return entry ? `${PUBLIC_PREFIX}/${entry.file}` : null;
}

export function resolveGiftIconUrlByKey(key) {
  if (!key) return null;
  for (const entry of catalog.values()) {
    if (entry.file === key) return `${PUBLIC_PREFIX}/${entry.file}`;
  }
  return null;
}

/** For building a <select> in the Actions/Sound Alert config forms — sorted, deduped. */
export function listGiftIcons() {
  return Array.from(catalog.values())
    .map((entry) => ({ key: entry.file, label: entry.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const giftIconCount = catalog.size;
