import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("Create a poll")
  .addStringOption((opt) => opt.setName("question").setDescription("Poll question").setRequired(true))
  .addStringOption((opt) =>
    opt.setName("options").setDescription("Comma-separated options (2-10)").setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt.setName("duration_hours").setDescription("How long the poll runs, 1-32 hours (default 24)").setRequired(false)
  )
  .addBooleanOption((opt) =>
    opt.setName("multiselect").setDescription("Allow selecting multiple answers").setRequired(false)
  );

/** Pure helper, exported for testing. */
export function parsePollOptions(raw) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export async function execute(interaction) {
  const question = interaction.options.getString("question", true);
  const optionsRaw = interaction.options.getString("options", true);
  const durationHours = interaction.options.getInteger("duration_hours") ?? 24;
  const allowMultiselect = interaction.options.getBoolean("multiselect") ?? false;

  const answers = parsePollOptions(optionsRaw);
  if (answers.length < 2) {
    await interaction.reply({ content: "Provide at least 2 comma-separated options.", flags: MessageFlags.Ephemeral });
    return;
  }

  const clampedDuration = Math.min(Math.max(durationHours, 1), 32);

  try {
    await interaction.reply({
      poll: {
        question: { text: question },
        answers: answers.map((text) => ({ text })),
        duration: clampedDuration,
        allowMultiselect,
      },
    });
  } catch (err) {
    logError("poll command failed:", err);
    await interaction.reply({ content: "Something went wrong creating that poll.", flags: MessageFlags.Ephemeral });
  }
}
