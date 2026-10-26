const { getType } = require("../catalog");
const { resolveFactor } = require("./factors");

const round = (n, dp = 3) => (n == null ? null : Math.round(n * 10 ** dp) / 10 ** dp);

// FR-06: emissions = quantity(in factor's unit basis) x matching factor.
// Full precision internally; callers round for display only.
function computeActivity(a, idx, region) {
  const def = getType(a.activity_type);
  const base = { id: a.id, category: a.category, activity_type: a.activity_type, activity_date: a.activity_date };
  if (!def) return { ...base, co2e_kg: null, unavailable: `Unknown activity type "${a.activity_type}"` };
  const mult = def.units[a.unit];
  if (!mult) return { ...base, co2e_kg: null, unavailable: `Unit "${a.unit}" is not supported for ${def.label}` };
  const f = resolveFactor(idx, a.activity_type, region, a.activity_date);
  if (!f) {
    return { ...base, co2e_kg: null, unavailable: `No emission factor for ${def.label} in region ${region} on ${a.activity_date}` };
  }
  if (f.unit_basis !== def.base) {
    return { ...base, co2e_kg: null, unavailable: `Factor unit (${f.unit_basis}) does not match activity unit (${def.base})` };
  }
  const quantity_base = a.quantity * mult;
  return {
    ...base,
    quantity_base,
    co2e_kg: quantity_base * f.value,
    factor: { id: f.id, version: f.version, value: f.value, unit_basis: f.unit_basis, source: f.source, region: f.region },
  };
}

function summarize(computed) {
  const byCategory = { commute: 0, energy: 0, consumption: 0 };
  const byType = {};
  let total = 0, unavailable = 0, counted = 0;
  for (const c of computed) {
    if (c.co2e_kg == null) { unavailable++; continue; }
    counted++;
    total += c.co2e_kg;
    byCategory[c.category] += c.co2e_kg;
    const t = (byType[c.activity_type] ||= { co2e_kg: 0, quantity_base: 0, count: 0 });
    t.co2e_kg += c.co2e_kg;
    t.quantity_base += c.quantity_base;
    t.count++;
  }
  return { total, byCategory, byType, counted, unavailable, count: computed.length };
}

const roundCategories = (cat) => Object.fromEntries(Object.entries(cat).map(([k, v]) => [k, round(v)]));

module.exports = { computeActivity, summarize, round, roundCategories };
