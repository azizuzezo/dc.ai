// Render helpers shared by every host page that offers overlay widget style
// customization (hostAlertAppearance.js: Chat Bubble/Alert/Leaderboard/
// Likeathon; hostSubathon.js: Waktu; more to follow) — pulled out once a
// third page needed the exact same color/font/template-gallery markup.
import { FONT_STACKS as FONT_OPTIONS, ANIMATION_OPTIONS } from "../services/overlayStyleShared.js";
import { escapeHtml } from "./htmlEscape.js";

export const HEX_RE = /^#[0-9a-f]{6}$/i;

/** "#rrggbb" + 0-100 opacity -> "rgba(r,g,b,a)", for template preview cards
 * and any inline color-with-opacity render. */
export function hexToRgba(hex, opacityPercent) {
  const clean = /^#?[0-9a-f]{6}$/i.test(hex) ? hex.replace("#", "") : "ffffff";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const a = Math.min(100, Math.max(0, Number(opacityPercent) || 0)) / 100;
  return `rgba(${r},${g},${b},${a})`;
}

/** Lightens (positive percent) or darkens (negative) a "#rrggbb" color —
 * mirrors donatePublic.js's own copy so preview gradients match the real
 * widget. */
export function shadeHex(hex, percent, fallback = "1d4ed8") {
  const clean = /^#?[0-9a-f]{6}$/i.test(hex) ? hex.replace("#", "") : fallback;
  const num = parseInt(clean, 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function fontSelect(id, name, current) {
  return `<select id="${id}" name="${name}">
    ${Object.keys(FONT_OPTIONS).map((f) => `<option value="${escapeHtml(f)}" ${f === current ? "selected" : ""}>${escapeHtml(f)}</option>`).join("")}
  </select>`;
}

export function animationSelect(id, name, current) {
  return `<select id="${id}" name="${name}">
    ${Object.entries(ANIMATION_OPTIONS).map(([k, label]) => `<option value="${k}" ${k === current ? "selected" : ""}>${label}</option>`).join("")}
  </select>`;
}

/** Every template is its own tiny <form> posting straight to the real update
 * route with hidden inputs for each field — picking one just IS a normal save,
 * no separate "apply template" code path to keep in sync with manual edits. */
export function templateGallery(templates, action, previewFn) {
  return `<div class="tpl-gallery">
    ${templates
      .map(
        (t) => `<form method="post" action="${action}" class="tpl-card">
          ${Object.entries(t.style)
            .map(([field, value]) =>
              typeof value === "boolean"
                ? value
                  ? `<input type="hidden" name="${field}" value="on" />`
                  : ""
                : `<input type="hidden" name="${field}" value="${escapeHtml(String(value))}" />`
            )
            .join("")}
          ${previewFn(t.style)}
          <button type="submit" class="btn btn-sm tpl-apply">Pakai "${escapeHtml(t.label)}"</button>
        </form>`
      )
      .join("")}
  </div>
  <style>
    .tpl-gallery{display:flex;flex-wrap:wrap;gap:.9rem;margin:.6rem 0 1.25rem}
    .tpl-card{width:190px;padding:.7rem;border-radius:12px;background:rgba(255,255,255,.03);
      border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:.6rem;align-items:stretch}
    .tpl-preview{border-radius:10px;padding:.6rem;min-height:60px;display:flex;align-items:center;justify-content:center;
      flex-direction:column;gap:.3rem;text-align:center;overflow:hidden;background:#1a1a1a}
    .tpl-preview-bubble{flex-direction:row;justify-content:flex-start;text-align:left;padding:.5rem .7rem}
    .tpl-banner-box{font-weight:900;color:#fff;padding:4px 14px;border-radius:8px;border:2px solid rgba(255,255,255,.85);font-size:.85rem}
    .tpl-hl{padding:1px 7px;border-radius:4px;font-size:.72rem;font-weight:700;color:#fff}
    .tpl-avatar-badge{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px}
    .tpl-alert-name{font-size:.72rem;font-weight:700;color:#fff}
    .tpl-apply{width:100%}
  </style>`;
}
