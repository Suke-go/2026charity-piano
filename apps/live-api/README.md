# live-api

`apps/live-api` is the cloud-side collection path.

Current state:
- it still contains the existing Cloudflare Workers comment pipeline
- it is the place that should evolve toward YouTube comment ingestion
- it must not be reused as the AP-local prompt/answer backend

Boundary:
- local AP collection: `services/local-answer-api`
- cloud collection: `apps/live-api`
- shared logic only: `packages/export-core`

This means the repository now treats export as the only intentional overlap between the local and cloud collection domains.
