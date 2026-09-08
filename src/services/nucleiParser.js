const KNOWN_SEVERITIES = ["critical", "high", "medium", "low", "info", "unknown"];

/**
 * Summarizes nuclei's -jsonl output (one JSON object per line, one per
 * finding) into counts by severity. Tolerant of blank lines and lines
 * that aren't valid JSON (nuclei's stdout can interleave stray log text
 * even with -silent) — those are skipped rather than throwing.
 */
export function parseNucleiOutput(rawOutput) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0, total: 0 };
  const findings = [];

  if (!rawOutput) return { counts, findings };

  for (const line of rawOutput.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;

    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const severity = (entry?.info?.severity || "unknown").toLowerCase();
    const bucket = KNOWN_SEVERITIES.includes(severity) ? severity : "unknown";
    counts[bucket] += 1;
    counts.total += 1;
    findings.push({
      templateId: entry?.["template-id"] || "unknown",
      name: entry?.info?.name || "Unnamed finding",
      severity: bucket,
      matchedAt: entry?.["matched-at"] || entry?.host || "",
    });
  }

  return { counts, findings };
}
