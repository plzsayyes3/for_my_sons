# わんこ大戦争 拡張 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存の公式わんこ/自作わんことPWAを保ちながら、118元素ステージ、データ駆動バトル、28枠キャラクター、3タブのわんこ大図鑑を実装する。

**Architecture:** `shared/wanko-game-data.js` に静的な元素・キャラクター・ステージ定義を集約し、`shared/wanko-game-progress.js` に状態の検証と保存APIを置く。バトルと図鑑はこれらのAPIを利用し、進行データは既存IndexedDBの `meta` ストアへ別キーで保存する。

**Tech Stack:** 静的HTML/CSS/JavaScript、IndexedDB、Node.js標準の `node:test`。依存ライブラリとビルド工程は追加しない。

**Spec:** [docs/superpowers/specs/2026-09-23-wanko-war-expansion-design.md](../specs/2026-09-23-wanko-war-expansion-design.md)

## Global Constraints

- 元素はIUPACの実在118元素のみとし、元素IDを原子番号で固定する。
- 優先順は `H, O, C, N, Ca, P, K, S, Na, Cl, Mg, Fe, Si, Al, Cu, Zn, Ti, He, Ne, Ar, Li, F, Br, I, Ag, Sn, Pb, Hg, Ni, Cr, Mn, Co`、残りはAuを除き原子番号順、最後をAuにする。
- キャラクターIDはW01〜W08、E01〜E12、B01〜B08とし、陣営・性能・画像を独立して保持する。
- 進行状態は既存IndexedDBの `meta` ストアに保存し、DB名/バージョン、既存わんこレコード、Cloudスキーマを変えない。
- `futsuu-no-wanko`、`naganeko`、`inusensha` のID・画像・ロード形式・既存選択動線を維持する。
- 味方は右から左、敵は左から右、味方HPは緑、敵HPは赤とする。
- ステージ定義に存在しない敵IDは出現させない。敗北や再戦で既存のクリア記録を消さない。
- `apps.json` とService Workerのシェル/キャッシュ世代を一緒に更新し、オフライン起動を保つ。

## Review Focus

- 元素の順序変更で既存進行記録の対象元素がずれる → 原子番号キーとステージIDの独立性をテストする。
- 破損/旧形式の `meta` 値で図鑑やバトルが起動不能になる → 進行APIの既定値復旧テストを行う。
- イベント時刻の同時発生、再戦時のタイマー初期化で敵の数/順が崩れる → イベント展開と同一ステージ再戦を検証する。
- 未発見敵/元素の描画から隠す情報が漏れる → 未発見時の表示モデルを検証する。
- 公式キャラとローカル自作キャラが同時にある場合に選択状態が変わる → 既存切替イベントと公式アクティブIDの手動回帰確認を行う。

---

### Task 1: ゲーム定義と元素データ検査

**Files:**
- Create: `shared/wanko-game-data.js`
- Create: `tests/wanko-game-data.test.js`
- Create: `package.json`

**Interfaces:**
- `window.WankoGameData` と `module.exports` の両方で同じ `elements`, `stages`, `characters`, `getStage(stageId)`, `getCharacter(id)`, `validateDefinitions()` を公開する。
- `elements` は `{id, atomicNumber, symbol, nameJa, stageId}`、`stages` は `{id, elementId, enemyEvents, traits, baseHp, unlocks}` を持つ。
- 各 `enemyEvent` は `{at, enemyId, count, interval, hpScale, damageScale}` を持つ。
- `characters` の各値は `{id, faction, role, name, placeholder, artwork, stats, unlockAfterStage, legacyWankoId}` を持つ。`artwork` と `stats` は独立する。
- 味方の解放条件はW01/W02を最初から、W03=S010、W04=S020、W05=S035、W06=S050、W07=S075、W08=S100のクリア後とする。
- ステージ特性は `boneIncomeScale` と `enemyBaseHpScale` の数値倍率に限定し、既存の骨収入/敵基地HP計算に適用する。
- `expandEnemyEvents(events)` は出現時刻が同じイベントを含む `{at, enemyId, sequence}` の時系列配列を返す純粋関数とする。
- `package.json` の `test` スクリプトは `node --test tests/*.test.js` とする。

- [ ] **Step 1: 失敗するデータテストを書く。** Node標準テストで、118元素の件数/原子番号の一意性、指定順、AuがS118、28キャラIDと陣営、イベント参照の有効性、存在しないID検索が `null` になることをテストする。元素の期待値はIUPACを照合してテストデータ内に固定する。
- [ ] **Step 2: 新しいテストが期待どおり失敗することを確認する。** `node --test tests/wanko-game-data.test.js` を実行し、未実装のモジュールを理由とする失敗を確認する。
- [ ] **Step 3: 最小の定義モジュールを作る。** 118元素の実データ、28枠、118ステージのイベント/倍率/特性を追加する。ステージIDはプレイ順、元素IDは原子番号由来にし、Stage/Character検索と定義検査を実装する。
- [ ] **Step 4: テストを通す。** `node --test tests/wanko-game-data.test.js` を実行する。重複や参照エラーがあれば定義側を直す。
- [ ] **Step 5: 変更を確認してコミットする。** `git diff --check` と該当テストを再実行し、`feat: add wanko game definitions` でコミットする。

### Task 2: 進行状態APIと互換保存

**Files:**
- Create: `shared/wanko-game-progress.js`
- Create: `tests/wanko-game-progress.test.js`
- Modify: `shared/wanko-library.js`

**Interfaces:**
- `WankoGameProgress.getState()` は `{selectedStageId, discoveredElementIds, clearedStageIds}` を返す。
- `selectStage(stageId)`, `discoverStage(stageId)`, `completeStage(stageId)`, `isStageUnlocked(stageId)`, `isCharacterUnlocked(characterId)` を非同期APIとして公開する。
- モジュールは `createProgressStore(storage, definitions)` をNodeテスト向けに公開し、ブラウザーでは同じロジックを `WankoLibrary.getMeta/setMeta` に接続する。
- 永続化は `WankoLibrary.getMeta(key)` / `setMeta(key,value)` を通し、キーは `wankoGameProgressV1` とする。
- 初期状態ではS001のみ解放。ステージ開始時に選択と発見を記録し、勝利時にクリアを加算する。次ステージの解放は隣接する直前ステージのクリアで判定する。

- [ ] **Step 1: 失敗する進行テストを書く。** メモリ保存器を注入できる純粋な状態処理関数を使い、初期状態、S001以外の未解放拒否、発見、勝利後の次面解放、敗北時のクリア非変更、重複クリアの冪等性、不正保存値の既定値復旧をテストする。
- [ ] **Step 2: テストが仕様どおり失敗することを確認する。** `node --test tests/wanko-game-progress.test.js` を実行する。
- [ ] **Step 3: 状態処理とIndexedDBアダプターを実装する。** 純粋な状態操作をテスト可能にし、ブラウザー側は既存 `meta` ストアの薄い読み書きアダプターを利用する。既存DBバージョン/Cloud同期には触れない。
- [ ] **Step 4: ライブラリAPIを接続する。** `shared/wanko-library.js` に `getMeta` / `setMeta` を公開し、既存関数の振る舞いを変えない。
- [ ] **Step 5: テストを通し、コミットする。** `node --test tests/wanko-game-progress.test.js` とTask 1のテストを実行し、`feat: persist wanko game progress` でコミットする。

### Task 3: バトルをステージ/キャラクター定義へ接続

**Files:**
- Modify: `wanko-war/index.html`
- Modify: `shared/wanko-game-data.js` (必要な定義調整のみ)
- Modify: `tests/wanko-game-data.test.js` (イベント展開の純粋関数テスト)

**Interfaces:**
- バトルはURL `?stage=S001` を読み、なければ進行APIの選択済みステージを使う。
- ステージ一覧/選択UIから未解放面は開始不可。`WankoGameProgress.discoverStage` は開始時、`completeStage` は勝利時に呼ぶ。
- 敵出現はイベント定義から時刻順に消費し、倍率を基礎ステータスに適用する。リスタートは同じstageIdを再読込する。
- 味方8枠は解放状態に応じて表示する。公式/自作の現行カードは既存IDで動作させる。

- [ ] **Step 1: 出現イベント展開の失敗テストを書く。** 同時刻イベント、count/interval、倍率計算、イベント完了後に敵が追加されない条件を純粋関数で固定する。
- [ ] **Step 2: テストの失敗を確認する。** `node --test tests/wanko-game-data.test.js` を実行する。
- [ ] **Step 3: バトルの画面操作とID接続を実装する。** ステージ選択UIを追加し、敵データをE/B ID参照にする。味方/敵の基地方向、移動方向、HP色、画像がある時の左右反転を陣営から決める。能力計算は定義データを読む。
- [ ] **Step 4: 進行と再戦をつなぐ。** 開始/勝利/敗北を進行APIに接続し、勝利だけを記録する。再戦でステージイベント、基地HP、ユニット、時間を初期化する。戦闘中ロードイベントの二重登録を避ける。
- [ ] **Step 5: 自動確認と画面確認を行いコミットする。** データ/状態テストを全実行し、序盤・ボス・S118で開始、勝利、敗北、再戦を確認して `feat: add element stages to wanko war` でコミットする。

### Task 4: わんこ大図鑑の3タブ

**Files:**
- Modify: `wanko-library/index.html`
- Create: `shared/wanko-library-view.js`
- Create: `tests/wanko-library-view.test.js`
- Modify: `assets/wanko-library.svg` (画面名/表記が必要な場合のみ)

**Interfaces:**
- タブは `#allies`, `#enemies`, `#elements` で直接選択できる。
- `WankoGameData` と `WankoGameProgress` から仮キャラ/正式キャラ、発見/未発見、クリア/未クリアを描画する。
- `WankoLibraryView` は `buildAllyCards`, `buildEnemyCards`, `buildElementCards` の純粋関数を公開し、HTML表示文字列ではなく表示モデルを返す。
- 既存の公式/自作キャラ一覧、選択ボタン、同期状態表示、ペイント導線、イベント再描画を維持する。

- [ ] **Step 1: 画面モデルのテストを追加する。** 表示モデル作成関数を純粋化し、未発見では元素名/記号/敵名を隠すこと、発見後に詳細が出ること、正式絵がない枠を仮キャラとすることをテストする。
- [ ] **Step 2: テストの失敗を確認する。** `node --test tests/wanko-library-view.test.js` を実行する。
- [ ] **Step 3: タブUIを実装する。** なかま/てき/元素のタブ、進行表示、発見状態、仮キャラ表示を追加する。表示はテキストノード/DOM APIで構築し、ユーザー名やデータ由来の文字列をHTMLとして解釈しない。
- [ ] **Step 4: 既存キャラ操作を回帰確認する。** 3体の公式わんこと自作わんこの切替、クラウド状態表示、ペイントリンク、タブのURLフラグメント同期を確認する。
- [ ] **Step 5: テストを通してコミットする。** すべてのNodeテストを実行し、`feat: expand wanko encyclopedia` でコミットする。

### Task 5: PWAキャッシュと統合確認

**Files:**
- Modify: `service-worker.js`
- Modify: `apps.json`
- Modify: `wanko-war/index.html` (versioned URL)
- Modify: `wanko-library/index.html` (versioned URL)
- Modify: `tests/` (必要な静的参照検査)

- [ ] **Step 1: 静的参照チェックを追加する。** Service Workerのシェル項目がローカルファイルまたは正しいディレクトリURLに対応し、新しい共有スクリプトがキャッシュ対象であることを検査する。
- [ ] **Step 2: チェックが期待どおり失敗することを確認する。** `node --test tests/static-shell.test.js` を実行する。
- [ ] **Step 3: PWAのバージョンとシェルを更新する。** `CACHE_NAME` を次世代へ進め、新規データ/進行スクリプトと更新済み画面を登録し、`apps.json` の表示名/説明/URLを更新する。
- [ ] **Step 4: 全自動テストとブラウザー確認を行う。** `npm test` と `git diff --check` を実行する。ホームからの遷移、図鑑3タブ、既存公式キャラ、ステージ選択/進行、左右移動/HP色、オフライン時のキャッシュ起動を確認する。
- [ ] **Step 5: 最終差分を確認してコミットする。** `git status`, `git diff`, `git log` を確認し、`feat: update wanko war PWA shell` でコミットする。

## 受け入れチェック

- [ ] 118元素が実在し、原子番号1〜118を一度ずつ含み、S118がAu。
- [ ] S001からS118まで、ステージごとに定義済みイベントだけが発生する。
- [ ] W01〜W08 / E01〜E12 / B01〜B08 が陣営付きで図鑑に現れ、性能を変えずに絵を差し替えられる。
- [ ] 開始時の元素発見、勝利時のクリア/次面解放、敗北と再戦時の既存記録保持。
- [ ] わんこ大図鑑の3タブと未発見/発見済み/クリア表示。
- [ ] 既存の公式わんこ3体、自作わんこ選択、同期状態、ホーム導線が機能する。
- [ ] Service Workerの新キャッシュでオフライン起動できる。
