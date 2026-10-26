const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { buildProgress } = require("../services/progress");
const { parse } = require("../utils/errors");
const { today, addDays, daysInclusive } = require("../utils/dates");
const { checkRange, date } = require("../utils/range");

const router = express.Router();
router.use(requireAuth);

// Default: last 30 days vs the 30 days before. Custom previous period is optional.
router.get("/", async (req, res) => {
  const q = parse(z.object({
    from: date("from").optional(), to: date("to").optional(),
    compare_from: date("compare_from").optional(), compare_to: date("compare_to").optional(),
  }), req.query);
  const to = q.to || today();
  const from = q.from || addDays(to, -29);
  checkRange(from, to);
  const len = daysInclusive(from, to);
  const prevTo = q.compare_to || addDays(from, -1);
  const prevFrom = q.compare_from || addDays(prevTo, -(len - 1));
  checkRange(prevFrom, prevTo);
  res.json(await buildProgress(req.user, from, to, prevFrom, prevTo));
});

module.exports = router;
