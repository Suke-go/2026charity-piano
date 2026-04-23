# local-macmini

mac mini local deployment assets.

Contents:
- `nginx/`: local reverse-proxy and vhost examples
- `launchd/`: service launch definitions
- `scripts/`: health-check, backup, and rotation helpers
- `env/`: local service env templates

Expected request flow:
- browsers open `http://live.local` or `http://admin.local`
- nginx serves the built frontend from `apps/local-audience/dist` or `apps/local-admin/dist`
- browser requests to `/api/...` stay on the same host and nginx proxies them to `http://127.0.0.1:8789`
- `local-answer-api` stays loopback-only and is not exposed directly to audience devices

Canonical local URLs:
- `http://live.local/` for the default audience event
- `http://admin.local/` for the default admin event
- `http://live.local/events/<eventId>` for an explicit audience event
- `http://admin.local/events/<eventId>` for an explicit admin event
- `http://live.local/admin` and `http://live.local/admin/events/<eventId>` remain available as same-host admin fallbacks
