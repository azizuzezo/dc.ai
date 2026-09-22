# TikFinity (tikfinity.zerody.one) — extracted design tokens

Source: exact values parsed from the site's own compiled CSS (`/css/app.css`, a
Tailwind v4 `@theme` build) and `/css/main.min.css` (the logged-in `/app`
dashboard shell), fetched 2026-09-22. No browser automation (Playwright) was
available in this environment — Chrome isn't installed and the sudo install
prompt is non-interactive — so this is sourced from the real CSS/HTML/JS
files via `curl`, not from screenshots or eyeballing. Values below are exact
(copy-pasted from source), not estimated.

## Colors

```
--color-primary:        #d43555   /* brand crimson — buttons, active states, links */
--color-primary-dark:   #86152c
--color-primary-alpha-30: #d435554d
--color-primary-alpha-40: #d4355566
--color-accent:         #d43555   /* same as primary in this build */
--color-accent-gold:    #ecc062
--color-gold:           #f6c669
--color-accent-yellow:  #ffbd00
--color-accent-yellow-alpha-20: #ffbd0033
--color-enabled:        #19cb54   /* live/on/success indicator */
--color-error:          #fc4141
--color-bg-dark:        #1d1c1c   /* page background */
--color-main:           #212121   /* same as bg-gray-darker, base surface */
--color-bg-gray:        #2a2a2a   /* card/panel surface */
--color-bg-gray-alt:    #2b2a2a
--color-bg-gray-medium: #3c3c3c
--color-bg-gray-darker: #212121
--color-secondary:      #2a2a2a
--color-tertiary:       #4d4d4d
--color-quaternary:     #373737
--color-border-gray:    #4e4e4e
--color-border-gray-alt:#4d4d4d
--color-border-dark-red:#92223e
--color-text-blue:      #4397b0
--color-gradient-green-start: #78a861
--color-gradient-green-end:   #407334
--color-progress-gray:  #454545
--color-progress-green: #6ba262
--color-white:          #fff
--color-white-alpha-10: #ffffff1a
--color-black:          #000
```

Read as: a **dark-mode dashboard** — near-black page background (`#1d1c1c`),
charcoal card surfaces (`#2a2a2a`/`#212121`), crimson brand accent (`#d43555`)
for primary actions/active nav, warm gold (`#f6c669`/`#ecc062`) and yellow
(`#ffbd00`) as secondary accents (pro/upgrade badges), green (`#19cb54`) for
live/enabled state, red (`#fc4141`) for errors.

## Typography

```
--font-outfit: "Outfit", sans-serif;      /* primary UI/display font, loaded via Google Fonts wght 100..900 */
--font-sans:   -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", ...  /* Tailwind default fallback stack, not actually the brand font */
--font-mono:   ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, ...
--font-weight-normal: 400
--font-weight-medium: 500
--font-weight-semibold: 600
--font-weight-bold: 700
--font-weight-extrabold: 800
```

"Exo 2" (wght 400/500/700) is also loaded via Google Fonts and appears in the
CSS/markup, used for a subset of display/hero text — Outfit is the dominant
UI font throughout the dashboard and marketing chrome.

## Radius

```
--radius-sm:  0.25rem  (4px)
--radius-md:  0.375rem (6px)
--radius-lg:  0.5rem   (8px)
--radius-xl:  0.75rem  (12px)
--radius-2xl: 1.125rem (18px)
```

## Shadows

Standard Tailwind v4 default shadow scale (`.shadow`, `.shadow-md`,
`.shadow-lg`, `.shadow-xl`, `.shadow-2xl`) — nothing custom overridden.

## Spacing

Tailwind default 4px base unit (`--spacing: .25rem`) — standard Tailwind
spacing scale, nothing custom.

## Fonts loaded (verbatim `<link>` tags)

```html
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;700&display=swap" rel="stylesheet">
```

## Site map (for future page-by-page cloning)

Homepage (`/`) links to (marketing pages, Tailwind-styled):
`/app`, `/chatbot-troubleshooting`, `/get-tiktok-username`,
`/streamerbot-integration`, `/studiofix`, `/third-party-api`,
`/tiktok/actionsandevents`, `/tiktok/chatbot`, `/tiktok/dapi`,
`/tiktok/goals`, `/tiktok/obsoverlays`, `/tiktok/songrequests`,
`/tiktok/sounds`, `/tiktok/tts`, `/legal/privacy`, `/legal/tos`.
`/app` itself is the logged-in dashboard (uses `main.min.css`, gated by
auth — not fetchable as static HTML).

## What this pass covered vs. left open

Applied so far: these tokens ported into `src/admin/hostLayout.js`'s
`HOST_STYLE` block (the self-service host dashboard), replacing its prior
muter.my.id-derived navy/pink neo-brutalist palette with TikFinity's real
dark/crimson/gold tokens above, same structural CSS otherwise.

Not done in this pass (flagged as follow-up, given no browser MCP for
scroll/hover/click-state capture and the size of a 17-page marketing site):
per-page marketing clones of the pages listed above, and any reskin of the
donor-facing checkout page (`src/admin/donatePublic.js`, currently a
green "Saweria-style" theme unrelated to TikFinity — left alone since money/
donation UI conventionally reads as green and wasn't confirmed for reskin).
