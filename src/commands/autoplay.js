import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager, isAutoplayEnabled, setAutoplay } from "../services/lavalink.js";

export const data = new SlashCommandBuilder()
  .setName("autoplay")
  .setDescription("Toggle autoplay — keep queuing similar songs once the queue runs out");

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);

  if (!player) {
    await interaction.reply({ content: "Nothing is playing right now.", flags: MessageFlags.Ephemeral });
    return;
  }

  const next = !isAutoplayEnabled(interaction.guildId);
  setAutoplay(interaction.guildId, next);
  await interaction.reply(next ? "🔁 Autoplay is now **on** — I'll keep the music going." : "⏹️ Autoplay is now **off**.");
}
