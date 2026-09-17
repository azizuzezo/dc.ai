import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder().setName("skip").setDescription("Skip the current song");

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);

  if (!player || !player.queue.current) {
    await interaction.reply({ content: "Nothing is playing right now.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    const skipped = player.queue.current;
    await player.skip();
    await interaction.reply(`⏭️ Skipped **${skipped.info.title}**.`);
  } catch (err) {
    logError("skip command failed:", err);
    await interaction.reply({ content: "Couldn't skip that.", flags: MessageFlags.Ephemeral });
  }
}
