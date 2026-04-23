# local-audience

AP-local audience frontend for prompt-and-answer collection.

Use this app on the local network:
- canonical audience URL: `/`
- explicit audience URL: `/events/:eventId`
- same-host admin fallback: `/admin` and `/admin/events/:eventId`
- mobile-first audience screen with no public comment feed
- black, solemn single-screen layout for smartphone use
- prompt and collection state delivered by `live-updates` SSE plus periodic resync
- local env: `apps/local-audience/.env.example`
- dev: `npm run dev -w @charity/local-audience`
