const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { buildRecommendations } = require("../services/recommendations");
const { parse } = require("../utils/errors");
const { isValidDate, today } = require("../utils/dates");

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const q = parse(z.object({
    days: z.coerce.number().int().min(7).max(365).default(30),
    to: z.string().refine(isValidDate, "Invalid 'to' date").optional(),
  }), req.query);
  res.json(await buildRecommendations(req.user, q.days, q.to || today()));
});

module.exports = router;
