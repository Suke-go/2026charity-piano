# live-api

`apps/live-api` is the cloud-side collection path.

Current state:
- it still contains the existing Cloudflare Workers comment pipeline
- it is the place that should evolve toward YouTube comment ingestion
- it must not be reused as the AP-local prompt/answer backend
- public comment posting does not require a visitor-facing Turnstile challenge by default; use WAF/rate limits, room state, slow mode, moderation, and session deduplication as the normal defense line
- set `PUBLIC_COMMENT_TURNSTILE_REQUIRED=true` only if a future event explicitly accepts that UX tradeoff and the audience frontend/CSP are updated for the challenge flow
- live audience traffic should use the same-origin route `https://live.letsplayforpeace.com/api/*`; direct `workers.dev` calls are retained only as a fallback for development and debugging

Boundary:
- local AP collection: `services/local-answer-api`
- cloud collection: `apps/live-api`
- shared logic only: `packages/export-core`

This means the repository now treats export as the only intentional overlap between the local and cloud collection domains.
