import { SlashCommandBuilder } from "discord.js";
import { resolveAiConfig, chatCompletion } from "../services/geminiClient.js";
import { replyChunked } from "../services/discordReply.js";
import { logError } from "../services/logger.js";

const DEFAULT_MESSAGE_COUNT = 50;
const MAX_MESSAGE_COUNT = 100;

export const data = new SlashCommandBuilder()
  .setName("summary")
  .setDescription("Summarize recent channel activity")
  .addIntegerOption((opt) =>
    opt
      .setName("count")
      .setDescription(`How many recent messages to summarize (default ${DEFAULT_MESSAGE_COUNT}, max ${MAX_MESSAGE_COUNT})`)
      .setRequired(false)
  );

export async function execute(interaction) {
  const count = Math.min(interaction.options.getInteger("count") ?? DEFAULT_MESSAGE_COUNT, MAX_MESSAGE_COUNT);

  await interaction.deferReply();

  try {
    const fetched = await interaction.channel.messages.fetch({ limit: count });
    const transcript = [...fetched.values()]
      .filter((m) => !m.author.bot && m.content.trim())
      .reverse()
      .map((m) => `${m.author.username}: ${m.content}`)
      .join("\n");

    if (!transcript) {
      await interaction.editReply("Not enough recent messages to summarize.");
      return;
    }

    const { model, baseUrl, apiKey } = await resolveAiConfig();
    const reply = await chatCompletion({
      baseUrl,
      apiKey,
      model,
      messages: [
        {
          role: "system",
          content: "Summarize the following Discord conversation concisely, in a few bullet points.",
        },
        { role: "user", content: transcript },
      ],
    });

    await replyChunked(interaction, reply);
  } catch (err) {
    logError("summary command failed:", err);
    await interaction.editReply("Sorry, I couldn't summarize this channel right now.");
  }
}
