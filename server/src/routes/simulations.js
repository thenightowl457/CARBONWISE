const express = require("express");
const { z } = require("zod");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { simulate, adjustmentSchema } = require("../services/simulation");
const { parse, notFound } = require("../utils/errors");
const { checkRange, date } = require("../utils/range");

const router = express.Router();
router.use(requireAuth);

const bodySchema = z.object({
  from: date("from"),
  to: date("to"),
  adjustments: z.array(adjustmentSchema).min(1, "Add at least one change").max(20),
  save: z.boolean().optional(),
  name: z.string().trim().min(1).max(80).optional(),
});

// FR-11/12: pure calculation. Only writes to `scenarios` when save:true, never to `activities`.
router.post("/", async (req, res) => {
  const b = parse(bodySchema, req.body);
  checkRange(b.from, b.to);
  const result = await simulate(req.user, b);
  if (b.save) {
    const { rows } = await db.query(
      `INSERT INTO scenarios (user_id,name,period_from,period_to,inputs,baseline_kg,projected_kg)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.user.id, b.name || "Untitled scenario", b.from, b.to, JSON.stringify(b.adjustments), result.baseline_kg, result.projected_kg]
    );
    result.saved_id = rows[0].id;
  }
  res.json(result);
});

router.get("/", async (req, res) => {
  const { rows } = await db.query(
    `SELECT id,name,to_char(period_from,'YYYY-MM-DD') AS period_from,to_char(period_to,'YYYY-MM-DD') AS period_to,
            inputs,baseline_kg,projected_kg,created_at FROM scenarios WHERE user_id=$1 ORDER BY id DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ items: rows });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const r = Number.isInteger(id) ? await db.query("DELETE FROM scenarios WHERE id=$1 AND user_id=$2", [id, req.user.id]) : { affectedRows: 0 };
  if (!r.rowCount && !r.affectedRows) throw notFound("Scenario not found");
  res.json({ ok: true });
});

module.exports = router;
