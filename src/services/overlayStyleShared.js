// Shared between donatePublic.js (renders the actual overlay widgets) and
// hostAlertAppearance.js (renders the host's customization forms) — was
// duplicated per-file (Chat Bubble + Alert each kept their own copy), which
// is exactly the kind of drift risk that bit this codebase before. Centralized
// here so every widget that gets a style system (Chat Bubble, Alert,
// Leaderboard, ...) draws from the same curated font/animation set.

/** CSS font-stack per curated font name, for the public overlay pages. */
export const FONT_STACKS = {
  "Open Sans": "'Open Sans',sans-serif",
  Inter: "'Inter',sans-serif",
  Poppins: "'Poppins',sans-serif",
  Montserrat: "'Montserrat',sans-serif",
  "Bebas Neue": "'Bebas Neue',sans-serif",
  "Comic Neue": "'Comic Neue',cursive",
};

export const GOOGLE_FONT_QUERY =
  "Open+Sans:wght@400;600;700;800&family=Inter:wght@500;600;700;800&family=Poppins:wght@400;600;700;800&family=Montserrat:wght@400;600;700;800&family=Bebas+Neue&family=Comic+Neue:wght@400;700";

export const ANIMATION_OPTIONS = {
  "slide-up": "Geser dari bawah",
  "slide-down": "Geser dari atas",
  "slide-left": "Geser dari kanan",
  "slide-right": "Geser dari kiri",
  fade: "Muncul halus (fade)",
  pop: "Muncul membesar (pop)",
};

/** Entrance transform for each shared animation choice. `base`/`hide` shift
 * is 0.6x the `show` distance in the opposite direction. */
export function entranceKeyframes(animation, distance = 20) {
  const d = distance;
  switch (animation) {
    case "slide-down":
      return { base: `translateY(-${d}px)`, show: "translateY(0)", hide: `translateY(${Math.round(d * 0.6)}px)` };
    case "slide-left":
      return { base: `translateX(${d}px)`, show: "translateX(0)", hide: `translateX(-${Math.round(d * 0.6)}px)` };
    case "slide-right":
      return { base: `translateX(-${d}px)`, show: "translateX(0)", hide: `translateX(${Math.round(d * 0.6)}px)` };
    case "fade":
      return { base: "translateY(0)", show: "translateY(0)", hide: "translateY(0)" };
    case "pop":
      return { base: "scale(.5)", show: "scale(1)", hide: "scale(.92)" };
    case "slide-up":
    default:
      return { base: `translateY(${d}px)`, show: "translateY(0)", hide: `translateY(-${Math.round(d * 0.6)}px)` };
  }
}

/** Same shape as entranceKeyframes(), but every transform keeps the `-50%`
 * X-anchor a `left:50%`-centered stage relies on (used by the Alert widget). */
export function centeredEntranceKeyframes(animation, distance = 16) {
  const d = distance;
  const settle = Math.round(d * 0.6);
  switch (animation) {
    case "slide-down":
      return { base: `translate(-50%,-${d}px)`, show: "translate(-50%,0)", hide: `translate(-50%,${settle}px)` };
    case "slide-left":
      return { base: `translate(calc(-50% + ${d}px),0)`, show: "translate(-50%,0)", hide: `translate(calc(-50% - ${settle}px),0)` };
    case "slide-right":
      return { base: `translate(calc(-50% - ${d}px),0)`, show: "translate(-50%,0)", hide: `translate(calc(-50% + ${settle}px),0)` };
    case "fade":
      return { base: "translate(-50%,0)", show: "translate(-50%,0)", hide: "translate(-50%,0)" };
    case "pop":
      return { base: "translate(-50%,0) scale(.5)", show: "translate(-50%,0) scale(1)", hide: "translate(-50%,0) scale(.92)" };
    case "slide-up":
    default:
      return { base: `translate(-50%,${d}px)`, show: "translate(-50%,0)", hide: `translate(-50%,-${settle}px)` };
  }
}
