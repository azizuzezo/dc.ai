import { DISCORD_MESSAGE_LIMIT } from "../config/constants.js";

/** Splits text into chunks under Discord's message length limit, preferring clean breaks. */
export function chunkText(text, limit = DISCORD_MESSAGE_LIMIT) {
  if (text.length <= limit) return [text];

  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = remaining.lastIndexOf(" ", limit);
    if (cut < limit * 0.5) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/** For slash commands: first chunk edits the deferred reply, rest are follow-ups. */
export async function replyChunked(interaction, text) {
  const chunks = chunkText(text);
  await interaction.editReply(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    await interaction.followUp(chunks[i]);
  }
}

/** For mention-trigger messages: first chunk replies, rest are sent to the channel. */
export async function sendChunkedReply(message, text) {
  const chunks = chunkText(text);
  await message.reply(chunks[0]);
  for (let i = 1; i < chunks.length; i++) {
    await message.channel.send(chunks[i]);
  }
}
