import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getManager } from "../services/lavalink.js";
import { logError } from "../services/logger.js";

const LABELS = { off: "Loop disabled.", track: "🔂 Looping the current song.", queue: "🔁 Looping the queue." };

export const data = new SlashCommandBuilder()
  .setName("loop")
  .setDescription("Loop the current song or the whole queue")
  .addStringOption((opt) =>
    opt
      .setName("mode")
      .setDescription("What to loop")
      .setRequired(true)
      .addChoices(
        { name: "Off", value: "off" },
        { name: "Song", value: "track" },
        { name: "Queue", value: "queue" }
      )
  );

export async function execute(interaction) {
  const manager = getManager();
  const player = manager?.getPlayer(interaction.guildId);

  if (!player) {
    await interaction.reply({ content: "I'm not playing anything here.", flags: MessageFlags.Ephemeral });
    return;
  }

  const mode = interaction.options.getString("mode", true);

  try {
    await player.setRepeatMode(mode);
    await interaction.reply(LABELS[mode]);
  } catch (err) {
    logError("loop command failed:", err);
    await interaction.reply({ content: "Couldn't change the loop mode.", flags: MessageFlags.Ephemeral });
  }
}
