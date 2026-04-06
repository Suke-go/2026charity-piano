# export-worker

投稿データの JSON / JSONL / CSV export と backup を担当する非同期ワーカーです。

現在の最小実装:
- admin export API を取得
- `var/exports/.../submissions.json` へ保存
- 単発 CLI として検証可能
