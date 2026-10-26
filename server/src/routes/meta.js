const express = require("express");
const { publicCatalog, REGIONS } = require("../catalog");
const router = express.Router();

router.get("/catalog", (req, res) => res.json({ categories: publicCatalog(), regions: REGIONS }));

module.exports = router;
