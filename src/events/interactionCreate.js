import { MessageFlags } from "discord.js";
import * as db from "../services/db.js";
import { logError } from "../services/logger.js";
import { handleTriviaAnswer } from "../services/trivia.js";

export async function execute(interaction) {
  if (interaction.isButton() && interaction.customId.startsWith("trivia_answer:")) {
    try {
      await handleTriviaAnswer(interaction);
    } catch (err) {
      logError("trivia button handling failed:", err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) {
    logError(`Unknown command: ${interaction.commandName}`);
    return;
  }

  if (interaction.guildId) {
    try {
      const disabled = await db.getDisabledCommands(interaction.guildId);
      if (disabled.includes(interaction.commandName)) {
        await interaction.reply({ content: "This command is disabled in this server.", flags: MessageFlags.Ephemeral });
        return;
      }
    } catch (err) {
      logError("Failed to check disabled commands:", err);
    }
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logError(`Error executing command ${interaction.commandName}:`, err);
    const payload = { content: "Something went wrong running that command.", flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}
