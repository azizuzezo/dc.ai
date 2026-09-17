import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { searchJobs } from "../services/jooble.js";
import { logError } from "../services/logger.js";

export const data = new SlashCommandBuilder()
  .setName("jobs")
  .setDescription("Search real job postings (Jooble)")
  .addStringOption((opt) => opt.setName("keyword").setDescription("Job title or keyword").setRequired(true))
  .addStringOption((opt) => opt.setName("location").setDescription("City/region (default: Indonesia)").setRequired(false));

function searchLinkFallback(keyword, location) {
  const q = encodeURIComponent(keyword);
  const loc = encodeURIComponent(location);
  const links = [
    { name: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${loc}` },
    { name: "Jobstreet", url: `https://id.jobstreet.com/jobs?keywords=${q}&where=${loc}` },
    { name: "Indeed", url: `https://id.indeed.com/jobs?q=${q}&l=${loc}` },
    { name: "Glassdoor", url: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${q}&locKeyword=${loc}` },
  ];
  return [`🔎 **Lowongan: ${keyword} — ${location}**`, "", ...links.map((l) => `${l.name}: ${l.url}`)].join("\n");
}

export async function execute(interaction) {
  const keyword = interaction.options.getString("keyword", true);
  const location = interaction.options.getString("location") || "Indonesia";

  await interaction.deferReply();

  try {
    const jobs = await searchJobs(keyword, location);

    if (!jobs.length) {
      // No Jooble key configured, or nothing found for that query — fall
      // back to plain search-page links instead of an empty reply.
      await interaction.editReply(searchLinkFallback(keyword, location));
      return;
    }

    const lines = jobs.map((job, i) => {
      const company = job.company ? ` — ${job.company}` : "";
      const loc = job.location ? ` (${job.location})` : "";
      return `${i + 1}. **${job.title}**${company}${loc}\n${job.link}`;
    });

    await interaction.editReply(`🔎 **Lowongan: ${keyword} — ${location}**\n\n${lines.join("\n\n")}`);
  } catch (err) {
    logError("jobs command failed:", err);
    await interaction.editReply(searchLinkFallback(keyword, location)).catch(() => {});
  }
}
