/**
 * Summarizes a SARIF findings document into counts by severity level.
 * Returns null (not throws) for anything malformed, so callers always
 * have a safe "report unavailable" fallback instead of a crash.
 */
export function parseSarifSummary(sarifJson) {
  if (!sarifJson || !Array.isArray(sarifJson.runs)) return null;

  const counts = { error: 0, warning: 0, note: 0, total: 0 };
  for (const run of sarifJson.runs) {
    const results = Array.isArray(run?.results) ? run.results : [];
    for (const result of results) {
      const level = result?.level;
      // Strix also emits level:"none"/kind:"pass" entries as coverage
      // markers ("this area was checked, nothing found") — those aren't
      // vulnerabilities, so they're excluded from every count including
      // total, or a clean scan would misleadingly show "N total findings".
      if (level === "error" || level === "warning" || level === "note") {
        counts[level] += 1;
        counts.total += 1;
      }
    }
  }
  return counts;
}
