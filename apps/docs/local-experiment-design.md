# Local Experiment Design

Checked on: 2026-04-17

## Inferred intent

The desired local system is an operator-led live prompt tool, not a public comment board.

What matters most:

- the operator changes one active prompt at a time
- audience phones show that prompt immediately
- audience phones do not show other audience comments
- the phone UI stays usable without scrolling
- the prompt catalog and moderation rules are editable in JSON
- prompt delivery is faster than submission review
- exports can be cut differently depending on the operating situation

## Audience experience

The audience screen should behave like a small ceremonial response card:

- black-based and solemn
- optimized for portrait smartphone use
- fixed-height layout when possible
- one current question
- one short answer box
- one submit action
- no feed, no gallery of other responses

This keeps attention on the current question instead of on other participants.

## Prompt and moderation config

The prompt catalog and submission policy should live in JSON so the experiment can be tuned without touching code.

Recommended config shape:

- `submissionPolicy.maxLength`
- `submissionPolicy.blockedTerms`
- `promptCatalog[]`
  - `key`
  - `title`
  - `description`

Current local implementation:

- default config file: `services/local-answer-api/config/local-experiment.json`
- optional override: `LOCAL_EXPERIMENT_CONFIG_PATH`
- policy is read by the middleware, not hard-coded in the frontend

This gives one place to manage:

- the 80-character limit
- blocked terms
- reusable prompt templates

## Transport split

Use nginx as the stable edge and keep application state in the middleware.

Recommended split:

- nginx
  - serves `local-audience` and `local-admin`
  - proxies `/api/*`
  - keeps SSE unbuffered
- local middleware
  - owns prompt state
  - validates submissions
  - stores submissions
  - emits SSE for prompt/state updates
  - exports stored records

## Traffic balance

The traffic balance should favor prompt delivery over submission fanout.

Recommended behavior:

- audience prompt/state updates: SSE
- audience submission POST: immediate
- admin submission review: polling

Why:

- prompt changes are one-to-many and should feel immediate
- submissions can accumulate quietly in the backend
- admin review can lag slightly without harming the audience experience

Current local implementation follows that direction:

- audience listens on `GET /api/events/:eventId/live-updates`
- SSE only pushes `bootstrap.updated`
- admin review refreshes on an interval instead of receiving every submission over SSE

## Export model

Export is not just backup. It is an operational tool.

Needed export views:

1. full archive
2. active prompt only
3. visible-only
4. per-prompt filtering when needed

Recommended query model:

- `scope=all|active_prompt|visible_only`
- `promptId=<id>`
- `includeDeleted=true|false`
- `format=json|jsonl|csv`

Current local implementation supports:

- `scope=all|active_prompt|visible_only`
- `promptId=<id>`
- `includeDeleted=true|false`
- `format=json|jsonl|csv`

## Hostnames

Avoid `.local` when possible because it overlaps with mDNS / Bonjour.

Preferred names:

- `live.home.arpa`
- `admin.home.arpa`

Fallback for quick tests:

- `live.local`
- `admin.local`
