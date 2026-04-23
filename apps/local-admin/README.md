# local-admin

AP-local admin frontend for prompt publishing and answer review.

Responsibilities:
- create and switch prompts
- publish prompts from the JSON catalog
- open, pause, and close collection
- review and hide submissions
- export local results by scope and format

Local env:
- `apps/local-admin/.env.example`

URL layout:
- canonical admin URL: `/`
- explicit admin URL: `/events/:eventId`
- legacy bookmark compatibility: `/admin/events/:eventId`

Build:
- `npm run build -w @charity/local-admin`
