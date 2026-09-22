/** Holds a reference to the logged-in discord.js Client so the admin/host
 * dashboard's Express routes (which run in the same process as the bot, but
 * aren't handed the client directly — see src/index.js) can post real
 * messages to Discord (donation alerts to alert_channel_id). Same pattern as
 * services/lavalink.js's getManager(). */

let client = null;

export function setDiscordClient(c) {
  client = c;
}

export function getDiscordClient() {
  return client;
}
