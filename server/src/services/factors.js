const db = require("../db");

const SELECT = `SELECT id, category, activity_type, region, value, unit_basis, source, notes, version,
  to_char(valid_from,'YYYY-MM-DD') AS valid_from, to_char(valid_to,'YYYY-MM-DD') AS valid_to
  FROM emission_factors`;

// Index: "type|region" -> versions sorted newest first. Loaded once per request,
// so a calculation never mixes a half-updated factor table.
async function loadFactorIndex() {
  const { rows } = await db.query(SELECT);
  const idx = new Map();
  for (const r of rows) {
    const k = `${r.activity_type}|${r.region}`;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(r);
  }
  for (const list of idx.values()) list.sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1) || b.version - a.version);
  return idx;
}

// The factor version in force on `date`. No match => null (never silently substitute).
function resolveFactor(idx, activityType, region, date) {
  const list = idx.get(`${activityType}|${region}`) || [];
  return list.find((f) => f.valid_from <= date && (!f.valid_to || date < f.valid_to)) || null;
}

module.exports = { loadFactorIndex, resolveFactor, SELECT };
