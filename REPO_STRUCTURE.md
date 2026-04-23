# Repository Structure

Checked on: 2026-04-17

## Git repositories in this directory

### 1. `Charity/` (root monorepo)
- Remote: `origin = https://github.com/Suke-go/2026charity-piano.git`
- Branch: `main`
- Pull status: up to date with `origin/main`
- Current head: `8cee91a`
- Local-only items still present:
  - untracked `.claude/`
  - untracked `apps/live-api/seed-event.sql`

### 2. `charity-api/` (nested standalone repo)
- Independent Git repo, ignored by the root monorepo
- Branch: `master`
- Current head: `4aa8399`
- Remote: not configured
- Shape: standalone Cloudflare Workers project scaffold

### 3. `letsplayforukraine/` (nested standalone repo)
- Independent Git repo, ignored by the root monorepo
- Remote: `origin = https://github.com/Suke-go/letsplayforpeace.git`
- Branch: `main`
- Pull status: updated on 2026-04-17 and now aligned with `origin/main`
- Current head: `a2389af`
- Local change still present:
  - modified `.env.example`

## Root monorepo layout

### `apps/`
- `docs/`
  - design and architecture documents only
  - contains `README.md`, `architecture.drawio`, and `logs/`
- `live-api/`
  - cloud-side collection path
  - current Cloudflare Workers comment pipeline
  - boundary note from README: do not reuse this as the AP-local prompt/answer backend
- `live-audience/`
  - public streaming viewer frontend for `live.letsplayforpeace.com`
  - responsible for Stream player, public moderated comments, cloud comment posting, and SSE updates
- `live-ops/`
  - local operations dashboard
  - talks to `services/ops-agent` for health, system info, service status, and restart actions
- `local-admin/`
  - AP-local admin frontend
  - used for prompt publishing, collection state changes, answer review, and local JSON export
- `local-audience/`
  - AP-local audience frontend
  - used on the local venue network for prompt-and-answer collection

### `packages/`
- `shared/`
  - shared API/types/schema layer
  - contains `api.ts`, `constants.ts`, `schemas.ts`, and `types.ts`
- `export-core/`
  - shared export format/envelope logic
  - intentionally reused by both local and cloud collection domains

### `services/`
- `local-answer-api/`
  - AP-local collection backend
  - Node HTTP service with SQLite persistence
  - manages event bootstrap, prompt state, submissions, moderation, and export
- `export-worker/`
  - worker for JSON / JSONL / CSV export and backup generation
  - writes export artifacts under `var/exports/...`
- `ops-agent/`
  - backend service for the local ops dashboard
  - exposes service/system health and restart endpoints for the local mac mini environment

### `infra/`
- `local-macmini/`
  - deployment assets for the local mac mini environment
  - contains nginx examples, launchd definitions, env templates, and helper scripts

### Runtime/output directories
- `var/`
  - runtime data
  - includes `data/` and `exports/`
- `logs/`
  - local logs and review notes
  - currently includes live-api dev/e2e logs

## Working interpretation

This directory is not one codebase. It is:
- one main monorepo for the event system in `Charity/`
- one separate experimental or standalone Worker repo in `charity-api/`
- one separate public-site repo in `letsplayforukraine/`

Inside the root monorepo, the split is:
- `apps/` = user-facing frontends and cloud entrypoints
- `packages/` = shared reusable code
- `services/` = local backends and workers
- `infra/` = deployment templates for the local venue environment
- `var/` and `logs/` = generated runtime state, exports, and logs
