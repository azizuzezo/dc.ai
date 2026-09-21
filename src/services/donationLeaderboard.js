/** Groups paid donations by donor name and sums amounts, highest first. */
export function aggregateLeaderboard(donations, limit = 10) {
  const totals = new Map();
  for (const { donor_name, amount } of donations) {
    totals.set(donor_name, (totals.get(donor_name) || 0) + amount);
  }
  return Array.from(totals, ([donorName, total]) => ({ donorName, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
