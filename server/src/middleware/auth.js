const jwt = require("jsonwebtoken");
const config = require("../config");
const db = require("../db");
const { AppError } = require("../utils/errors");

const COOKIE = "cw_token";

function cookieOptions() {
  return { httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: 7 * 86400 * 1000, path: "/" };
}
function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: "7d" });
}
function setAuthCookie(res, user) {
  res.cookie(COOKIE, signToken(user), cookieOptions());
}
function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
}

// FR-01 / NFR-01: every protected route runs this. The role is re-read from the
// database on each request so a demoted admin loses access immediately.
async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new AppError(401, "Authentication required");
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new AppError(401, "Session expired or invalid. Please log in again.");
  }
  const { rows } = await db.query(
    "SELECT id,name,email,role,region,distance_unit FROM users WHERE id=$1",
    [payload.sub]
  );
  if (!rows.length) throw new AppError(401, "Account no longer exists");
  req.user = rows[0];
  next();
}

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") throw new AppError(403, "Administrator access required");
  next();
};

module.exports = { requireAuth, requireAdmin, setAuthCookie, clearAuthCookie };
