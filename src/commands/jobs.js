import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("jobs")
  .setDescription("Get search links for a job across LinkedIn, Jobstreet, Indeed, and Glassdoor")
  .addStringOption((opt) => opt.setName("keyword").setDescription("Job title or keyword").setRequired(true))
  .addStringOption((opt) => opt.setName("location").setDescription("City/region (default: Indonesia)").setRequired(false));

export async function execute(interaction) {
  const keyword = interaction.options.getString("keyword", true);
  const location = interaction.options.getString("location") || "Indonesia";

  try {
    const q = encodeURIComponent(keyword);
    const loc = encodeURIComponent(location);

    const links = [
      { name: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${loc}` },
      { name: "Jobstreet", url: `https://id.jobstreet.com/jobs?keywords=${q}&where=${loc}` },
      { name: "Indeed", url: `https://id.indeed.com/jobs?q=${q}&l=${loc}` },
      { name: "Glassdoor", url: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${q}&locKeyword=${loc}` },
    ];

    const embed = new EmbedBuilder()
      .setTitle(`🔎 Lowongan: ${keyword} — ${location}`)
      .setDescription(links.map((l) => `[Cari di ${l.name}](${l.url})`).join("\n"))
      .setFooter({ text: "Link ini membuka halaman pencarian resmi — bukan hasil dari scraping." })
      .setColor(0x0a66c2);

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    logError("jobs command failed:", err);
    await interaction.reply({ content: "Couldn't build job search links.", flags: MessageFlags.Ephemeral });
  }
}
