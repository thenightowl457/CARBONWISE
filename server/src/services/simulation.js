const { z } = require("zod");
const { getType } = require("../catalog");
const { computeActivity, summarize, round, roundCategories } = require("./calc");
const { computedActivities } = require("./activityData");
const { badRequest } = require("../utils/errors");

const typeName = z.string().refine((t) => !!getType(t), "Unknown activity type");

const adjustmentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scale"), activity_type: typeName, percent: z.number().min(-100).max(1000) }),
  z.object({ type: z.literal("shift"), from: typeName, to: typeName, fraction: z.number().min(0).max(1) }),
  z.object({ type: z.literal("add"), activity_type: typeName, quantity: z.number().positive(), unit: z.string() }),
]);

function describe(a) {
  if (a.type === "scale") return `${getType(a.activity_type).label}: ${a.percent >= 0 ? "+" : ""}${a.percent}% quantity`;
  if (a.type === "shift") return `Shift ${Math.round(a.fraction * 100)}% of ${getType(a.from).label} to ${getType(a.to).label}`;
  return `Add ${a.quantity} ${a.unit} of ${getType(a.activity_type).label}`;
}

function validateAdjustment(a) {
  if (a.type === "shift") {
    const f = getType(a.from), t = getType(a.to);
    if (a.from === a.to) throw badRequest("Shift needs two different activity types");
    if (f.base !== t.base) throw badRequest(`Cannot shift ${f.label} (${f.base}) to ${t.label} (${t.base}): units are incompatible`);
  }
  if (a.type === "add") {
    const d = getType(a.activity_type);
    if (!d.units[a.unit]) throw badRequest(`Unit "${a.unit}" is not supported for ${d.label}`);
    if (a.quantity * d.units[a.unit] > d.max) throw badRequest(`Quantity is above the allowed maximum for ${d.label}`);
  }
}

// Work on in-memory copies only. Nothing here writes to the activities table (FR-12).
function applyAdjustments(baseline, adjustments, idx, region, periodEnd) {
  let items = baseline.map((c) => ({ ...c })); // computed rows: carry quantity_base
  const virtual = [];
  for (const a of adjustments) {
    if (a.type === "scale") {
      items = items.map((i) => (i.activity_type === a.activity_type ? { ...i, quantity_base: i.quantity_base * (1 + a.percent / 100) } : i));
    } else if (a.type === "shift") {
      const moved = [];
      items = items.map((i) => {
        if (i.activity_type !== a.from) return i;
        moved.push({ activity_type: a.to, activity_date: i.activity_date, quantity_base: i.quantity_base * a.fraction });
        return { ...i, quantity_base: i.quantity_base * (1 - a.fraction) };
      });
      virtual.push(...moved);
    } else {
      const d = getType(a.activity_type);
      virtual.push({ activity_type: a.activity_type, activity_date: periodEnd, quantity_base: a.quantity * d.units[a.unit] });
    }
  }
  // Re-price everything with the SAME factor index + region: a fair comparison.
  const all = [...items.filter((i) => i.quantity_base != null), ...virtual];
  return all.map((i) => {
    const def = getType(i.activity_type);
    return computeActivity(
      { id: i.id, category: def.category, activity_type: i.activity_type, activity_date: i.activity_date, quantity: i.quantity_base, unit: def.base },
      idx, region
    );
  });
}

async function simulate(user, { from, to, adjustments }) {
  adjustments.forEach(validateAdjustment);
  const { computed, idx } = await computedActivities(user, from, to);
  const baselineItems = computed.filter((c) => c.co2e_kg != null);
  const baseline = summarize(baselineItems);

  const projectedItems = applyAdjustments(baselineItems, adjustments, idx, user.region, to);
  const projected = summarize(projectedItems);

  const delta = projected.total - baseline.total;
  const impacts = adjustments.map((a) => {
    const solo = summarize(applyAdjustments(baselineItems, [a], idx, user.region, to));
    return { description: describe(a), delta_kg: round(solo.total - baseline.total) };
  });

  return {
    hypothetical: true,
    period: { from, to },
    baseline_kg: round(baseline.total),
    projected_kg: round(projected.total),
    delta_kg: round(delta),
    // Zero baseline => a percentage is undefined; say so instead of showing Infinity/NaN.
    delta_pct: baseline.total > 0 ? round((delta / baseline.total) * 100, 1) : null,
    delta_pct_note: baseline.total > 0 ? null : "Percentage change isn't defined because the baseline is 0.",
    by_category: { baseline: roundCategories(baseline.byCategory), projected: roundCategories(projected.byCategory) },
    adjustments: impacts,
    baseline_activity_count: baselineItems.length,
    assumptions: [
      "Scenario results are hypothetical. Your saved activities are not changed.",
      "Baseline and scenario use the same emission-factor versions (as in force on each activity's date; added activities use the period end date).",
      "Individual adjustment impacts are calculated alone, so they may not add up exactly to the combined result.",
    ],
  };
}

module.exports = { simulate, adjustmentSchema, applyAdjustments };
