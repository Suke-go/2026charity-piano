# live-audience

Public streaming viewer frontend for `live.letsplayforpeace.com`.

Responsibilities:
- render the Cloudflare Stream player
- render the public moderated comment lane
- post comments to the cloud `live-api`
- follow live updates over SSE
- keep public comment entry free of visitor-facing Cloudflare challenges by default

Main env vars:
- `VITE_API_BASE_URL`
- `VITE_DEFAULT_EVENT_ID`

Pages example:
- `apps/live-audience/.env.pages.example`
