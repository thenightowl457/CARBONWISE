const db = require("../db");
const { CATEGORIES } = require("../catalog");
const { summarize, round, roundCategories } = require("./calc");
const { computedActivities } = require("./activityData");
const { coverage } = require("./dashboard");
const { daysInclusive, addDays } = require("../utils/dates");

async function periodSnapshot(user, from, to) {
  const { rows, computed } = await computedActivities(user, from, to);
  const s = summarize(computed);
  const cov = coverage(rows, from, to);
  return {
    period: { from, to, days: daysInclusive(from, to) },
    total_kg: round(s.total),
    by_category: roundCategories(s.byCategory),
    activity_count: s.count,
    days_with_data: cov.days_with_data,
    coverage: cov,
    _raw: s,
  };
}

async function milestones(user, comparison) {
  const { rows } = await db.query(
    `SELECT to_char(activity_date,'YYYY-MM-DD') AS d, category, activity_type FROM activities WHERE user_id=$1 ORDER BY activity_date`,
    [user.id]
  );
  const days = [...new Set(rows.map((r) => r.d))];
  const cats = new Set(rows.map((r) => r.category));
  let streak = 0, best = 0;
  for (let i = 0; i < days.length; i++) {
    streak = i > 0 && addDays(days[i - 1], 1) === days[i] ? streak + 1 : 1;
    best = Math.max(best, streak);
  }
  const zeroKm = rows.filter((r) => ["bicycle", "walk"].includes(r.activity_type)).length;
  const comparable = comparison?.comparable && comparison.delta_pct != null;
  return [
    { key: "first_log", title: "First activity logged", achieved: rows.length >= 1, progress: `${Math.min(rows.length, 1)}/1` },
    { key: "seven_days", title: "Logged on 7 different days", achieved: days.length >= 7, progress: `${Math.min(days.length, 7)}/7` },
    { key: "streak_3", title: "3-day logging streak", achieved: best >= 3, progress: `${Math.min(best, 3)}/3` },
    { key: "all_categories", title: "Logged commute, energy and consumption", achieved: CATEGORIES.every((c) => cats.has(c)), progress: `${cats.size}/3` },
    { key: "active_travel", title: "Logged 5 walking or cycling trips", achieved: zeroKm >= 5, progress: `${Math.min(zeroKm, 5)}/5` },
    {
      key: "reduction_5",
      title: "Estimated footprint 5% lower than the previous period",
      achieved: !!(comparable && comparison.delta_pct <= -5),
      progress: comparable ? `${comparison.delta_pct}%` : "needs two periods with data",
    },
  ];
}

async function buildProgress(user, from, to, prevFrom, prevTo) {
  const [current, previous] = await Promise.all([periodSnapshot(user, from, to), periodSnapshot(user, prevFrom, prevTo)]);
  const comparable = current.activity_count > 0 && previous.activity_count > 0;
  const delta = current._raw.total - previous._raw.total;
  const byCat = Object.fromEntries(
    CATEGORIES.map((c) => [c, round(current._raw.byCategory[c] - previous._raw.byCategory[c])])
  );
  const caveats = ["These are estimates from logged activities. A change does not prove what caused it."];
  if (!comparable) caveats.push("Both periods need logged activities before they can be compared.");
  if (current.period.days !== previous.period.days) caveats.push("The two periods have different lengths.");
  for (const [label, p] of [["Current", current], ["Previous", previous]]) {
    if (p.coverage.note && p.activity_count > 0) caveats.push(`${label} period: ${p.coverage.note}`);
    else if (p.activity_count === 0) caveats.push(`${label} period has no logged activities.`);
  }
  const strip = ({ _raw, ...rest }) => rest;
  const comparison = {
    comparable,
    delta_kg: comparable ? round(delta) : null,
    delta_pct: comparable && previous._raw.total > 0 ? round((delta / previous._raw.total) * 100, 1) : null,
    by_category_delta_kg: comparable ? byCat : null,
  };
  return {
    current: strip(current),
    previous: strip(previous),
    comparison,
    caveats,
    milestones: await milestones(user, comparison),
  };
}

module.exports = { buildProgress };
