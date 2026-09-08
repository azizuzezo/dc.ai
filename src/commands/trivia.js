import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import {
  generateTriviaQuestion,
  getActiveTrivia,
  setActiveTrivia,
  clearActiveTrivia,
  OPTION_LABELS,
  TRIVIA_TIMEOUT_MS,
} from "../services/trivia.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder().setName("trivia").setDescription("Start a trivia round");

export async function execute(interaction) {
  if (getActiveTrivia(interaction.channelId)) {
    await interaction.reply({ content: "A trivia round is already running in this channel.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  let question;
  try {
    question = await generateTriviaQuestion();
  } catch (err) {
    logError("trivia generation failed:", err);
    await interaction.editReply("Sorry, I couldn't come up with a trivia question right now.");
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    question.options.map((opt, i) =>
      new ButtonBuilder()
        .setCustomId(`trivia_answer:${i}`)
        .setLabel(`${OPTION_LABELS[i]}. ${opt}`.slice(0, 80))
        .setStyle(ButtonStyle.Primary)
    )
  );

  await interaction.editReply({ content: `🧠 **Trivia!**\n${question.question}`, components: [row] });

  const timeout = setTimeout(async () => {
    const state = getActiveTrivia(interaction.channelId);
    if (!state) return;
    clearActiveTrivia(interaction.channelId);
    try {
      await interaction.editReply({
        content: `⌛ Time's up! The correct answer was **${OPTION_LABELS[state.correctIndex]}. ${state.options[state.correctIndex]}**.`,
        components: [],
      });
    } catch (err) {
      logError("trivia timeout edit failed:", err);
    }
  }, TRIVIA_TIMEOUT_MS);
  timeout.unref?.();

  setActiveTrivia(interaction.channelId, { ...question, timeout });
}
