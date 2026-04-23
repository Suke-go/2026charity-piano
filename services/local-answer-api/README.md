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
- prompt catalog and submission policy loaded from JSON config
- JSON export built with `@charity/export-core`

Database:
- default path: `var/data/local-answer-api.sqlite`
- override with `LOCAL_ANSWER_DB_PATH`

Config:
- default path: `services/local-answer-api/config/local-experiment.json`
- override with `LOCAL_EXPERIMENT_CONFIG_PATH`
- `submissionPolicy.maxLength`
- `submissionPolicy.blockedTerms`
- `promptCatalog[]`

Endpoints:
- `GET /healthz`
- `GET /api/events/:eventId/bootstrap`
- `GET /api/events/:eventId/live-updates`
- `POST /api/events/:eventId/submissions`
- `GET /api/admin/events/:eventId/bootstrap`
- `GET /api/admin/events/:eventId/submissions`
- `GET /api/admin/prompt-catalog`
- `POST /api/admin/events/:eventId/state`
- `POST /api/admin/events/:eventId/prompt`
- `POST /api/admin/submissions/:submissionId/hide`
- `GET /api/admin/events/:eventId/export`

Notes:
- audience SSE is used for prompt and state changes only
- audience clients do not receive other audience comments
- admin prompt creation can use `templateKey` from the JSON catalog
- export supports `scope=all|active_prompt|visible_only`
- export supports `format=json|jsonl|csv`

This service is intentionally separate from `apps/live-api`.
