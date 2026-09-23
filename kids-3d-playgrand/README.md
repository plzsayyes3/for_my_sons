# 3Dこうさく

For My Sons 内で育てる子ども向け3D工作アプリです。

- Canonical app: https://plzsayyes3.github.io/for_my_sons/kids-3d-playgrand/
- Source of truth: `plzsayyes3/for_my_sons/kids-3d-playgrand/`
- Save repository: `plzsayyes3/For-My-Sons-save`
- Legacy/public snapshot: `plzsayyes3/kids-3d-playgrand`

## Save policy

- 作業中はブラウザの LocalStorage に自動保存
- 明示的な「☁ セーブ」で、現在選択中の For My Sons プロフィールへ保存
- 保存先は `For-My-Sons-save/saves/{profileId}.json` の `apps.kids-3d-playgrand`
- 「☁ よみこむ」で別端末から続きを復元

成熟後に必要なタイミングで公開用リポジトリへ同期します。
