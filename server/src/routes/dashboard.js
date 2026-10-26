const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { buildSummary } = require("../services/dashboard");
const { parseRange } = require("../utils/range");

const router = express.Router();
router.use(requireAuth);

router.get("/summary", async (req, res) => {
  const { from, to } = parseRange(req.query);
  res.json(await buildSummary(req.user, from, to));
});

module.exports = router;
