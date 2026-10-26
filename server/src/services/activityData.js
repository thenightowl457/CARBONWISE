const db = require("../db");
const { loadFactorIndex } = require("./factors");
const { computeActivity } = require("./calc");

const COLS = `id, user_id, category, activity_type, quantity, unit, notes,
  to_char(activity_date,'YYYY-MM-DD') AS activity_date, created_at, updated_at`;

async function fetchActivities(userId, from, to) {
  const { rows } = await db.query(
    `SELECT ${COLS} FROM activities WHERE user_id=$1 AND activity_date BETWEEN $2 AND $3
     ORDER BY activity_date, id`,
    [userId, from, to]
  );
  return rows;
}

// Activities for a period, each with its computed emissions.
async function computedActivities(user, from, to) {
  const [rows, idx] = await Promise.all([fetchActivities(user.id, from, to), loadFactorIndex()]);
  return { rows, idx, computed: rows.map((r) => computeActivity(r, idx, user.region)) };
}

module.exports = { COLS, fetchActivities, computedActivities };
