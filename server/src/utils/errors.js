class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
const badRequest = (m, d) => new AppError(400, m, d);
const notFound = (m = "Not found") => new AppError(404, m);

function zodDetails(err) {
  const seen = new Set(); // one message per field is enough for the UI
  return err.issues
    .map((i) => ({ field: i.path.join(".") || "(body)", message: i.message }))
    .filter((d) => !seen.has(d.field) && seen.add(d.field));
}

// Parse with a zod schema; throws a 400 with per-field messages (FR-04).
function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) throw new AppError(400, "Validation failed", zodDetails(r.error));
  return r.data;
}

module.exports = { AppError, badRequest, notFound, parse };
