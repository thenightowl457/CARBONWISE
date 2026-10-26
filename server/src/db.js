// One tiny wrapper so the rest of the app only knows: query(), exec(), tx().
// DATABASE_URL set  -> real PostgreSQL via `pg`
// otherwise         -> embedded PostgreSQL (PGlite), zero install, same SQL.
const fs = require("fs");
const path = require("path");
const config = require("./config");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
let implPromise = null;

async function create() {
  let impl;
  if (config.databaseUrl) {
    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: config.databaseUrl });
    impl = {
      query: (t, p) => pool.query(t, p),
      exec: (s) => pool.query(s),
      tx: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const r = await fn({ query: (t, p) => c.query(t, p) });
          await c.query("COMMIT");
          return r;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = require("@electric-sql/pglite");
    let db;
    if (config.pgliteDir === "memory") db = new PGlite();
    else {
      fs.mkdirSync(path.dirname(path.resolve(config.pgliteDir)), { recursive: true });
      db = new PGlite(config.pgliteDir);
    }
    await db.waitReady;
    impl = {
      query: (t, p) => db.query(t, p),
      exec: (s) => db.exec(s),
      tx: (fn) => db.transaction((tx) => fn({ query: (t, p) => tx.query(t, p) })),
      close: () => db.close(),
    };
  }
  await impl.exec(schema);
  return impl;
}

const get = () => (implPromise ||= create());

module.exports = {
  init: get,
  query: async (t, p) => (await get()).query(t, p),
  tx: async (fn) => (await get()).tx(fn),
  close: async () => {
    if (!implPromise) return;
    const i = await implPromise;
    implPromise = null;
    await i.close();
  },
};
