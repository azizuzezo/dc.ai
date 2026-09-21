# Donations (QRIS) — live overlay + Discord alerts

Sociabuzz-style flow: a viewer opens a public link, fills in a name/amount/
message, scans a QRIS to pay via GoPay. Once paid, the bot posts an alert in
a Discord channel and pushes a live animated overlay (name/amount/message,
optional TTS + sound) to a browser source in OBS/TikTok Live Studio, plus an
optional live top-donator leaderboard widget.

Any server's admin can set this up independently — one Discord server maps
to one payment gateway account, alert channel and overlay link.

## 1. Run a payment gateway

This bot doesn't talk to GoPay directly — it calls a self-hosted
[gopay-api-gateaway](../../gopay-api-gateaway) instance (a separate repo/
deployment) for QRIS generation and payment verification. Deploy that
project on its own (see its own README), note its public URL and the
`API_KEY` you set for it.

## 2. Configure it in this bot's admin dashboard

Go to `/guilds` → pick your server → **Donations**, and fill in:
- **Custom link** (optional) — a vanity slug so the donate page is
  `/donate/your-name` instead of `/donate/<guildId>`. Letters/numbers/hyphens,
  3-32 chars, must be unique across all servers using this bot.
- **Page title / description** (optional) — shown at the top of the donate
  page (e.g. "Dukung DuaCincin Live" + a short bio line).
- **Gateway URL** — the gopay-api-gateaway deployment's public URL
- **Gateway API Key** — must match that deployment's `API_KEY`
- **Alert channel ID** — the Discord channel where "💸 Donasi baru!" embeds
  get posted (right-click a channel → Copy Channel ID)
- Minimum donation amount, and toggles for TTS / sound / leaderboard

Saving generates three links shown on that page:
- **Donate link** (`/donate/<guildId>`) — share this in your TikTok/
  Instagram bio for viewers to send support
- **Overlay link** (`/overlay/<token>`) — add as a Browser Source in OBS or
  TikTok Live Studio (transparent background; e.g. 500×300, positioned
  wherever you want the alert to pop up)
- **Leaderboard link** (`/overlay/<token>/leaderboard`) — optional second
  Browser Source (e.g. 300×300) showing top donators, updates live

If the overlay link ever leaks, hit **Regenerate overlay link** to rotate it
— the old link stops working immediately.

## 3. How it works

A background job (`src/services/donationPolling.js`) polls the gateway's
`/check-payment` every ~15s for pending donations. Once a payment confirms:
it's marked paid, a Discord embed is posted to the alert channel, and a
`donation` (plus `leaderboard`, if enabled) event is pushed over
Server-Sent Events to any open overlay page — which animates the alert
in/out, optionally beeps and reads the message via the browser's
Web Speech API.

Nothing here needs `npm run migrate` run automatically — you (or whoever
manages the Supabase project) run it manually after pulling this feature,
same as any other migration in this repo.
