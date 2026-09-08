import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import * as db from "../services/db.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("note")
  .setDescription("Shared guild notes")
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a note")
      .addStringOption((opt) => opt.setName("content").setDescription("Note content").setRequired(true))
  )
  .addSubcommand((sub) => sub.setName("list").setDescription("List notes"))
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Delete a note")
      .addIntegerOption((opt) => opt.setName("id").setDescription("Note ID (see /note list)").setRequired(true))
  );

async function handleAdd(interaction) {
  const content = interaction.options.getString("content", true);
  try {
    const id = await db.addNote(interaction.guildId, interaction.user.id, content);
    await interaction.reply(`📝 Note #${id} added.`);
  } catch (err) {
    logError("note add failed:", err);
    await interaction.reply({ content: "Something went wrong adding that note.", ephemeral: true });
  }
}

async function handleList(interaction) {
  try {
    const notes = await db.listNotes(interaction.guildId);
    if (notes.length === 0) {
      await interaction.reply({ content: "No notes yet.", ephemeral: true });
      return;
    }
    const lines = notes
      .slice(0, 15)
      .map((n) => `#${n.id} — ${n.content} (<@${n.author_id}>)`)
      .join("\n");
    await interaction.reply({ content: lines, ephemeral: true });
  } catch (err) {
    logError("note list failed:", err);
    await interaction.reply({ content: "Something went wrong fetching notes.", ephemeral: true });
  }
}

async function handleDelete(interaction) {
  const id = interaction.options.getInteger("id", true);
  try {
    const note = await db.getNote(interaction.guildId, id);
    if (!note) {
      await interaction.reply({ content: `No note #${id} found.`, ephemeral: true });
      return;
    }
    const isAuthor = note.author_id === interaction.user.id;
    const isModerator = interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers);
    if (!isAuthor && !isModerator) {
      await interaction.reply({
        content: "You can only delete your own notes (or be a moderator).",
        ephemeral: true,
      });
      return;
    }
    await db.deleteNote(interaction.guildId, id);
    await interaction.reply(`🗑️ Note #${id} deleted.`);
  } catch (err) {
    logError("note delete failed:", err);
    await interaction.reply({ content: "Something went wrong deleting that note.", ephemeral: true });
  }
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "add") return handleAdd(interaction);
  if (sub === "list") return handleList(interaction);
  if (sub === "delete") return handleDelete(interaction);
}
