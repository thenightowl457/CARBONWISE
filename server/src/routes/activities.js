const express = require("express");
const { z } = require("zod");
const db = require("../db");
const { CATEGORIES, getType } = require("../catalog");
const { requireAuth } = require("../middleware/auth");
const { COLS } = require("../services/activityData");
const { loadFactorIndex } = require("../services/factors");
const { computeActivity, round } = require("../services/calc");
const { parse, notFound, AppError } = require("../utils/errors");
const { isValidDate, today, addDays } = require("../utils/dates");

const router = express.Router();
router.use(requireAuth);

const dateField = z.string().refine(isValidDate, "Use a real date in YYYY-MM-DD format")
  .refine((d) => d >= "2000-01-01", "Date is too far in the past")
  .refine((d) => d <= addDays(today(), 1), "Date cannot be in the future");

const baseSchema = z.object({
  category: z.enum(CATEGORIES, { message: "Choose commute, energy or consumption" }),
  activity_type: z.string().min(1, "Activity type is required"),
  quantity: z.number({ message: "Quantity must be a number" }).positive("Quantity must be greater than 0").finite(),
  unit: z.string().min(1, "Unit is required"),
  activity_date: dateField,
  notes: z.string().max(500, "Notes can be at most 500 characters").nullish(),
});

// Category-specific rules (FR-04): type belongs to category, unit allowed, quantity in sane range.
const activitySchema = baseSchema.superRefine((a, ctx) => {
  const def = getType(a.activity_type);
  if (!def || def.category !== a.category) {
    return ctx.addIssue({ code: "custom", path: ["activity_type"], message: `Unsupported activity type for ${a.category}` });
  }
  const mult = def.units[a.unit];
  if (!mult) {
    return ctx.addIssue({ code: "custom", path: ["unit"], message: `Unit must be one of: ${Object.keys(def.units).join(", ")}` });
  }
  if (a.quantity * mult > def.max) {
    ctx.addIssue({ code: "custom", path: ["quantity"], message: `That is above the maximum of ${def.max} ${def.base} for a single entry` });
  }
});

const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw notFound("Activity not found");
  return id;
};

const shape = (row, idx, region) => {
  const c = computeActivity(row, idx, region);
  return {
    id: row.id, category: row.category, activity_type: row.activity_type,
    label: getType(row.activity_type)?.label, quantity: row.quantity, unit: row.unit,
    activity_date: row.activity_date, notes: row.notes,
    co2e_kg: round(c.co2e_kg), factor: c.factor || null, unavailable: c.unavailable || null,
  };
};

const listQuery = z.object({
  category: z.enum(CATEGORIES).optional(),
  activity_type: z.string().optional(),
  from: z.string().refine(isValidDate, "Invalid 'from' date").optional(),
  to: z.string().refine(isValidDate, "Invalid 'to' date").optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get("/", async (req, res) => {
  const q = parse(listQuery, req.query);
  const where = ["user_id=$1"], args = [req.user.id];
  const add = (sql, v) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };
  if (q.category) add("category=?", q.category);
  if (q.activity_type) add("activity_type=?", q.activity_type);
  if (q.from) add("activity_date>=?", q.from);
  if (q.to) add("activity_date<=?", q.to);
  if (q.from && q.to && q.from > q.to) throw new AppError(400, "'from' must not be after 'to'");
  const w = where.join(" AND ");
  const total = (await db.query(`SELECT count(*)::int AS n FROM activities WHERE ${w}`, args)).rows[0].n;
  const { rows } = await db.query(
    `SELECT ${COLS} FROM activities WHERE ${w} ORDER BY activity_date DESC, id DESC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
    args
  );
  const idx = await loadFactorIndex();
  res.json({ items: rows.map((r) => shape(r, idx, req.user.region)), total, page: q.page, limit: q.limit });
});

router.post("/", async (req, res) => {
  const a = parse(activitySchema, req.body);
  const { rows } = await db.query(
    `INSERT INTO activities (user_id,category,activity_type,quantity,unit,activity_date,notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLS}`,
    [req.user.id, a.category, a.activity_type, a.quantity, a.unit, a.activity_date, a.notes || null]
  );
  res.status(201).json({ activity: shape(rows[0], await loadFactorIndex(), req.user.region) });
});

async function findOwned(id, userId) {
  const { rows } = await db.query(`SELECT ${COLS} FROM activities WHERE id=$1 AND user_id=$2`, [id, userId]);
  if (!rows.length) throw notFound("Activity not found"); // same 404 whether missing or someone else's (FR-16)
  return rows[0];
}

router.get("/:id", async (req, res) => {
  const row = await findOwned(idParam(req), req.user.id);
  res.json({ activity: shape(row, await loadFactorIndex(), req.user.region) });
});

router.patch("/:id", async (req, res) => {
  const id = idParam(req);
  const existing = await findOwned(id, req.user.id);
  const merged = parse(activitySchema, { ...existing, ...req.body, id: undefined });
  const { rows } = await db.query(
    `UPDATE activities SET category=$1,activity_type=$2,quantity=$3,unit=$4,activity_date=$5,notes=$6,updated_at=now()
     WHERE id=$7 AND user_id=$8 RETURNING ${COLS}`,
    [merged.category, merged.activity_type, merged.quantity, merged.unit, merged.activity_date, merged.notes || null, id, req.user.id]
  );
  res.json({ activity: shape(rows[0], await loadFactorIndex(), req.user.region) });
});

router.delete("/:id", async (req, res) => {
  const id = idParam(req);
  await findOwned(id, req.user.id);
  await db.query("DELETE FROM activities WHERE id=$1 AND user_id=$2", [id, req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
