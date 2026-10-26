// Vercel catch-all function for the existing Express API.
// Use a persistent PostgreSQL database (DATABASE_URL); PGlite memory is not
// suitable for serverless invocations.
const app = require("../server/src/app");
const { seedAll } = require("../server/src/seed");

let initialization;
module.exports = async function handler(req, res) {
  try {
    initialization ||= seedAll();
    await initialization;
    return app(req, res);
  } catch (error) {
    console.error("CarbonWise API initialization failed:", error);
    return res.status(500).json({ error: "Server initialization failed" });
  }
};
