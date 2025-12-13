# IBC OrgOps — Staffing (OrgOps) Platform

This repository contains the initial OrgOps staffing interface for Illinois Business Consulting (IBC). It provides a real-time drafting UI and backend to coordinate Senior Managers (SMs) as they staff consultants into projects every semester. The platform is intentionally lightweight and easy to run locally while being ready to scale and integrate with production services (Postgres, Google Sheets, Cloud SQL, etc.).

Key goals in this repo:
- Provide a live, turn-based draft for staffing projects.
- Support real-time collaboration using Socket.IO.
- Persist draft and historical actions to a Postgres-backed database and to Google Sheets for audit/history.
- Keep a simple, testable developer experience (local-first, Docker-ready).

Table of contents
- What this is
- Tech stack
- High-level architecture
- Repo layout
- Getting started (local)
- Deployment notes
- Environment variables
- How the draft works (behavior & algorithms)
- Data model & files
- Security & operational considerations
- Tests & verification
- Next steps and roadmap

## What this is

IBC OrgOps (staffing) is a small platform to run an interactive staffing draft. Student Managers join a lobby, the draft order is randomized, and SMs pick consultants into project roles (NC/EC). The system records picks to Google Sheets and can import finalized staffing into the database.

The codebase focuses on clarity and pragmatic design — it uses familiar libraries and plain JavaScript to lower onboarding friction.

## Tech stack

- Node.js (18+) — runtime
- Express — HTTP server and static file hosting
- Socket.IO — real-time client/server communication (draft lobby, turn updates, picks)
- PostgreSQL (via `pg`) — primary relational datastore (projects, users, consultant_projects)
- Google Sheets webhook endpoint — used for history/audit (see `SHEET_HISTORY_URL`)
- Frontend: plain HTML/CSS/vanilla JS (in `public/`) — small, dependency-free UI
- Dev tooling: nodemon for local dev

This project intentionally avoids heavy frontend frameworks to keep the code visible and easy to modify for new OrgOps features.

## High-level architecture

- Clients (browser) load `public/index.html` and connect to the Socket.IO server.
- HTTP endpoints (Express) provide lightweight APIs used by the client for validation and by server-side background tasks (start draft, import history).
- The server fetches consultant/project data from Postgres, writes ephemeral JSON modules under `server/data/` for fast in-memory reload during a draft, and posts staffing actions to Google Sheets for auditability.
- When the draft finalizes, the server can import sheet history back into Postgres to persist staffing assignments.

ASCII diagram

Client browsers
	↕ Socket.IO
Express + Socket.IO server (server.js)
	↕
 Postgres (pg)  — primary DB
	↕
 server/data/*.js (ephemeral snapshots used during a draft)
	↕
 Google Sheets (SHEET_HISTORY_URL) — audit/history

## Repo layout

- `server.js` — Express + Socket.IO entrypoint and HTTP API endpoints
- `db.js` — Postgres Pool configuration (reads env vars)
- `public/` — frontend assets (HTML/CSS/JS). Key files:
	- `public/index.html` — main UI
	- `public/js/app.js` — client logic (socket event handlers, renderers)
- `server/logic/` — draft engine and helpers
	- `socketHandler.js` — socket event wiring, draft flow, pick logic
	- `draftState.js` — in-memory draft state
	- `draftUtils.js` — utility functions (shuffle)
	- `staffingHistoryHandler.js` — resilient calls to Google Sheets endpoint
- `server/data/` — generated JS snapshots (projects.js, consultants.js, smData.js, etc.)
- `lib/types/` — TypeScript-like data shapes used by developers (not enforced at runtime)
- `test-deployment.sh` — pre-deployment testing script
- `DEPLOYMENT_QUICKREF.md` — quick reference for deployment and monitoring
- `package.json` — dependencies and start scripts

## Getting started (local)

Minimum prerequisites
- Node.js 18+ (the project lists node in package.json)
- PostgreSQL (optional for a limited local demo; otherwise the project can be run with prepared `server/data/*.js` snapshots)

Local quickstart

1) Install dependencies

```bash
npm install
```

2) Create a `.env` file at the project root with the required environment variables (see the Environment section below). For a quick local demo you can point `PG_*` to a local Postgres or mock them and prepopulate `server/data/` files. If you want to connect to a database on CloudSQL, make sure your IP is accepted by the database instance.

3) Start the server

```bash
npm run dev
# or for production mode
npm start
```

4) Open http://127.0.0.1:3000 in your browser. The login modal expects a valid SM ID and the current semester code (join code). Use the fixtures in `server/data/` if the database isn't available.

## Deployment notes

The server expects the environment to provide Postgres credentials (or Cloud SQL connection name) and the Google Sheets webhook URL.

Important configuration for production:
- Server binds to `0.0.0.0` and reads port from `PORT` env var
- Configure `BASE_API_URL` and `BASE_SOCKET_URL` for client/server communication when proxied
- Set `JOIN_CODE` to match the current semester (e.g., `fa25` for Fall 2025)
- Use PM2 or similar process manager for restarts and monitoring
- **Important**: Use PM2 hard restart sequence (`pm2 stop → pm2 delete → pm2 start`) to clear module cache and avoid phantom drafters

## Environment variables

Create a `.env` with the following:

**For local development:**
```
PORT=3000
BASE_API_URL=http://127.0.0.1:3000
BASE_SOCKET_URL=http://127.0.0.1:3000
FRONTEND_ORIGIN=http://127.0.0.1:3000
PG_USER=your_pg_user
PG_PASSWORD=your_password
PG_DB=your_db
PG_HOST=your_database_IP
PG_PORT=5432
INSTANCE_CONNECTION_NAME=your-project:region:instance-name
SHEET_HISTORY_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
JOIN_CODE=fa25
```

**For GCP VM deployment:**
```
PORT=3000
BASE_API_URL=http://127.0.0.1:3000
BASE_SOCKET_URL=http://YOUR_VM_IP:3000
FRONTEND_ORIGIN=http://YOUR_VM_IP:3000
PG_USER=your_pg_user
PG_PASSWORD=your_password
PG_DB=your_db
PG_HOST=/cloudsql/your-project:region:instance    # Unix socket for Cloud SQL Proxy
PG_PORT=5432
INSTANCE_CONNECTION_NAME=your-project:region:instance
SHEET_HISTORY_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
JOIN_CODE=fa25
```

**Important notes:**
- Local development connects directly to Cloud SQL via IP (`PG_HOST=12.34.567.89`)
- Production deployment uses Cloud SQL Proxy via Unix socket (`PG_HOST=/cloudsql/...`)
- `SHEET_HISTORY_URL` must be updated each time you redeploy the Google Apps Script
- `JOIN_CODE` should be changed each semester (e.g., `fa25`, `sp26`, etc.)
- All URLs use `http://127.0.0.1:3000` for local development (not `localhost`)

## How the draft works (behavior & algorithms)

Flow summary
- SMs connect to the Socket.IO server and 'register' with their SM ID and join code.
- When an SM triggers 'start draft', the server queries Postgres for projects and consultants for the given semester and writes snapshots to `server/data/*.js` **in the background** (non-blocking).
- The server waits up to 10 seconds for data files to be written before proceeding with the draft.
- The server randomizes draft order with a Fisher–Yates shuffle (`shuffleArray`) and cycles turns according to the implementation in `socketHandler.js`.
- When a user picks a consultant, the server validates turn ownership, confirms the consultant/project are valid, updates the in-memory `smProjectsMap`, and **queues** the action to Google Sheets (batched every 2 seconds).
- Finalization posts the remaining consultants and imports sheet history back into Postgres using `import-project-data`.

**Performance improvements:**
- **Non-blocking Google Sheets**: Picks no longer wait for Google Sheets API (50-200x faster)
- **Pick mutex**: Prevents race conditions when multiple SMs pick simultaneously
- **Background file writes**: Draft starts immediately without waiting for file I/O
- **State reset on startup**: Clears phantom drafters from previous sessions

**Important user-facing behavior:**
- **Reconnection grace period**: If an SM disconnects **before** the draft starts, they have **5 seconds** to reconnect before being removed from the lobby
- **During-draft disconnection**: If an SM disconnects **during** the draft, they remain in the draft order and can rejoin at any time by re-registering with the same SM ID
- **Data validation**: The system validates that all consultants and projects loaded successfully before starting the draft
- **Google Sheets delay**: Sheet updates are batched and may appear 2 seconds after picks (this is expected and normal)

Edge cases handled
- Disconnected SMs: the server preserves SM draft slots when they disconnect and allows rejoin by SM ID.
- Duplicate picks: server tracks `draftedConsultants` to prevent choosing an already-picked consultant.
- Retry on external calls: `staffingHistoryHandler.fetchWithRetry` implements retries/timeouts for posting to the sheet.
- Phantom drafters: server resets state on startup and validates socket connections.

Turn rotation rules (short)
- The server implements a snake-like order with special handling for initial/second turns and deferrals; see `rotatePrivileges` in `server/logic/socketHandler.js` for the exact rules.

## Data model & important files

- `users` table: users have `user_id`, `name`, `email`, and `curr_role` (NC/EC/SM/PM/SC)
- `consultants` table: consultant metadata (availability bitmasks, score, interests)
- `projects` table: project metadata and assigned roles (pm_id, sc1_id, sc2_id)
- `consultant_projects` join table: persistent staffing assignments (`user_id`, `project_id`, `role`)

The server reads DB rows and materializes `server/data/*.js` files for fast in-memory access during the draft. These files are overwritten whenever `start-draft` runs.

## Security & operational considerations

- Do not commit secrets or credentials to the repository. Use environment variables or secret managers.
- Limit CORS origins in production (`FRONTEND_ORIGIN`). The dev default is `*`.
- Change `JOIN_CODE` each semester to prevent unauthorized access from previous semesters.
- Rate-limit and monitor the `SHEET_HISTORY_URL` endpoint to avoid hitting Google Apps Script quotas.
- Use PM2 or similar process manager for automatic restarts and log management in production.

## Tests & verification

This repo doesn't include an automated test suite yet. Future developers on this project should implement the following minimal tests:

- Unit tests for `draftUtils.shuffleArray` and turn rotation logic (mock `draftState` and `socketHandler` behavior).
- Integration test: start server, mock DB responses, simulate socket clients to cover registration, start draft, pick, defer, disconnect/rejoin.

## Next steps / roadmap

**Completed improvements:**
- ✅ Non-blocking Google Sheets integration with queued writes
- ✅ Pick mutex to prevent race conditions
- ✅ Background file writes on draft start
- ✅ State reset on server startup to clear phantom drafters
- ✅ Data validation before draft starts
- ✅ Pre-deployment testing script

**Future enhancements:**
- Add automated tests (unit + integration) and a CI pipeline
- Replace join-code with SSO or token-based auth
- Add RBAC and admin interfaces for seeding/clearing drafts
- Move transient data storage from `server/data/*.js` to Redis cache for better concurrency and horizontal scaling
- Strengthen Google Sheets integration or replace it with a proper event store / audit log (Cloud Logging, BigQuery, or a dedicated audit table)
- Add a small admin UI to review and approve imports before committing to Postgres
- Add WebSocket ping timeout configuration for better connection stability

## Who to contact

If you're reviewing this repo, please open an issue or contact the maintainers listed in the project settings.
