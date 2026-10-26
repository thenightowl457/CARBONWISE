const config = require("./config");
const app = require("./app");
const { seedAll } = require("./seed");

seedAll()
  .then(() => app.listen(config.port, () => console.log(`CarbonWise API running on http://localhost:${config.port}`)))
  .catch((e) => { console.error("Failed to start:", e); process.exit(1); });
