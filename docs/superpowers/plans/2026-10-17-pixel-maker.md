# Pixel Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本計画では本人が順番に実装する方式を推奨する。実行方式はユーザー確認後に確定する。

**Goal:** 子どもがドット絵を自由に描き、プロフィールごとに保存し、続きを描き、PNGに出せる。
**Architecture:** 既存の静的サイトへpixel-makerを追加する。純粋な描画モデル、プロフィール別保存制御、画面制御を分け、共通APIの変更を避ける。
**Tech Stack:** HTML / CSS / JavaScript / Canvas / Pointer Events / IndexedDB（既存共通API）/ node:test。
**Spec:** docs/superpowers/specs/2026-10-17-pixel-maker-design.md

## Global Constraints
- 標準16×16、作成時に8×8・32×32も選べる。
- ペン・消しゴム・塗りつぶし・元に戻す、24色パレットを設ける。
- 最大50操作を戻せる。保存済みの過去履歴は保持しない。
- appIdはpixel-maker、saveKeyはgallery。
- 保存時のプロフィールIDを固定し、api.save.put(profileId,...)を使う。
- 初版の自動保存保証は同じ端末内とし、端末間自動同期は新たに追加しない。
- PNGは透明背景・整数倍率。グリッドを含めない。
- 新しいサーバー、依存パッケージ、外部サービスを追加しない。
- サイズ変更は保存して新規作成。共通モジュールの仕様は変えない。

## Review Focus
- 保存が遅い間のプロフィール切替: 旧作品が新プロフィールへ混入しない。
- 保存領域の使用不能: 未保存の絵を保持し、再試行できる。
- 壊れた作品データ: 読み込めないデータを空作品で上書きしない。
- キャンバス外へ指を動かした後に離す: 不正座標を書かず、1操作として保存する。
- iOSの共有キャンセル・共有非対応: 保存済み作品を保ち、再度PNGを出せる。

---

## Files
- pixel-maker/model.js: サイズ・色・作品の検証、補間線、塗りつぶし、Undo。
- pixel-maker/store.js: 保存キューと固定プロフィールID、読込・再試行。
- pixel-maker/index.html / style.css / app.js: 子ども用UI、Pointer Events、一覧、PNG。
- assets/pixel-maker.svg: 既存スタイルに合わせたコードによるベクターアイコン。
- apps.json: createカテゴリにアプリ追加。
- service-worker.js: 最新のCACHE_NAMEを更新し、新規アセットをSHELLへ登録。
- tests/pixel-maker-model.test.js / pixel-maker-store.test.js: 純粋モデルと保存の動作確認。
store.jsは設計の保存制御を独立して検証するための追加分割とする。

### Task 1: 描画モデル
**Interfaces**
- createWork(size:8|16|32, id:string, now:string): Work
- validateGallery(value:unknown): Gallery（不正データは例外）
- line(size:number, from:{x,y}, to:{x,y}): number[]（有効なセル番号）
- fill(pixels:Array<string|null>, size:number, index:number, color:string|null): Array<string|null>
- createHistory(limit=50): { push(pixels), undo():pixels|null, clear() }

- [ ] tests/pixel-maker-model.test.jsに上記をrequireするテストを作る。8/16/32で各64/256/1024マス、透明初期値、不正サイズ拒否をassertする。
- [ ] node --test tests/pixel-maker-model.test.jsを実行し、モジュール不在で失敗を確認する。
- [ ] model.jsをUMD形式で実装する。Workはid/name/size/pixels/createdAt/updatedAt、Galleryはversion:1/activeId/works。色は#RRGGBBまたはnullのみ。
- [ ] 線の(0,0)→(3,3)で[0,17,34,51]、負座標とsize以上を除外、塗りつぶしは上下左右のみ、同色置換は内容不変をテストする。
- [ ] 分断領域・透明化・連続ストロークのUndo・51回push後に50回だけ戻せること、重複ID/不正pixels/未定義activeIdの拒否をテストする。
- [ ] 同コマンドで全件成功を確認し、git commit -m "feat: add pixel drawing model"。

### Task 2: 保存制御
**Interfaces**
- consumes: model.validateGallery。
- createGalleryStore(api): { load(profileId), save(profileId,gallery), flush(), retry(), pending() }。
- loadはapi.save.get(profileId,'pixel-maker','gallery')、saveはapi.save.putを使う。呼出時に複製した値を順次保存する。

- [ ] tests/pixel-maker-store.test.jsに偽APIを使うテストを追加する。保存を保留中に別プロフィールへ切替えても各putのprofileIdと内容が一致することをassertする。
- [ ] node --test tests/pixel-maker-store.test.jsでモジュール不在の失敗を確認する。
- [ ] store.jsで固定IDの書き込みキューと再試行を実装する。失敗時は未保存スナップショットを保持し、成功時だけ解消する。
- [ ] 初回データなしと既存不正データを区別し、不正データではthrowしputしないテストを加える。保存失敗→再試行成功、古い保存が新しい保存を上書きしないこともassertする。
- [ ] 同コマンドで成功を確認し、git commit -m "feat: add profile isolated pixel gallery storage"。

### Task 3: 画面・PNG・ホーム統合
**Interfaces**
- consumes: modelとstoreの上記API、ForMySonsShared.createForMySons()。
- produces: ./pixel-maker/?v=1、ホームの「ドットえ」タイル。

- [ ] index.htmlに既存の共通初期化に必要なscriptを順序どおり読み込み、上の道具・中央Canvas・下の24色・作品一覧・保存状態の領域を作る。
- [ ] style.cssでスマホ縦幅へ収め、主要操作44px以上、safe-area、選択の枠、キャンバスのみtouch-action:noneを設定する。
- [ ] app.jsで初期化とプロフィール読込を実装する。読込中は編集不可。データなしだけ新規作品を生成する。読込失敗は再試行を表示し上書きを禁止する。
- [ ] Pointer Eventsで単一pointerIdを追跡し、captureと座標検証、補間線、操作前スナップショット、終了時の保存を実装する。pointercancelも状態を確定する。
- [ ] 作品一覧のサムネイルと再編集、新規作成、サイズを選んだ新規作成、名前保存、Undoを実装する。切替前に保存を完了し履歴をクリアする。
- [ ] 保存状態を「ほぞんちゅう」「ほぞんしたよ」「ほぞんできなかった・もういちど」で表示する。失敗時は絵とプロフィールを保持する。
- [ ] 作品からCanvasを別に作り、各セルを整数倍で512×512に描いてtoBlob('image/png')する。ファイル共有が利用可能なら共有し、それ以外はダウンロード。共有キャンセルは再試行可能なままにする。
- [ ] assets/pixel-maker.svgとapps.jsonのcreate項目を追加する。service-worker.jsの最新番号を1増やし、新規ページ・JS・CSS・アイコンをSHELLへ追加する。
- [ ] npm testで既存を含む全テスト成功を確認する。node --checkで新規JSを検証する。
- [ ] 使用可能なブラウザー環境で390×844と768×1024の画面を確認する。描画→Undo→塗りつぶし→名前変更→一覧→再読込→プロフィール変更を検証する。キャンバス外での指離し・保存失敗・PNG保存のケースも確認する。実機専用の未検証項目は報告する。
- [ ] PNGの透明セルと描いたセル、512×512、グリッド非混入を確認し、ホームタイルの相対パスと新規キャッシュ対象の存在を確認する。
- [ ] git diff --checkと変更差分の自己レビュー後、git commit -m "feat: add kids pixel art maker"。最新リモートを確認し、既存の公開手順に沿って反映する。公開URLの到達とデプロイ結果を確認して報告する。
