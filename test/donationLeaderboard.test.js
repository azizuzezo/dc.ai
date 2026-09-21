import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateLeaderboard } from "../src/services/donationLeaderboard.js";

test("aggregateLeaderboard sums amounts per donor, highest first", () => {
  const donations = [
    { donor_name: "Budi", amount: 10000 },
    { donor_name: "Ani", amount: 25000 },
    { donor_name: "Budi", amount: 5000 },
  ];
  assert.deepEqual(aggregateLeaderboard(donations), [
    { donorName: "Ani", total: 25000 },
    { donorName: "Budi", total: 15000 },
  ]);
});

test("aggregateLeaderboard respects the limit", () => {
  const donations = [
    { donor_name: "A", amount: 3 },
    { donor_name: "B", amount: 2 },
    { donor_name: "C", amount: 1 },
  ];
  assert.deepEqual(aggregateLeaderboard(donations, 2), [
    { donorName: "A", total: 3 },
    { donorName: "B", total: 2 },
  ]);
});

test("aggregateLeaderboard returns [] for no donations", () => {
  assert.deepEqual(aggregateLeaderboard([]), []);
});
