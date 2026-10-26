# CarbonWise

Personal carbon-footprint dashboard & reduction platform, built from the CarbonWise PRD v1.0.
React (Vite) + Express + PostgreSQL + JWT (httpOnly cookie) + Chart.js.

## Run it
```bash
cp server/.env.example server/.env
npm run install:all
npm run build            # builds the React app; Express then serves it
npm run seed:demo        # optional: demo student (Aarav Sharma) with ~120 days of data
npm start                # http://localhost:5000
```
Logins: `demo@carbonwise.app / Demo@1234` (user), `admin@carbonwise.app / Admin@12345` (admin, from `.env`).

Dev mode (hot reload): `npm run dev:server` and `npm run dev:client` (http://localhost:5173, proxies /api).
Tests: `npm test` (46 API tests covering the PRD section 19 checklist).

## Decisions (PRD Appendix A)
| Decision | Choice |
|---|---|
| Backend | Node.js + Express 5 |
| Database | PostgreSQL. With no `DATABASE_URL`, an embedded Postgres (PGlite) stores data in `server/data/`. Set `DATABASE_URL` to use a real server; same SQL. |
| Auth | bcrypt + JWT in an httpOnly, SameSite=Lax cookie; role re-read from DB each request. Admin is provisioned from `ADMIN_EMAIL`/`ADMIN_PASSWORD` at startup. |
| Recommendation scoring | Estimated reduction (kg CO2e): reduce = co2e x fraction; shift = co2e x fraction - qty x fraction x target factor. Ranked by reduction, then rule priority, then rule key. |
| Scenarios | Optional "save" stores only a snapshot in `scenarios`; activities are never modified. |
| Export / delete | Profile page: JSON export, delete account with password (cascades). |
| Factor versions | Editing creates a new version with an effective date; activities use the version in force on their date. |

## IMPORTANT: verify the emission factors
`server/src/seed.js` has rounded, illustrative factors citing DEFRA/DESNZ, CEA, IEA, Poore & Nemecek.
They are **not audited**. Check every value against its source and correct it in the Admin area before
presenting results as real (the PRD says the team must select and document sources).

## Structure
```
server/src
  catalog.js          activity types, units, conversions, sanity limits
  services/           calc, dashboard, recommendations, simulation, progress (business logic)
  routes/             thin REST handlers (auth, activities, dashboard, ..., admin)
  middleware/auth.js  authentication + admin authorization
  seed.js, schema.sql factor/rule seed data, tables
client/src/pages      Landing, Auth, Dashboard, Activities, Form, Recommendations, Simulator, Progress, Profile, Admin
```
Double-counting rule: EV commute factors already include charging, so don't also log that charging as electricity (shown in the form).

## Known limits
- Energy bills count on the date you choose (not spread over the billing period). "Today" is the server's UTC date.
- Regions: IN and GLOBAL only.
- No "apply scenario to my activities" button: FR-12 says that must be a separate explicit action.
