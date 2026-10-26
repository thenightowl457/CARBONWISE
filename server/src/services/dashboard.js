const { CATEGORIES } = require("../catalog");
const { summarize, round, roundCategories } = require("./calc");
const { computedActivities } = require("./activityData");
const { daysInclusive, addDays, startOfWeek, monthKey, eachDay } = require("../utils/dates");

function granularityFor(days) {
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}
function bucketKey(date, g) {
  return g === "day" ? date : g === "week" ? startOfWeek(date) : monthKey(date);
}
function bucketKeys(from, to, g) {
  const keys = [];
  for (const d of eachDay(from, to)) {
    const k = bucketKey(d, g);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}

// Coverage tells the user how complete the total is (risk: "incomplete data").
function coverage(rows, from, to) {
  const logged = CATEGORIES.filter((c) => rows.some((r) => r.category === c));
  const missing = CATEGORIES.filter((c) => !logged.includes(c));
  const daysWithData = new Set(rows.map((r) => r.activity_date)).size;
  const daysInRange = daysInclusive(from, to);
  let note = null;
  if (rows.length === 0) note = "No activities logged in this period.";
  else if (missing.length)
    note = `No ${missing.join(" or ")} activities logged in this period, so this total is probably understated.`;
  return { categories_logged: logged, categories_missing: missing, days_with_data: daysWithData, days_in_range: daysInRange, note };
}

async function buildSummary(user, from, to) {
  const { rows, computed } = await computedActivities(user, from, to);
  const s = summarize(computed);
  const g = granularityFor(daysInclusive(from, to));

  const buckets = new Map(bucketKeys(from, to, g).map((k) => [k, { key: k, total: 0, byCategory: { commute: 0, energy: 0, consumption: 0 }, entries: 0 }]));
  for (const c of computed) {
    const b = buckets.get(bucketKey(c.activity_date, g));
    b.entries++;
    if (c.co2e_kg != null) {
      b.total += c.co2e_kg;
      b.byCategory[c.category] += c.co2e_kg;
    }
  }
  const trend = [...buckets.values()].map((b) => ({
    key: b.key,
    total_kg: round(b.total),
    by_category: roundCategories(b.byCategory),
    has_data: b.entries > 0,
  }));

  return {
    period: { from, to, days: daysInclusive(from, to) },
    total_kg: round(s.total),
    total_tonnes: round(s.total / 1000, 6),
    by_category: roundCategories(s.byCategory),
    activity_count: s.count,
    unavailable_count: s.unavailable,
    unavailable_note: s.unavailable
      ? `${s.unavailable} ${s.unavailable === 1 ? "activity was" : "activities were"} excluded because no matching emission factor is available.`
      : null,
    trend: { granularity: g, buckets: trend, note: "Periods with no logged activity are marked 'no data'. They are not measured zeros." },
    coverage: coverage(rows, from, to),
    region: user.region,
    estimate_note: "Estimated from logged activities and documented emission factors; not audited carbon accounting.",
  };
}

module.exports = { buildSummary, coverage, granularityFor };
