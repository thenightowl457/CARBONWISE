const RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400000;

const toMs = (s) => Date.parse(s + "T00:00:00Z");
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);

function isValidDate(s) {
  return typeof s === "string" && RE.test(s) && !Number.isNaN(toMs(s)) && fmt(toMs(s)) === s;
}
const today = () => fmt(Date.now());
const addDays = (s, n) => fmt(toMs(s) + n * DAY);
// inclusive number of days between two dates
const daysInclusive = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY) + 1;
const startOfWeek = (s) => {
  const dow = (new Date(toMs(s)).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(s, -dow);
};
const monthKey = (s) => s.slice(0, 7);

function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

module.exports = { isValidDate, today, addDays, daysInclusive, startOfWeek, monthKey, eachDay };
