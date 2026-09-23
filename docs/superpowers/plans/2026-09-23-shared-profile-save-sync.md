# 共通プロフィール・セーブ同期基盤 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存のPrivateセーブ形式を壊さず、動的プロフィール、親PIN保護、プロフィール別ローカル保存、Private GitHub同期の共通基盤を実装し、わんこ大戦争を最初の移行対象にする。

**Architecture:** ブラウザー内のIndexedDBを利用時の正本とし、Private GitHub repositoryを同期・バックアップ先にする。`profile-manager`、`parent-lock`、`save-store`、`github-sync` を分離し、各アプリへプロフィール固定のSave APIを渡す。親設定は6桁PINのUIロックで保護し、tokenは端末内に平文保存する（同一originスクリプトや開発者ツールから秘匿するものではない）。

**Tech Stack:** 静的HTML/CSS/JavaScript、Web Crypto API、IndexedDB、GitHub REST Contents API、Node.js `node:test`。新しい実行時依存を追加しない。

**Spec:** [docs/superpowers/specs/2026-09-23-shared-profile-save-sync-design.md](../specs/2026-09-23-shared-profile-save-sync-design.md)

## Global Constraints

- 通常利用の正本は端末IndexedDB、Private repositoryは同期・バックアップ先とする。
- 公開repositoryに個人名、具体的プロフィールID/表示名、token、Privateセーブ実データを含めない。
- プロフィール一覧はPrivate repoのschema順序情報と `saves/<profileId>.json` から動的に取得する。
- 実セーブの `profileOrder` 拡張フィールドを含め、読み書きで未知の既存フィールドを保持する。
- 既存のセーブ項目、IndexedDB、Local Storage、WankoCloudの作品同期を一括削除・置換しない。
- Save APIは必須の `profileId` と `appId` でデータを分離する。
- tokenは端末内IndexedDBのみに保存し、GitHub認証ヘッダー以外の通信・ログ・URL・repositoryデータへ出さない。
- 親PINは通常画面から親設定に入れないためのUIロック。XSS、開発者ツール、端末アクセスへの保護とは扱わない。
- SHA/revision競合をlast-write-winsで無断上書きしない。
- 既存プロフィール未割当データを人物へ自動割当しない。親による明示選択後にのみコピーし、旧データを保持する。
- この計画の実装はローカルブランチ内までとし、公開mainへのpush/本番公開は別途指示があるまで行わない。

## 現在の作業ツリーに関する注意

作業ブランチには `app.js`、`styles.css`、`tests/official-wankos.test.js` の未コミット変更がある。これらはユーザー所有の変更として保持し、実装開始時に差分を再確認する。無関係な変更をこの計画のコミットへ含めない。プロフィール画面への追加箇所は既存差分に沿って統合し、既存変更を巻き戻さない。

## Review Focus

- schema v1の実セーブにある未知の `profileOrder` を保存時に落とす → 合成v1 fixtureの読込・更新・再読込でフィールド保持をテスト。
- 不正なPrivate profile IDをパスに連結する → profile ID検証と拒否テストを追加。
- 6桁PINと親設定ロック、5回連続誤入力時の一時停止をテストで固定する。
- GitHub API以外へAuthorizationを送る → fetchモックで許可/拒否ホストごとのヘッダーを検査。
- stale SHAまたは同一appの競合でデータを失う → 競合fixtureでリモート・ローカル双方の保持とconflict状態を検査。

---

### Task 1: Private save契約と互換アダプター

**Files:**
- Create: `shared/save-contract.js`
- Create: `tests/save-contract.test.js`

**Interfaces:**
- `validateProfileId(value)` は安全な単一パスセグメントなら正規化済み文字列、その他はエラーを返す。
- `parseProfileIndex(schema, saveFiles)` はschemaの順序を使い、各saveの `profileId` / `displayName` を対応させたプロフィール表示モデルを返す。未知のprofileはエラー一覧に分ける。
- `normalizeSaveRecord(record, profileId)` は既存項目・未知項目を保持したrecordを返し、プロフィールIDが一致しないデータは拒否する。
- 合成fixtureには一般化したIDと表示名のみを使う。Private repoの実値をテストへ複製しない。

- [ ] **Step 1: 失敗する契約テストを書く。** schema v1とsave v1の合成fixtureを使い、一覧順、表示名の動的解決、profileId照合、余分な `profileOrder` と未知フィールドの保持を検査する。
- [ ] **Step 2: REDを確認する。** `node --test tests/save-contract.test.js` を実行し、未実装exportを理由に失敗することを確認する。
- [ ] **Step 3: 契約関数を実装する。** IDのパスセグメント検査、順序に従うプロフィール対応付け、保存recordの浅い拡張保持を実装する。存在しないsaveを空プロフィールとしてでっち上げない。
- [ ] **Step 4: GREENを確認する。** `node --test tests/save-contract.test.js` を実行し、順序・欠損・追加プロパティのケースが通ることを確認する。
- [ ] **Step 5: Taskをコミットする。** `git diff --check` と該当テスト後に `feat: add compatible private save contract` でコミットする。

### Task 2: 親PINロックと端末token保管

**Files:**
- Create: `shared/parent-lock.js`
- Create: `tests/parent-lock.test.js`

**Interfaces:**
- `createParentLock(storage, cryptoProvider)` は `setupPin(pin)`, `unlock(pin)`, `lock()`, `isUnlocked()`, `storeToken(token)`, `withToken(callback)` を提供する。
- PINは6桁数字。salt付きPBKDF2 verifierを保存し、誤PINを5回連続で入力したら30秒間ロックする。
- tokenは暗号化せず、端末内IndexedDBだけに保存する。親設定UIのロックは子どもの通常操作を防ぐ目的で、devtoolsや同一origin scriptに対する秘密保護とはしない。
- `withToken` は親設定unlock中だけtokenをGitHub通信関数へ渡す。tokenをアプリUI、URL、body、ログへ含めない。

- [ ] **Step 1: REDテストを書く。** 6桁PINの形式、正PIN/誤PIN、5回失敗後の一時ロック、ロック後のtoken利用拒否、tokenが端末内storageだけに入ることをテストする。
- [ ] **Step 2: REDを確認する。** `node --test tests/parent-lock.test.js` を実行し、モジュール未実装で失敗することを確認する。
- [ ] **Step 3: PIN/UI lockを実装する。** Web Crypto PBKDF2-HMAC-SHA-256でPIN verifierを照合し、tokenは端末IndexedDBに保存する。PINやtokenをログ・エラーへ含めない。
- [ ] **Step 4: GREENを確認する。** 暗号providerを注入したNodeテストを通し、PIN verifierは平文でなくtoken保管先は端末内のみであることを確認する。
- [ ] **Step 5: Taskをコミットする。** `git diff --check` と該当テスト後に `feat: add parent pin token vault` でコミットする。

### Task 3: プロフィール別ローカルSave API

**Files:**
- Create: `shared/save-store.js`
- Create: `tests/save-store.test.js`
- Modify: `shared/wanko-library.js` (DB adapter export only if needed; do not change existing record behavior)

**Interfaces:**
- `createSaveStore(adapter)` exposes `get(profileId, appId, key)`, `put(profileId, appId, key, value)`, `getBlob(profileId, appId, key)`, `putBlob(profileId, appId, key, blob)`, `listPending(profileId)`.
- Every record includes validated `profileId`, `appId`, `key`, `updatedAt`, `revision`, and sync state. Binary values are Blobs and are not base64-embedded in profile JSON.
- Existing WankoLibrary DB and global legacy keys remain readable until a verified copy is committed.

- [ ] **Step 1: REDテストを書く。** profile/app/keyの名前空間分離、revision増加、pending一覧、Blob round-trip、異常ID拒否をメモリアダプターで検査する。
- [ ] **Step 2: REDを確認する。** `node --test tests/save-store.test.js` を実行して未実装失敗を確認する。
- [ ] **Step 3: ローカルAPIを実装する。** 注入可能なadapterとブラウザーIndexedDB adapterを分離し、profiles / apps / blobsをtransactionで更新する。
- [ ] **Step 4: GREENを確認する。** 単体テストに加えてIndexedDB adapterをブラウザーで開閉し、profile namespaceが交差しないことを確認する。
- [ ] **Step 5: Taskをコミットする。** 該当テストと `git diff --check` 後に `feat: add profile scoped local save store` でコミットする。

### Task 4: 動的Private profile readerとGitHub同期

**Files:**
- Create: `shared/github-sync.js`
- Create: `shared/profile-manager.js`
- Create: `tests/github-sync.test.js`
- Create: `tests/profile-manager.test.js`
- Create: `shared/for-my-sons-config.js` (repository coordinates only; no profile values or credentials)

**Interfaces:**
- `createGitHubSync({fetchImpl, tokenVault, config, saveStore})` exposes `listProfiles()`, `readProfile(profileId)`, `syncProfile(profileId)`, `restoreProfile(profileId, revision)`.
- `ProfileManager` exposes `listProfiles()`, `current()`, `openSession()`, `switchProfile(profileId)`; session captures an immutable profileId.
- `profileOrder` and saves are fetched from the Private repo at runtime. Repository paths and profile IDs are encoded and validated; API base host is fixed to `api.github.com`.
- All authenticated fetch calls go through one helper that sets `Authorization` only for the allowlisted API URL. Token value never appears in URL/body/log/error text.

- [ ] **Step 1: REDテストを書く。** mocked GitHub Contents API responsesでschema順序、save対応、404/401、悪意あるID、stale SHA、same-app競合、別appの独立更新をテストする。
- [ ] **Step 2: REDを確認する。** `node --test tests/github-sync.test.js tests/profile-manager.test.js` を実行して失敗を確認する。
- [ ] **Step 3: read-only profile取得を実装する。** schemaと`saves/` listを取得し、save-contractで検証する。token未設定/通信不可時は直前に検証済みのローカルprofile summaryを返し、無効データをキャッシュしない。
- [ ] **Step 4: write/conflict経路を実装する。** save fileをContents APIへ更新する前に最新SHA/revisionを確認する。409/422/sha mismatchで自動上書きせずconflict状態を保存する。
- [ ] **Step 5: 認証宛先テストを通す。** fetch mockでGitHub以外のhostにはAuthorizationが決して付かないこと、APIトークンが記録されないことを確認する。
- [ ] **Step 6: Taskをコミットする。** 該当テストと全テスト後に `feat: add private github profile sync` でコミットする。

### Task 5: Private save schemaの加法拡張

**Files:**
- Modify in `plzsayyes3/For-My-Sons-save`: `schema.json`
- Preserve without rewriting: existing `saves/*.json`
- Test in public repo: `tests/save-contract.test.js` synthetic schema v1/v2 cases

**Interfaces:**
- schema v2 documents an `apps` object for profile/app-scoped records and explicitly documents the existing numeric save-level `profileOrder` extension.
- schema v1 save files remain readable; this task does not rename profiles, rewrite display names, regenerate ordering, or touch progress values.
- Only the schema file is changed. No real save body, token, or actual profile values are copied into the public repository or test fixtures.

- [ ] **Step 1: schema v2 compatibility fixtureを追加する。** synthetic v1/v2 schema and save fixtures must demonstrate the old root fields remain intact while `apps` is optional for v1.
- [ ] **Step 2: REDを確認する。** contract tests must fail for undocumented `apps`/`profileOrder` expectations before the v2 contract is added.
- [ ] **Step 3: Private repo branchへschemaだけを更新する。** Create a dedicated branch from the current default branch; update `schema.json` additively; do not commit or rewrite `saves/` files.
- [ ] **Step 4: change contentを確認する。** Compare schema v2 against fetched v1 and verify actual save fields are all accepted; do not expose private profile data in logs.
- [ ] **Step 5: Contract testsを通す。** v1 existing values and v2 apps map both parse; unknown fields round-trip.
- [ ] **Step 6: Private-side branch SHAと変更ファイルを記録する。** Do not merge or publish any profile changes as part of this task.

### Task 6: Launcher親設定UIとプロフィールセッション

**Files:**
- Modify: `index.html`
- Modify: `app.js` (preserve current user edits and complete their intended wiring)
- Modify: `styles.css` (retain and de-duplicate only the duplicated profile-bar rules in the existing dirty diff)
- Create: `shared/profile-settings-view.js`
- Modify: `tests/` (DOM behavior tests or browser test harness)

**Interfaces:**
- Parent settings UI exposes token entry, PIN setup/unlock, dynamic profile list, active profile change, sync status, retry, and conflict/restore entry points.
- Display name is inserted using text nodes; no profile value is checked into public source.
- The normal launcher shows current profile but no child-accessible switching control. The existing pending `setupSharedProfile()` is connected only after these APIs exist.

- [ ] **Step 1: UI behavior testsを書く。** Locked/unlocked state, missing token, empty profile list, profile selection, forbidden switch while locked, and status/error text are covered with generic fake identities.
- [ ] **Step 2: REDを確認する。** Run the specific UI test and verify expected missing DOM/API behavior fails.
- [ ] **Step 3: Add parent settings markup and view.** Add labeled controls with `aria` states; bind event handlers to ProfileManager/GitHubSync, render dynamic values via `textContent`, and never put the token in DOM attributes.
- [ ] **Step 4: Integrate existing user edits.** Preserve current profile-bar CSS and app.js edits; remove duplicate CSS only after re-reading the exact diff and retaining equivalent styling.
- [ ] **Step 5: GREEN and browser verification.** Verify PIN gating, profile switching and fixed open-session identity, re-render indicator, responsive layout, and error paths with synthetic profiles.
- [ ] **Step 6: Taskをコミットする。** Do not stage unrelated user changes; commit only reviewed files as `feat: add parent profile settings`.

### Task 7: Wanko War migration and PWA integration

**Files:**
- Modify: `shared/wanko-game-progress.js`
- Modify: `wanko-war/index.html`
- Modify: `wanko-library/index.html` (read-only profile-scoped encyclopedia state)
- Modify: `service-worker.js`, `apps.json`, and page cache versions
- Create/modify: `tests/wanko-profile-migration.test.js`

**Interfaces:**
- Wanko War obtains an immutable profile session and stores progress at `apps["wanko-war"]` through SaveStore; stage combat remains usable offline.
- First migration copies the existing `wankoGameProgressV1` state only after a parent selects the destination profile; old key remains untouched until remote verification and explicit confirmation.
- Without selected profile, the app continues existing local-only mode and does not attach the legacy record to an arbitrary profile.

- [ ] **Step 1: migration testsを書く。** Existing legacy state copies once into a selected profile, preserves clears/discoveries, does not copy on absent/invalid target, is idempotent, and leaves the old key unchanged.
- [ ] **Step 2: REDを確認する.** `node --test tests/wanko-profile-migration.test.js` must fail before the migration adapter exists.
- [ ] **Step 3: add profile-aware progress adapter.** Route reads/writes to selected profile's Wanko War app record; use profile ID captured at battle start.
- [ ] **Step 4: connect first-run parent migration.** Show a before/after count preview and require explicit parent confirmation before writing profile copy.
- [ ] **Step 5: update PWA shell versions.** Cache new modules and settings page, bump service worker generation, and version all script/page URLs.
- [ ] **Step 6: verify.** Run all tests and browser-check local-only mode, migration, offline battle, account/profile mismatch guard, and existing legacy keys.
- [ ] **Step 7: Taskをコミットする。** Use `feat: migrate wanko progress to shared profiles`.

### Task 8: Full verification and release handoff

**Files:**
- Modify: tests for public-bundle secret/profile scan and end-to-end sync boundaries
- Modify: `docs/superpowers/specs/2026-09-23-shared-profile-save-sync-design.md` only if a verified implementation detail changed

- [ ] **Step 1: Run full automated suite.** `npm test` must pass all legacy and new tests.
- [ ] **Step 2: Run static boundary checks.** Assert no concrete profile values, private save JSON, token, or secret-like credential is in tracked public files; review any false positives manually without printing secrets.
- [ ] **Step 3: Browser-check.** Validate offline local save, PIN lock/unlock, dynamic profile listing with mocked data, parent-only switch, Wanko migration, and status/conflict UI.
- [ ] **Step 4: Verify working tree and commit range.** Ensure uncommitted user edits from `app.js`, `styles.css`, and `tests/official-wankos.test.js` are either deliberately integrated and committed with approval or remain untouched; do not clean them with destructive commands.
- [ ] **Step 5: Report remaining external prerequisites.** Report Private schema branch separately; do not merge/push public main or deploy production unless explicitly requested.

## Acceptance Checklist

- [ ] Public app contains no literal profile identities or token material.
- [ ] The profile list follows Private repo order and dynamically maps records without hardcoded profile entries.
- [ ] Existing save v1 roots and unmodeled fields survive round-trip.
- [ ] Local data is separated by profile and app; offline use is independent of remote availability.
- [ ] Six-digit parent PIN gates settings; token is stored only in local IndexedDB and remains absent from public/Private repository files.
- [ ] Authorization is attached only to allowlisted GitHub API requests.
- [ ] Stale remote SHA/revision becomes a conflict, not a silent overwrite.
- [ ] Legacy Wanko progress is copied only after explicit destination selection and source data is retained.
- [ ] No production push/deployment is performed without a separate request.
