const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const config = require("../config");
const { REGIONS } = require("../catalog");
const { requireAuth, setAuthCookie, clearAuthCookie } = require("../middleware/auth");
const { AppError, parse } = require("../utils/errors");

const router = express.Router();
const limiter = config.rateLimit
  ? rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many attempts. Try again later." } })
  : (req, res, next) => next();

const password = z.string().min(8, "Password must be at least 8 characters").max(100)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Password must contain a letter and a number");
const region = z.string().refine((r) => r in REGIONS, "Unsupported region");

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password,
  region: region.optional(),
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });
const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  region: region.optional(),
  distance_unit: z.enum(["km", "mi"]).optional(),
}).refine((o) => Object.keys(o).length > 0, "Nothing to update");

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, region: u.region, distance_unit: u.distance_unit });

router.post("/register", limiter, async (req, res) => {
  const b = parse(registerSchema, req.body);
  const exists = await db.query("SELECT 1 FROM users WHERE email=$1", [b.email]);
  if (exists.rows.length) throw new AppError(409, "An account with this email already exists");
  const hash = await bcrypt.hash(b.password, config.bcryptCost);
  const { rows } = await db.query(
    "INSERT INTO users (name,email,password_hash,region) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role,region,distance_unit",
    [b.name, b.email, hash, b.region || "IN"]
  );
  setAuthCookie(res, rows[0]);
  res.status(201).json({ user: publicUser(rows[0]) });
});

router.post("/login", limiter, async (req, res) => {
  const b = parse(loginSchema, req.body);
  const { rows } = await db.query("SELECT * FROM users WHERE email=$1", [b.email]);
  const ok = rows.length && (await bcrypt.compare(b.password, rows[0].password_hash));
  if (!ok) throw new AppError(401, "Incorrect email or password"); // same message for both cases
  setAuthCookie(res, rows[0]);
  res.json({ user: publicUser(rows[0]) });
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// FR-02: preferences used by calculations (region) and display (distance unit)
router.patch("/me", requireAuth, async (req, res) => {
  const b = parse(profileSchema, req.body);
  const next = { ...req.user, ...b };
  const { rows } = await db.query(
    "UPDATE users SET name=$1, region=$2, distance_unit=$3 WHERE id=$4 RETURNING id,name,email,role,region,distance_unit",
    [next.name, next.region, next.distance_unit, req.user.id]
  );
  res.json({ user: publicUser(rows[0]) });
});

// NFR-02: users can export or delete their own data.
router.get("/export", requireAuth, async (req, res) => {
  const acts = await db.query(
    "SELECT id,category,activity_type,quantity,unit,to_char(activity_date,'YYYY-MM-DD') AS activity_date,notes FROM activities WHERE user_id=$1 ORDER BY activity_date,id",
    [req.user.id]
  );
  const scen = await db.query("SELECT id,name,inputs,baseline_kg,projected_kg,created_at FROM scenarios WHERE user_id=$1", [req.user.id]);
  res.setHeader("Content-Disposition", "attachment; filename=carbonwise-export.json");
  res.json({ exported_at: new Date().toISOString(), user: publicUser(req.user), activities: acts.rows, scenarios: scen.rows });
});

router.delete("/me", requireAuth, async (req, res) => {
  const { password: pw } = parse(z.object({ password: z.string().min(1) }), req.body);
  const { rows } = await db.query("SELECT password_hash FROM users WHERE id=$1", [req.user.id]);
  if (!(await bcrypt.compare(pw, rows[0].password_hash))) throw new AppError(401, "Incorrect password");
  await db.query("DELETE FROM users WHERE id=$1", [req.user.id]); // activities/scenarios cascade
  clearAuthCookie(res);
  res.json({ ok: true });
});

module.exports = router;
