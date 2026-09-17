import { LavalinkManager } from "lavalink-client";
import { env } from "../config/env.js";
import { logError, logInfo, logWarn } from "./logger.js";

let manager;

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
      defaultSearchPlatform: "ytsearch",
      onDisconnect: { autoReconnect: true, destroyPlayer: false },
      onEmptyQueue: { destroyAfterMs: 30_000 },
    },
  });

  manager.nodeManager.on("connect", (node) => logInfo(`Lavalink node "${node.id}" connected.`));
  manager.nodeManager.on("disconnect", (node, reason) => logWarn(`Lavalink node "${node.id}" disconnected:`, reason));
  manager.nodeManager.on("error", (node, err) => logError(`Lavalink node "${node.id}" error:`, err));

  manager.on("trackStart", (player, track) => {
    const channel = client.channels.cache.get(player.textChannelId);
    if (channel?.isTextBased()) {
      const requesterId = typeof track.requester === "object" ? track.requester?.id : track.requester;
      const requestedBy = requesterId ? ` — requested by <@${requesterId}>` : "";
      channel.send(`🎶 Now playing **${track.info.title}**${requestedBy}`).catch(() => {});
    }
  });

  manager.on("queueEnd", (player) => {
    const channel = client.channels.cache.get(player.textChannelId);
    if (channel?.isTextBased()) {
      channel.send("Queue finished — leaving the voice channel.").catch(() => {});
    }
    player.destroy().catch(() => {});
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
