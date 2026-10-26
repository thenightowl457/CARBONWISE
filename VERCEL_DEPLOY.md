# CarbonWise on Vercel (frontend + Express API)

## Vercel project settings
- Root Directory: repository root (`.`), not `client` or `server`
- Framework Preset: Other (or let Vercel detect Vite; the committed `vercel.json` supplies build settings)
- Build Command: `npm run build`
- Output Directory: `client/dist`
- Install Command: `npm --prefix server install && npm --prefix client install --include=dev`

The `api/[...path].js` function forwards `/api/*` requests to the existing Express app.
The SPA rewrite serves `index.html` for client-side routes. The API function is a serverless
function, so it does not run `server/src/server.js` or call `app.listen()`.

## Required Vercel Environment Variables
Set for Production (and Preview if you use preview deployments):
- `NODE_ENV=production`
- `JWT_SECRET` = a long, random secret (do not commit it)
- `DATABASE_URL` = Neon PostgreSQL connection string, including `?sslmode=require`
- `ADMIN_EMAIL` = desired admin email
- `ADMIN_PASSWORD` = a strong admin password

Do not omit `DATABASE_URL`: without it, this app falls back to PGlite, which is not persistent
and is unsuitable for serverless functions. The existing `seedAll()` initializes the schema and
inserts baseline factors/rules/admin when needed. Keep the database connection string private.

## Deploy
1. Commit/push these changes to the GitHub branch connected to Vercel.
2. In Vercel Project Settings > General, set Root Directory to repository root.
3. Add the environment variables above in Settings > Environment Variables.
4. Redeploy from Deployments.
5. Test `https://YOUR-DOMAIN/api/health` (expect JSON with `status: "ok"`), then try signup/login.
6. If API requests fail, inspect the Function logs for the deployment.

Authentication uses an httpOnly cookie with `SameSite=Lax` and `Secure` in production. Since the
frontend and API are same-origin on this deployment, no cross-origin cookie configuration is needed.

## Important
This is a deployment configuration change, not a verified live deployment. Run the build and
test on Vercel after pushing. Vercel's serverless functions have execution/resource limits, so
check logs if initialization or database access times out.
