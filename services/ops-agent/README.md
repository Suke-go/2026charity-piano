# ops-agent

`mac mini` 上のサービス状態確認と、allowlist 化した運用操作を提供するバックエンドサービスです。

現在の最小実装:
- `GET /health`
- `GET /system`
- `GET /services`
- `POST /services/:name/restart`

本番では `launchctl` 連携へ差し替える前提で、現段階では mock restart を返します。
