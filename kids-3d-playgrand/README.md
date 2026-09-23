# 3Dこうさく

For My Sons 内で育てる子ども向け3D工作アプリです。

- Canonical app: https://plzsayyes3.github.io/for_my_sons/kids-3d-playgrand/
- Source of truth: `plzsayyes3/for_my_sons/kids-3d-playgrand/`
- Save repository: `plzsayyes3/For-My-Sons-save`
- Legacy/public snapshot: `plzsayyes3/kids-3d-playgrand`

## Save policy

- 作業中はブラウザの LocalStorage に自動保存
- 明示的な「☁ セーブ」で、現在選択中の For My Sons プロフィールへ保存
- 作品本体の保存先は `For-My-Sons-save/profiles/{profileId}/apps/kids-3d-playgrand/project.json`
- `saves/{profileId}.json` は3D保存では更新しないため、他アプリのセーブと分離される
- 旧 `saves/{profileId}.json > apps.kids-3d-playgrand` が存在する場合のみ、読み込み時に専用ファイルへ移行
- 上書き前の `project.json` は `profiles/{profileId}/apps/kids-3d-playgrand/history/` に世代保存
- バックアップ作成に失敗した場合は現行 `project.json` を上書きしない
- 「☁ ひとつ前」で最新の世代を端末へ開く。クラウド現行版は自動では書き換えない
- クラウド保存は gzip 圧縮し、SHA-256 で破損検知
- 生データ 8MB、保存ファイル約900KBを上限として、GitHub Contents API の通常取得範囲に収める
- 同じ内容を再セーブした場合はコミットを増やさない
- 履歴は最大10世代を目安に保持し、5回ごとに古い世代を整理
- GitHub APIのレート制限は認証エラーと分離し、リセット時刻を案内
- 「☁ よみこむ」で別端末から続きを復元

成熟後に必要なタイミングで公開用リポジトリへ同期します。
