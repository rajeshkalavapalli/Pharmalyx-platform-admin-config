# Pharmalyx Platform API (Pharmalyx-platform-admin-config)

### V 1.0.0

- updated one to many organisations


### V 1.0.1

- Ready for Render + Azure SQL: `DB_ENCRYPT=true` for Azure, `CORS_ORIGINS` to allow only the hosted platform admin page


### V 1.0.2

- Security headers with helmet and trust proxy
- CORS: when CORS_ORIGINS is not set on a hosted server, only the platform admin web app may call the API; local machines allow any origin


### V 1.0.3

- GET /platform/overview (controllers/Overview): totals (companies, active, paused, new this month, seats used, visits and people working this week), companies joined per month (12 months), visits per day across companies (14 days), attention lists (near the seat limit, quiet / idle, paused) and per-company health
- Per-company usage is counts only: visits in 7 / 30 days, people who logged a visit this week, orders in 30 days, last activity; health = Working / Quiet / Idle / Paused


### V 1.0.4

- create-platform-admin script: arrow-key escape codes and control characters are removed from the typed username / name / password answers


### V 1.0.5

- Fix "Failed to sign in" after a deploy: the database pool was created once at start-up, so if Azure SQL was still waking up every request kept failing until a restart; now a failed connection is retried (warm-up every 5 s, and each request starts a fresh attempt), with a 30 s connection timeout - same as the main API
