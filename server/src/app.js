const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const { AppError } = require("./utils/errors");

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ status: "ok", app: "CarbonWise API" }));
app.use("/api/meta", require("./routes/meta"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/activities", require("./routes/activities"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/recommendations", require("./routes/recommendations"));
app.use("/api/simulations", require("./routes/simulations"));
app.use("/api/progress", require("./routes/progress"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Serve the built React app when it exists (single-process deploys / demos).
const dist = path.join(__dirname, "..", "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === "GET" ? res.sendFile(path.join(dist, "index.html")) : next()));
}

// One error shape for every failure: { error, details? }  (NFR-04)
app.use((err, req, res, next) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Request body is not valid JSON" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
});

module.exports = app;
