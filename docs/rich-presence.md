# Rich Presence (dzikir / shalat status)

Shows a custom "Sedang Dzikir" / "Sedang Shalat" activity on your own Discord
profile, like the VSCode extension does. This is **not** the bot — it's a
separate script (`scripts/rich-presence.mjs`) that must run on your own
computer, because Discord Rich Presence only talks to the Discord desktop
app over a local IPC socket. It will not work deployed on Railway, and it
stops as soon as you close the script or Discord.

## One-time setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and create a **new, separate Application** just for this (e.g. name it
   "Ibadah" or whatever you want shown). Don't reuse the bot's application —
   the Rich Presence card's title/icon comes from the Application's own
   name/icon in the portal, so reusing the bot's app makes the card show the
   bot's name instead of yours.
2. Copy that new Application's **Application ID** and put it in your local
   `.env` as `RICH_PRESENCE_CLIENT_ID`.
3. On that same application, go to **Rich Presence → Art Assets** and upload
   an image for each preset, using these exact asset keys:
   - `dzikir`
   - `shalat`
4. Make sure the Discord **desktop app** (not just browser) is open and you're
   logged in as yourself.

## Usage

```bash
npm run rich-presence -- dzikir
npm run rich-presence -- shalat

# or a custom status:
npm run rich-presence -- custom --details "Sedang baca Quran" --state "Jangan diganggu dulu ya" --image dzikir
```

Leave the command running — the presence disappears if you stop it.
Press `Ctrl+C` to clear the activity and exit cleanly.
