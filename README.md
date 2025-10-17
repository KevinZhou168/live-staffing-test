# IBC OrgOps — Staffing (OrgOps) Platform

This repository contains the initial OrgOps staffing interface for IBC (formerly the "live-staffing-test" project). It provides a real-time drafting UI and backend to coordinate Student Managers (SMs) as they staff consultants into projects. The platform is intentionally lightweight and easy to run locally while being ready to scale and integrate with production services (Postgres, Google Sheets, Cloud SQL, etc.).

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
- Docker / deployment notes
- Environment variables
- How the draft works (behavior & algorithms)
- Data model & files
- Security & operational considerations
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
- `Dockerfile`, `startup-script.sh` — deployment helpers
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

2) Create a `.env` file at the project root with the required environment variables (see the Environment section below). For a quick local demo you can point `PG_*` to a local Postgres or mock them and prepopulate `server/data/` files.

3) Start the server

```bash
npm run dev
# or for production mode
npm start
```

4) Open http://localhost:3000 in your browser. The login modal expects a valid SM ID and the current semester code (join code). Use the fixtures in `server/data/` if the database isn't available.

## Docker / deployment notes

This repo includes a `Dockerfile` and `startup-script.sh` to help with deployment. The server expects the environment to provide Postgres credentials (or Cloud SQL connection name) and the Google Sheets webhook URL.

Important signals for production
- bind to 0.0.0.0 and read port from `PORT`
- configure `BASE_API_URL` and `BASE_SOCKET_URL` for client/server to talk when proxied
- set `JOIN_CODE` to a secure passcode different from the semester value (or integrate with SSO)

## Environment variables

Create a `.env` with the following (example):

```
PORT=3000
BASE_API_URL=http://localhost:3000
BASE_SOCKET_URL=http://localhost:3000
PG_USER=your_user
PG_PASSWORD=your_password
PG_DB=your_db
PG_HOST=localhost
PG_PORT=5432
INSTANCE_CONNECTION_NAME=project:region:instance    # optional when using Cloud SQL
SHEET_HISTORY_URL=https://example.com/your-sheet-endpoint
JOIN_CODE=2025sp
FRONTEND_ORIGIN=http://localhost:3000
```

Notes
- `PG_HOST` defaults to `/cloudsql/${INSTANCE_CONNECTION_NAME}` if not provided — this allows running with Cloud SQL socket when deployed to GCP.
- `SHEET_HISTORY_URL` is the endpoint the server uses to post staffing actions and to import historical rows.

## How the draft works (behavior & algorithms)

Flow summary
- SMs connect to the Socket.IO server and 'register' with their SM ID and join code.
- When an SM triggers 'start draft', the server queries Postgres for projects and consultants for the given semester and writes snapshots to `server/data/*.js`.
- The server randomizes draft order with a Fisher–Yates shuffle (`shuffleArray`) and cycles turns according to the implementation in `socketHandler.js`.
- When a user picks a consultant, the server validates turn ownership, confirms the consultant/project are valid, updates the in-memory `smProjectsMap`, and posts the action to Google Sheets.
- Finalization posts the remaining consultants and imports sheet history back into Postgres using `import-project-data`.

Edge cases handled
- Disconnected SMs: the server preserves SM draft slots when they disconnect and allows rejoin by SM ID.
- Duplicate picks: server tracks `draftedConsultants` to prevent choosing an already-picked consultant.
- Retry on external calls: `staffingHistoryHandler.fetchWithRetry` implements retries/timeouts for posting to the sheet.

Turn rotation rules (short)
- The server implements a snake-like order with special handling for initial/second turns and deferrals; see `rotatePrivileges` in `server/logic/socketHandler.js` for the exact rules.

## Data model & important files

- `users` table: users have `user_id`, `name`, `email`, and `curr_role` (NC/EC/SM/PM/SC)
- `consultants` table: consultant metadata (availability bitmasks, score, interests)
- `projects` table: project metadata and assigned roles (pm_id, sc1_id, sc2_id)
- `consultant_projects` join table: persistent staffing assignments (`user_id`, `project_id`, `role`)

The server reads DB rows and materializes `server/data/*.js` files for fast in-memory access during the draft. These files are overwritten whenever `start-draft` runs.

## Security & operational considerations

- Do not commit `service-account.json` or other secrets. I noticed a `service-account.json` file in the repo root — ensure it is stored out-of-repo and loaded via environment or secret manager in production.
- Limit CORS origins in production (`FRONTEND_ORIGIN`). The dev default is `*`.
- Harden `JOIN_CODE` or replace it with an SSO flow for production-grade authentication.
- Rate-limit and monitor the `SHEET_HISTORY_URL` endpoint to avoid hitting quotas or leaking PII.

## Tests & verification (recommended)

This repo doesn't include an automated test suite yet. Recommended minimal tests:

- Unit tests for `draftUtils.shuffleArray` and turn rotation logic (mock `draftState` and `socketHandler` behavior).
- Integration test: start server, mock DB responses, simulate socket clients to cover registration, start draft, pick, defer, disconnect/rejoin.

## Next steps / roadmap

- Add automated tests (unit + integration) and a CI pipeline.
- Replace join-code with SSO or token-based auth.
- Add RBAC and admin interfaces for seeding/clearing drafts.
- Move transient data storage from `server/data/*.js` to a Redis cache for better concurrency and horizontal scaling.
- Strengthen Google Sheets integration or replace it with a proper event store / audit log (Cloud Logging, BigQuery, or a dedicated audit table).
- Add a small admin UI to review and approve imports before committing to Postgres.

## Who to contact

If you're reviewing this repo, please open an issue or contact the maintainers listed in the project settings.
