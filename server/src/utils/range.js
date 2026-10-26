const { z } = require("zod");
const { isValidDate, today, addDays, daysInclusive } = require("./dates");
const { parse, AppError } = require("./errors");

const date = (name) => z.string().refine(isValidDate, `${name} must be a real date in YYYY-MM-DD format`);
const MAX_DAYS = 1100;

// Reads ?from=&to= (defaults: current calendar month to date). Used by dashboard & simulator.
function parseRange(query) {
  const t = today();
  const q = parse(z.object({ from: date("from").optional(), to: date("to").optional() }), query);
  const to = q.to || t;
  const from = q.from || (q.to ? addDays(to, -29) : t.slice(0, 8) + "01");
  checkRange(from, to);
  return { from, to };
}
function checkRange(from, to) {
  if (from > to) throw new AppError(400, "'from' must not be after 'to'");
  if (daysInclusive(from, to) > MAX_DAYS) throw new AppError(400, `Date range is too long (max ${MAX_DAYS} days)`);
}

module.exports = { parseRange, checkRange, date };
