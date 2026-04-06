# live-audience

会場参加者向けのフロントエンドです。

現時点では viewer と admin の画面が同居していますが、将来的には `live-admin` へ管理 UI を分離します。

公開の最小構成では、これを Cloudflare Pages に載せて `live.letsplayforpeace.com` を配ります。

- build: `npm run build -w @charity/live-audience`
- Pages env: `VITE_API_BASE_URL=https://charity-api.kosuke05816.workers.dev`
- env template: `apps/live-audience/.env.pages.example`
