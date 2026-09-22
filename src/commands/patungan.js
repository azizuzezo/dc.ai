import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import * as db from "../services/db.js";
import { env } from "../config/env.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("patungan")
  .setDescription("Get this server's patungan (support/donation) link");

// 1 row for the main "Patungan Dukung" button + up to 4 rows of 5 wishlist shortcuts (Discord's 5-row cap).
const MAX_WISHLIST_BUTTONS = 20;

function wishlistProgressText(item) {
  const pct = Math.min(100, Math.round((item.total / item.target_amount) * 100));
  return { pct, text: `Rp${item.total.toLocaleString("id-ID")} / Rp${Number(item.target_amount).toLocaleString("id-ID")} (${pct}%)` };
}

export async function execute(interaction) {
  try {
    const settings = await db.getDonationSettings(interaction.guildId);
    if (!settings?.gateway_url) {
      await interaction.reply({
        content:
          "Patungan belum diaktifkan di server ini. Admin bisa setup lewat dashboard admin → pilih server → Patungan.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!env.publicBaseUrl) {
      await interaction.reply({
        content: "Cek halaman Patungan di dashboard admin untuk link lengkapnya.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const patunganUrl = `${env.publicBaseUrl}/${interaction.guildId}`;
    const wishlistItems = (await db.listWishlistItemsWithProgress(interaction.guildId)).slice(0, MAX_WISHLIST_BUTTONS);

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle("💛 Patungan buat server ini")
      .setDescription(
        wishlistItems.length
          ? "Klik **Patungan Dukung** buat donasi langsung, atau pilih salah satu milestone wishlist di bawah buat patungan bareng sampai targetnya tercapai."
          : "Klik tombol di bawah buat patungan ke server ini."
      );

    if (wishlistItems.length) {
      embed.addFields(
        wishlistItems.map((item) => ({ name: `🎯 ${item.title}`, value: wishlistProgressText(item).text }))
      );
    }

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("🤝 Patungan Dukung").setStyle(ButtonStyle.Link).setURL(patunganUrl)
      ),
    ];
    for (let i = 0; i < wishlistItems.length; i += 5) {
      rows.push(
        new ActionRowBuilder().addComponents(
          wishlistItems.slice(i, i + 5).map((item) =>
            new ButtonBuilder()
              .setLabel(`🎯 ${item.title} (${wishlistProgressText(item).pct}%)`.slice(0, 80))
              .setStyle(ButtonStyle.Link)
              .setURL(`${patunganUrl}?wishlist=${item.id}`)
          )
        )
      );
    }

    await interaction.reply({ embeds: [embed], components: rows });
  } catch (err) {
    logError("patungan command failed:", err);
    await interaction.reply({ content: "Couldn't fetch the patungan link.", flags: MessageFlags.Ephemeral });
  }
}
