const express = require("express");
const { z } = require("zod");
const db = require("../db");
const { getType, REGIONS } = require("../catalog");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { SELECT } = require("../services/factors");
const { parse, notFound, AppError } = require("../utils/errors");
const { isValidDate, today } = require("../utils/dates");

const router = express.Router();
router.use(requireAuth, requireAdmin); // NFR-01: authorization is enforced server-side

const log = (q, entity, id, action, userId, details) =>
  q.query("INSERT INTO change_log (entity,entity_id,action,user_id,details) VALUES ($1,$2,$3,$4,$5)", [entity, id, action, userId, JSON.stringify(details)]);

const intId = (req, what) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw notFound(`${what} not found`);
  return id;
};

// ---------- Emission factors (FR-05, FR-15) ----------
const validDate = z.string().refine(isValidDate, "Use a real date in YYYY-MM-DD format");
const factorCreate = z.object({
  activity_type: z.string().refine((t) => !!getType(t), "Unknown activity type"),
  region: z.string().refine((r) => r in REGIONS, "Unsupported region"),
  value: z.number().finite().min(0, "Value cannot be negative").max(100000),
  unit_basis: z.string().min(1),
  source: z.string().trim().min(3, "Source/reference is required").max(300),
  notes: z.string().max(500).optional(),
  valid_from: validDate.default(() => today()),
});
const factorUpdate = z.object({
  value: z.number().finite().min(0, "Value cannot be negative").max(100000),
  source: z.string().trim().min(3, "Source/reference is required").max(300),
  notes: z.string().max(500).optional(),
  valid_from: validDate.default(() => today()),
});

router.get("/emission-factors", async (req, res) => {
  const where = [], args = [];
  for (const k of ["category", "activity_type", "region"]) {
    if (req.query[k]) { args.push(req.query[k]); where.push(`${k}=$${args.length}`); }
  }
  if (req.query.current === "true") where.push("valid_to IS NULL");
  const { rows } = await db.query(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY category, activity_type, region, version DESC`, args);
  res.json({ items: rows });
});

router.post("/emission-factors", async (req, res) => {
  const b = parse(factorCreate, req.body);
  const def = getType(b.activity_type);
  if (b.unit_basis !== def.base) throw new AppError(400, "Validation failed", [{ field: "unit_basis", message: `Unit basis for ${def.label} must be "${def.base}"` }]);
  const dup = await db.query("SELECT 1 FROM emission_factors WHERE activity_type=$1 AND region=$2", [b.activity_type, b.region]);
  if (dup.rows.length) throw new AppError(409, "A factor already exists for this activity and region. Update it to create a new version.");
  const row = await db.tx(async (q) => {
    const r = await q.query(
      `INSERT INTO emission_factors (category,activity_type,region,value,unit_basis,source,notes,version,valid_from,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9) RETURNING id`,
      [def.category, b.activity_type, b.region, b.value, def.base, b.source, b.notes || null, b.valid_from, req.user.id]
    );
    await log(q, "emission_factor", r.rows[0].id, "create", req.user.id, b);
    return r.rows[0];
  });
  const { rows } = await db.query(`${SELECT} WHERE id=$1`, [row.id]);
  res.status(201).json({ factor: rows[0] });
});

// Updating never edits history: it closes the current version and adds a new one.
router.patch("/emission-factors/:id", async (req, res) => {
  const id = intId(req, "Factor");
  const b = parse(factorUpdate, req.body);
  const { rows } = await db.query(`${SELECT} WHERE id=$1`, [id]);
  if (!rows.length) throw notFound("Factor not found");
  const cur = rows[0];
  if (cur.valid_to) throw new AppError(409, "Only the current version of a factor can be updated");
  if (b.valid_from <= cur.valid_from) {
    throw new AppError(400, "Validation failed", [{ field: "valid_from", message: `Effective date must be after the current version's date (${cur.valid_from})` }]);
  }
  const created = await db.tx(async (q) => {
    await q.query("UPDATE emission_factors SET valid_to=$1 WHERE id=$2", [b.valid_from, id]);
    const r = await q.query(
      `INSERT INTO emission_factors (category,activity_type,region,value,unit_basis,source,notes,version,valid_from,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [cur.category, cur.activity_type, cur.region, b.value, cur.unit_basis, b.source, b.notes || null, cur.version + 1, b.valid_from, req.user.id]
    );
    await log(q, "emission_factor", r.rows[0].id, "new_version", req.user.id, { previous_id: id, previous_value: cur.value, ...b });
    return r.rows[0];
  });
  const out = await db.query(`${SELECT} WHERE id=$1`, [created.id]);
  res.json({ factor: out.rows[0] });
});

// ---------- Recommendation rules ----------
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reduce"), fraction: z.number().gt(0).max(1) }),
  z.object({ type: z.literal("shift"), to: z.string().refine((t) => !!getType(t), "Unknown activity type"), fraction: z.number().gt(0).max(1) }),
]);
const paramsSchema = z.object({
  activity_type: z.string().refine((t) => !!getType(t), "Unknown activity type"),
  min_quantity: z.number().min(0),
  window_days: z.number().int().min(1).max(365).default(30),
  action: actionSchema,
}).superRefine((p, ctx) => {
  if (p.action.type === "shift") {
    const from = getType(p.activity_type), to = getType(p.action.to);
    if (from && to && from.base !== to.base) ctx.addIssue({ code: "custom", path: ["action", "to"], message: `Units are incompatible (${from.base} vs ${to.base})` });
    if (p.activity_type === p.action.to) ctx.addIssue({ code: "custom", path: ["action", "to"], message: "Target must differ from the source activity" });
  }
});
const ruleFields = {
  title: z.string().trim().min(3).max(120),
  params: paramsSchema,
  action_text: z.string().trim().min(5).max(400),
  rationale: z.string().trim().min(5).max(400),
  priority: z.number().int().min(0).max(100),
  enabled: z.boolean(),
};
const ruleCreate = z.object({ rule_key: z.string().regex(/^[a-z0-9_]{3,60}$/, "Use lowercase letters, numbers and underscores"), ...ruleFields });
const ruleUpdate = z.object(ruleFields).partial().refine((o) => Object.keys(o).length > 0, "Nothing to update");

const RULE_COLS = "id, rule_key, title, category, params, action_text, rationale, priority, enabled, version, updated_by, updated_at";

router.get("/recommendation-rules", async (req, res) => {
  const { rows } = await db.query(`SELECT ${RULE_COLS} FROM recommendation_rules ORDER BY category, rule_key`);
  res.json({ items: rows });
});

router.post("/recommendation-rules", async (req, res) => {
  const b = parse(ruleCreate, req.body);
  const dup = await db.query("SELECT 1 FROM recommendation_rules WHERE rule_key=$1", [b.rule_key]);
  if (dup.rows.length) throw new AppError(409, "A rule with this key already exists");
  const category = getType(b.params.activity_type).category;
  const rule = await db.tx(async (q) => {
    const r = await q.query(
      `INSERT INTO recommendation_rules (rule_key,title,category,params,action_text,rationale,priority,enabled,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${RULE_COLS}`,
      [b.rule_key, b.title, category, JSON.stringify(b.params), b.action_text, b.rationale, b.priority, b.enabled, req.user.id]
    );
    await log(q, "recommendation_rule", r.rows[0].id, "create", req.user.id, b);
    return r.rows[0];
  });
  res.status(201).json({ rule });
});

router.patch("/recommendation-rules/:id", async (req, res) => {
  const id = intId(req, "Rule");
  const b = parse(ruleUpdate, req.body);
  const cur = (await db.query(`SELECT ${RULE_COLS} FROM recommendation_rules WHERE id=$1`, [id])).rows[0];
  if (!cur) throw notFound("Rule not found");
  const n = { ...cur, ...b };
  const category = getType(n.params.activity_type).category;
  const rule = await db.tx(async (q) => {
    const r = await q.query(
      `UPDATE recommendation_rules SET title=$1,category=$2,params=$3,action_text=$4,rationale=$5,priority=$6,enabled=$7,
         version=version+1,updated_by=$8,updated_at=now() WHERE id=$9 RETURNING ${RULE_COLS}`,
      [n.title, category, JSON.stringify(n.params), n.action_text, n.rationale, n.priority, n.enabled, req.user.id, id]
    );
    await log(q, "recommendation_rule", id, "update", req.user.id, { changes: b, previous_version: cur.version });
    return r.rows[0];
  });
  res.json({ rule });
});

router.get("/change-log", async (req, res) => {
  const { rows } = await db.query(
    `SELECT c.id, c.entity, c.entity_id, c.action, c.details, c.created_at, u.email AS user_email
     FROM change_log c LEFT JOIN users u ON u.id=c.user_id ORDER BY c.id DESC LIMIT 100`
  );
  res.json({ items: rows });
});

module.exports = router;
