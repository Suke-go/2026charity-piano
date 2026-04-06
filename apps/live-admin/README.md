# live-admin

運営者向けの独立フロントエンドです。

現在は以下を単体で検証できます。
- 受付状態の切替
- 投稿一覧の監視
- 投稿削除
- JSON export

将来これを公開クラウド側へ出す場合は、`live-audience` とは別 Pages project に分ける想定です。

- build: `npm run build -w @charity/live-admin`
- Pages env: `VITE_API_BASE_URL`, `VITE_AUDIENCE_BASE_URL`
- env template: `apps/live-admin/.env.pages.example`
