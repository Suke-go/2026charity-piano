# local-answer-api

`services/local-answer-api` is the AP-local collection backend.

Role:
- issue a prompt inside the venue network
- collect attendee answers for the active prompt
- let admin open, pause, and close local collection
- export local answers with the same envelope format as the cloud side

Current implementation:
- Node HTTP service
- SQLite persistence for events, prompts, collection state, and submissions
- `journal_mode = WAL`
- dev token auth for admin routes
- JSON export built with `@charity/export-core`

Database:
- default path: `var/data/local-answer-api.sqlite`
- override with `LOCAL_ANSWER_DB_PATH`

Endpoints:
- `GET /healthz`
- `GET /api/events/:eventId/bootstrap`
- `POST /api/events/:eventId/submissions`
- `GET /api/admin/events/:eventId/bootstrap`
- `GET /api/admin/events/:eventId/submissions`
- `POST /api/admin/events/:eventId/state`
- `POST /api/admin/events/:eventId/prompt`
- `POST /api/admin/submissions/:submissionId/hide`
- `GET /api/admin/events/:eventId/export`

This service is intentionally separate from `apps/live-api`.
