// Shared between donatePublic.js (renders the widget) and hostAlertAppearance.js
// (renders the picker) so the two never drift apart — a preset the host can
// pick that the public page doesn't know how to draw (or vice versa) would be
// a real bug, not just cosmetic duplication.

/** Alternatives to "your own face photo" for the Alert widget's circle —
 * a themed gradient + emoji badge instead, picked once by the host. */
export const AVATAR_PRESETS = {
  photo: { label: "Foto profil kamu", emoji: null, gradient: null },
  party: { label: "Pesta 🎉", emoji: "🎉", gradient: "radial-gradient(circle at 35% 30%,#fde047,#f97316)" },
  fire: { label: "Api 🔥", emoji: "🔥", gradient: "radial-gradient(circle at 35% 30%,#fb923c,#dc2626)" },
  diamond: { label: "Berlian 💎", emoji: "💎", gradient: "radial-gradient(circle at 35% 30%,#67e8f9,#0891b2)" },
  star: { label: "Bintang ⭐", emoji: "⭐", gradient: "radial-gradient(circle at 35% 30%,#fde68a,#eab308)" },
  gift: { label: "Hadiah 🎁", emoji: "🎁", gradient: "radial-gradient(circle at 35% 30%,#f9a8d4,#db2777)" },
  crown: { label: "Mahkota 👑", emoji: "👑", gradient: "radial-gradient(circle at 35% 30%,#fef08a,#ca8a04)" },
  rocket: { label: "Roket 🚀", emoji: "🚀", gradient: "radial-gradient(circle at 35% 30%,#93c5fd,#1d4ed8)" },
  heart: { label: "Hati 💚", emoji: "💚", gradient: "radial-gradient(circle at 35% 30%,#86efac,#16a34a)" },
};

/** Alert widget layouts: "classic" is the existing circle-avatar + text card;
 * "banner" mirrors a bold color-block headline with marker-highlighted text,
 * requested to match a reference (rvtikstream-style) alert design. */
export const ALERT_LAYOUTS = {
  classic: "Klasik (lingkaran foto)",
  banner: "Banner (kotak judul + highlight)",
};
