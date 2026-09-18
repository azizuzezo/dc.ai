import { LavalinkManager } from "lavalink-client";
import { env } from "../config/env.js";
import { logError, logInfo, logWarn } from "./logger.js";

let manager;
const autoplayGuilds = new Set();

export function isAutoplayEnabled(guildId) {
  return autoplayGuilds.has(guildId);
}

export function setAutoplay(guildId, enabled) {
  if (enabled) autoplayGuilds.add(guildId);
  else autoplayGuilds.delete(guildId);
}

async function autoPlayFunction(player, lastTrack) {
  if (!autoplayGuilds.has(player.guildId) || !lastTrack) return;
  try {
    const query = `${lastTrack.info.author} ${lastTrack.info.title}`;
    const result = await player.search(query, lastTrack.requester);
    const candidates = (result?.tracks ?? []).filter((t) => t.info.identifier !== lastTrack.info.identifier);
    if (!candidates.length) return;
    const next = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];
    player.queue.add(next);
  } catch (err) {
    logError(`Autoplay search failed in guild ${player.guildId}:`, err);
  }
}

export function initLavalink(client) {
  manager = new LavalinkManager({
    nodes: [
      {
        id: "main",
        host: env.lavalinkHost,
        port: env.lavalinkPort,
        authorization: env.lavalinkPassword,
        secure: env.lavalinkSecure,
      },
    ],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    autoSkip: true,
    client: {
      id: env.discordClientId,
      username: "Music",
    },
    playerOptions: {
      // YouTube's anti-bot checks currently reject most anonymous/OAuth
      // extraction attempts ("This video requires login" / "The page
      // needs to be reloaded") — an active, ecosystem-wide issue, not
      // specific to this setup. SoundCloud doesn't hit that wall, so it's
      // the default for plain text queries. A pasted YouTube URL still
      // works directly; only bare-title search prefers SoundCloud.
      defaultSearchPlatform: "scsearch",
      onDisconnect: { autoReconnect: true, destroyPlayer: false },
      onEmptyQueue: { destroyAfterMs: 30_000, autoPlayFunction },
    },
  });

  manager.nodeManager.on("connect", async (node) => {
    logInfo(`Lavalink node "${node.id}" connected.`);

    // Keeps the Lavalink-side session alive for a bit after a brief WS drop
    // (network blip, proxy reset) so it can resume without losing player
    // state — doesn't help across a full Lavalink process restart, since
    // that wipes the session entirely, but those are the minority case.
    node.updateSession(true, 60_000).catch(() => {});

    // A full process restart, on the other hand, does wipe every player's
    // server-side state while our own queue (kept in this process' memory)
    // survives untouched — so on reconnect, anything that was mid-playback
    // just silently stops. Restart those from the current track instead of
    // leaving the voice channel connected but dead.
    for (const player of manager.players.values()) {
      if (player.node.id !== node.id || player.playing || !player.queue.current) continue;
      try {
        if (!player.connected) await player.connect();
        await player.play({ track: player.queue.current });
        const channel = client.channels.cache.get(player.textChannelId);
        if (channel?.isTextBased()) {
          channel
            .send(`🔁 Music connection recovered — resuming **${player.queue.current.info.title}**.`)
            .catch(() => {});
        }
      } catch (err) {
        logError(`Failed to resume playback in guild ${player.guildId} after reconnect:`, err);
      }
    }
  });
  manager.nodeManager.on("disconnect", (node, reason) => logWarn(`Lavalink node "${node.id}" disconnected:`, reason));
  manager.nodeManager.on("error", (node, err) => logError(`Lavalink node "${node.id}" error:`, err));

  manager.on("trackStuck", (player, track) => {
    logWarn(`Track stuck in guild ${player.guildId}:`, track?.info?.title);
    const channel = client.channels.cache.get(player.textChannelId);
    if (channel?.isTextBased() && track) {
      channel.send(`⚠️ **${track.info.title}** got stuck — skipping.`).catch(() => {});
    }
  });

  manager.on("trackStart", (player, track) => {
    player.deleteData("skipVotes");
    const channel = client.channels.cache.get(player.textChannelId);
    if (channel?.isTextBased()) {
      const requesterId = typeof track.requester === "object" ? track.requester?.id : track.requester;
      const requestedBy = requesterId ? ` — requested by <@${requesterId}>` : "";
      channel.send(`🎶 Now playing **${track.info.title}**${requestedBy}`).catch(() => {});
    }
  });

  manager.on("trackError", (player, track, payload) => {
    logError(`Track error in guild ${player.guildId}:`, payload?.exception ?? payload);
    const channel = client.channels.cache.get(player.textChannelId);
    if (channel?.isTextBased() && track) {
      channel.send(`⚠️ Couldn't play **${track.info.title}** — skipping.`).catch(() => {});
    }
  });

  // onEmptyQueue.destroyAfterMs already schedules the actual destroy() after
  // 30s of silence — don't destroy here too, or the bot leaves instantly
  // instead of giving time to queue another song.
  manager.on("playerQueueEmptyEnd", (player) => {
    const channel = client.channels.cache.get(player.textChannelId);
    if (channel?.isTextBased()) {
      channel.send("Queue finished — leaving the voice channel.").catch(() => {});
    }
  });

  client.on("raw", (d) => manager.sendRawData(d));
  client.once("ready", () => {
    manager.init({ id: client.user.id, username: client.user.username });
  });

  return manager;
}

export function getManager() {
  return manager;
}
