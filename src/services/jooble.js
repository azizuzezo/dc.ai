import { env } from "../config/env.js";

/** Searches Jooble for real job postings. Returns [] if no key is configured. */
export async function searchJobs(keywords, location, limit = 5) {
  if (!env.joobleApiKey) return [];

  const res = await fetch(`https://jooble.org/api/${env.joobleApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords, location }),
  });

  if (!res.ok) {
    throw new Error(`Jooble API returned ${res.status}`);
  }

  const data = await res.json();
  return (data.jobs || []).slice(0, limit);
}
