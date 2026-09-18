import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import * as db from "../services/db.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("knowledge")
  .setDescription("Manage this server's AI knowledge base")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a knowledge entry")
      .addStringOption((opt) => opt.setName("title").setDescription("Entry title").setRequired(true))
      .addStringOption((opt) => opt.setName("content").setDescription("Entry content").setRequired(true))
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("List knowledge entries"))
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Delete a knowledge entry")
      .addIntegerOption((opt) => opt.setName("id").setDescription("Entry ID (see /knowledge list)").setRequired(true))
  );

async function handleAdd(interaction) {
  const title = interaction.options.getString("title", true);
  const content = interaction.options.getString("content", true);
  try {
    const id = await db.addKnowledge(interaction.guildId, title, content);
    await interaction.reply({ content: `📚 Knowledge entry #${id} added: **${title}**`, flags: MessageFlags.Ephemeral });
  } catch (err) {
    logError("knowledge add failed:", err);
    await interaction.reply({ content: "Something went wrong adding that entry.", flags: MessageFlags.Ephemeral });
  }
}

async function handleList(interaction) {
  try {
    const entries = await db.listKnowledge(interaction.guildId);
    if (entries.length === 0) {
      await interaction.reply({ content: "No knowledge entries yet.", flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = entries.slice(0, 15).map((e) => `#${e.id} — **${e.title}**`).join("\n");
    await interaction.reply({ content: lines, flags: MessageFlags.Ephemeral });
  } catch (err) {
    logError("knowledge list failed:", err);
    await interaction.reply({ content: "Something went wrong fetching entries.", flags: MessageFlags.Ephemeral });
  }
}

async function handleDelete(interaction) {
  const id = interaction.options.getInteger("id", true);
  try {
    const entries = await db.listKnowledge(interaction.guildId);
    if (!entries.some((e) => e.id === id)) {
      await interaction.reply({ content: `No knowledge entry #${id} found.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await db.deleteKnowledge(interaction.guildId, id);
    await interaction.reply({ content: `🗑️ Knowledge entry #${id} deleted.`, flags: MessageFlags.Ephemeral });
  } catch (err) {
    logError("knowledge delete failed:", err);
    await interaction.reply({ content: "Something went wrong deleting that entry.", flags: MessageFlags.Ephemeral });
  }
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "add") return handleAdd(interaction);
  if (sub === "list") return handleList(interaction);
  if (sub === "delete") return handleDelete(interaction);
}
