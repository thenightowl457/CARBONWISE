const db = require("../db");
const { getType } = require("../catalog");
const { summarize, round } = require("./calc");
const { computedActivities } = require("./activityData");
const { resolveFactor } = require("./factors");
const { addDays } = require("../utils/dates");

const fmtNum = (n) => (Math.round(n * 10) / 10).toString();

// Pure function: same activities + same rules + same factors => same output (reproducible).
// Ranking: estimated reduction (kg CO2e) desc, then rule priority desc, then rule_key asc.
// Rules whose impact can't be estimated are ranked last.
function evaluateRules({ rules, summary, idx, region, to, days, totalKg }) {
  const out = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const p = rule.params;
    const stats = summary.byType[p.activity_type];
    if (!stats) continue;
    const def = getType(p.activity_type);
    if (!def) continue;
    const threshold = p.min_quantity * (days / (p.window_days || 30));
    if (stats.quantity_base < threshold) continue;

    const assumptions = [];
    let reduction = null;
    const a = p.action;
    if (a.type === "reduce") {
      reduction = stats.co2e_kg * a.fraction;
      assumptions.push(`Assumes a ${Math.round(a.fraction * 100)}% cut in ${def.label.toLowerCase()} use.`);
    } else if (a.type === "shift") {
      const target = getType(a.to);
      const f = target && target.base === def.base ? resolveFactor(idx, a.to, region, to) : null;
      assumptions.push(`Assumes ${Math.round(a.fraction * 100)}% of ${def.label.toLowerCase()} is replaced by ${target ? target.label.toLowerCase() : a.to}.`);
      if (f) {
        reduction = stats.co2e_kg * a.fraction - stats.quantity_base * a.fraction * f.value;
        if (reduction <= 0) continue; // the swap would not help, so don't suggest it
      } else {
        assumptions.push("Impact can't be estimated: no matching emission factor for the alternative.");
      }
    }
    assumptions.push("Estimate uses the emission factors in force on the end date of the period.");

    const reason = rule.rationale
      .replaceAll("{qty}", fmtNum(stats.quantity_base))
      .replaceAll("{unit}", def.base)
      .replaceAll("{co2e}", fmtNum(stats.co2e_kg))
      .replaceAll("{days}", String(days));

    out.push({
      rule_key: rule.rule_key,
      rule_version: rule.version,
      title: rule.title,
      category: rule.category,
      action: rule.action_text,
      why: reason,
      estimated_reduction_kg: reduction == null ? null : round(reduction),
      estimated_reduction_pct: reduction == null || !totalKg ? null : round((reduction / totalKg) * 100, 1),
      impact_label: reduction == null ? "Impact can't be estimated" : "Estimated impact (not guaranteed)",
      assumptions,
      priority: rule.priority,
    });
  }
  out.sort((x, y) => {
    const rx = x.estimated_reduction_kg ?? -1, ry = y.estimated_reduction_kg ?? -1;
    return ry - rx || y.priority - x.priority || (x.rule_key < y.rule_key ? -1 : 1);
  });
  return out.map((r, i) => ({ rank: i + 1, ...r }));
}

async function buildRecommendations(user, days = 30, endDate) {
  const to = endDate;
  const from = addDays(to, -(days - 1));
  const { computed, idx } = await computedActivities(user, from, to);
  const summary = summarize(computed);
  const { rows } = await db.query("SELECT * FROM recommendation_rules");
  const rules = rows.map((r) => ({ ...r, params: typeof r.params === "string" ? JSON.parse(r.params) : r.params }));
  const items = evaluateRules({ rules, summary, idx, region: user.region, to, days, totalKg: summary.total });
  return {
    period: { from, to, days },
    total_kg: round(summary.total),
    items,
    empty_reason: summary.counted === 0 ? "no_data" : items.length === 0 ? "no_matches" : null,
    ranking_logic: "Ranked by estimated reduction (kg CO2e) for this period, then rule priority, then rule key. Impacts are estimates based on stated assumptions.",
  };
}

module.exports = { evaluateRules, buildRecommendations };
