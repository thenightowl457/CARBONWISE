require("dotenv").config({ quiet: true });

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

if (isProd && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}

module.exports = {
  isProd,
  isTest,
  port: Number(process.env.PORT || 5000),
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret-change-me",
  bcryptCost: Number(process.env.BCRYPT_COST || (isTest ? 4 : 10)),
  // DATABASE_URL => real PostgreSQL. Otherwise embedded Postgres (PGlite) is used.
  databaseUrl: process.env.DATABASE_URL || "",
  pgliteDir: process.env.PGLITE_DIR || "./data/pgdata", // "memory" for in-memory
  adminEmail: (process.env.ADMIN_EMAIL || "admin@carbonwise.app").toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "Admin@12345",
  rateLimit: !isTest,
};
