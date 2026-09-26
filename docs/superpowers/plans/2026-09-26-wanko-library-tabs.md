# わんこ大図鑑「自作 / 所持」分岐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存の「なかま / てき / 元素」構造を維持し、「なかま」を自作と所持に分け、自作だけを復元可能なアーカイブ対象にする。

**Architecture:** 既存のローカルわんこ保存を小さなテスト可能なストアAPIとして整理し、`archiveWanko`と`characterRequestId`を追加する。図鑑の純粋なカードモデルは`shared/wanko-library-view.js`に置き、HTML側はトップレベルタブと「なかま」内部タブの表示・確認UIだけを担当する。正式キャラクター、ゲーム進行、登録依頼は読み取り・参照境界を越えない。

**Tech Stack:** Vanilla JavaScript, IndexedDB, Node.js built-in test runner, service worker cache.

**Spec:** `docs/superpowers/specs/2026-09-26-wanko-library-tabs-design.md`

## Global Constraints

- トップレベルの「なかま / てき / 元素」は維持する。
- 自作は`WankoLibrary.listWankos()`のローカルわんこだけを表示する。
- 所持は正式キャラクターと既存のゲーム進行で解放済みのキャラクターを表示する。
- 自作削除は物理削除せず`archived: true`で復元可能にする。
- 登録依頼は`characterRequests`と`character-requests/pending/<requestId>/`を変更しない。
- 正式キャラクター、Wanko War進行、118元素ステージの保存形式を変更しない。
- 既存の未コミット変更（`wanko-library/index.html`、`wanko-war/index.html`）を上書き・コミットしない。

## Review Focus

- 依頼保存後に図鑑保存が失敗しても、登録依頼を削除しない — Task 1/3 tests.
- 使用中の自作をアーカイブしてもactive IDが削除済みのまま残らない — Task 1 tests.
- 旧自作レコードに`characterRequestId`がなくても勝手に依頼を作らない — Task 2/3 tests.
- 正式・ゲーム内カードが自作削除操作へ混入しない — Task 2/3 tests.
- `profile-sora`などプロフィール別進行が図鑑再描画・自作アーカイブで変わらない — Task 4 tests.

### Task 1: Local Wanko Store Extensions

**Files:**
- Create: `shared/wanko-library-store.js`
- Modify: `shared/wanko-library.js`
- Create: `tests/wanko-library-store.test.js`

**Interfaces:**
- Consumes: adapter `{ get(store, key), put(store, value, key), list(store) }`, optional `clock()` and `onChange` callback.
- Produces: `createWankoLibraryStore(options)` with `registerWanko(input)`, `listWankos()`, `getWanko(id)`, `getMeta(key)`, `setMeta(key, value)`, `setActiveWanko(id)`, `getActiveWanko()`, and `archiveWanko(id)`.
- `registerWanko` accepts optional `characterRequestId` and persists it without copying request JSON or artwork into another store.
- `archiveWanko` returns the archived record and chooses the newest remaining non-archived local wanko as active, or clears active state when none remains.

- [ ] **Step 1: Write failing store tests**
  - Assert registration preserves `characterRequestId`.
  - Assert archiving sets `archived: true`, retains the record, excludes it from `listWankos()`, and switches/clears active state safely.
  - Assert archiving a record does not call or mutate a separate `characterRequests` adapter.
- [ ] **Step 2: Run the store tests and verify they fail**

Run: `node --test tests/wanko-library-store.test.js`

Expected: FAIL because the store module and archive API do not exist.
- [ ] **Step 3: Implement the store and browser adapter**
  - Move the existing IndexedDB operations behind the store interface without changing the database name, version, store names, or existing cloud sync calls.
  - Keep `listWankos()` filtering `archived === true` and retain existing `WankoLibrary` global methods.
  - Make `setActiveWanko(null)` clear the active metadata and avoid cloud active-wanko updates for null.
- [ ] **Step 4: Run the store tests and verify they pass**

Run: `node --test tests/wanko-library-store.test.js`

Expected: PASS with no request-store writes.
- [ ] **Step 5: Commit the store unit**

```bash
git add shared/wanko-library-store.js shared/wanko-library.js tests/wanko-library-store.test.js
git commit -m "feat: archive local wankos safely"
```

### Task 2: Custom and Owned Card Models

**Files:**
- Modify: `shared/wanko-library-view.js`
- Modify: `tests/wanko-library-view.test.js`

**Interfaces:**
- Consumes: local wankos, active local wanko, official catalog rows, and existing `buildAllyCards` output.
- Produces: `buildCustomCards(wankos, { activeId, requestIds })` and `buildOwnedCards({ officials, gameCards })`.
- Custom card fields include `source: 'custom'`, `deletable: true`, `active`, `createdAt`, `characterRequestId`, and `requestSubmitted`.
- Owned card fields include `source: 'official' | 'game'`, `deletable: false`, and the existing name/image/unlock presentation fields.

- [ ] **Step 1: Write failing model tests**
  - Assert custom cards contain only local records and mark request status from matching IDs.
  - Assert old local records without a request ID remain visible but are not request-submitted.
  - Assert owned cards combine official and unlocked game cards and never expose deletion capability.
- [ ] **Step 2: Run the focused model tests and verify they fail**

Run: `node --test tests/wanko-library-view.test.js`

Expected: FAIL because the new model functions do not exist.
- [ ] **Step 3: Implement pure card builders**
  - Preserve `buildAllyCards`, `buildEnemyCards`, and `buildElementCards` behavior.
  - Filter game ally cards to `unlocked === true` for owned cards; do not mutate progress.
  - Use the active local ID and request ID set only for presentation fields.
- [ ] **Step 4: Run the focused model tests and verify they pass**

Run: `node --test tests/wanko-library-view.test.js`

Expected: PASS, including the existing 118-element and enemy-card assertions.
- [ ] **Step 5: Commit the model unit**

```bash
git add shared/wanko-library-view.js tests/wanko-library-view.test.js
git commit -m "feat: split custom and owned wanko cards"
```

### Task 3: 図鑑 UI and Paint Linking

**Files:**
- Modify: `wanko-library/index.html`
- Modify: `paint/app.js`
- Modify: `tests/paint-character-request.test.js`
- Create or modify: `tests/wanko-library-page.test.js`

**Interfaces:**
- Consumes: `WankoLibrary` store APIs, `WankoLibraryView` card models, `OfficialWankos`, `WankoGameData`, and read-only `characterRequests.get` through the existing shared facade.
- Produces: internal `data-subtab="custom|owned"` controls only when the top-level tab is `allies`; confirmation UI with exact deletion copy; redraw after archive.

- [ ] **Step 1: Write failing page and Paint tests**
  - Assert the page contains `自作` and `所持` controls, custom/owned render paths, deletion confirmation copy, and no delete action for official/game cards.
  - Assert Paint passes the created request ID into `WankoLibrary.registerWanko` after the request is locally created.
  - Assert the Paint request service remains the source of GitHub synchronization and no Contents API is added to the page.
- [ ] **Step 2: Run focused tests and verify they fail**

Run: `node --test tests/wanko-library-page.test.js tests/paint-character-request.test.js`

Expected: FAIL because the internal tabs, archive UI, and Paint linkage are absent.
- [ ] **Step 3: Implement the internal tabs and custom cards**
  - Keep existing top-level tab hash values and enemy/element render branches unchanged.
  - Add an internal custom/owned selection local to the allies view.
  - Render custom cards with image, name, date, active state, request state, and a delete button.
  - Use a DOM confirmation dialog or inline confirmation panel before calling `archiveWanko`; cancel must not write.
  - After archive, reload local list and active state, then replace the content tree.
- [ ] **Step 4: Implement Paint-to-library linkage**
  - After `characterRequests.create` succeeds, call `WankoLibrary.registerWanko({ name, blob, creator: 'paint', characterRequestId: request.requestId })`.
  - If library registration fails, keep the request record and show a safe local-save message; never delete or roll back the request.
- [ ] **Step 5: Run focused tests and verify they pass**

Run: `node --test tests/wanko-library-page.test.js tests/paint-character-request.test.js`

Expected: PASS with no official catalog or request path mutation.
- [ ] **Step 6: Commit the UI unit**

```bash
git add wanko-library/index.html paint/app.js tests/wanko-library-page.test.js tests/paint-character-request.test.js
git commit -m "feat: add custom and owned library views"
```

### Task 4: PWA Cache and Full Regression Verification

**Files:**
- Modify: `service-worker.js`
- Modify: `index.html`
- Modify: `paint/index.html`
- Modify: `wanko-cloud/index.html`
- Modify: `wanko-war/index.html`
- Modify: `wanko-library/index.html`
- Modify: `tests/service-worker.test.js`
- Modify: `tests/static-shell.test.js`

**Interfaces:**
- Consumes: the final script versions from Tasks 1–3.
- Produces: a new service-worker cache name and shell URLs for the updated library/store/page scripts.

- [ ] **Step 1: Write/update failing cache assertions**
  - Assert the new library page dependencies and cache version are present.
  - Assert no public GitHub API URL is precached.
- [ ] **Step 2: Run cache tests and verify the expected version mismatch**

Run: `node --test tests/service-worker.test.js tests/static-shell.test.js`

Expected: FAIL until the cache version and shell URLs are updated.
- [ ] **Step 3: Update cache version and dependency query versions**
  - Increment `CACHE_NAME` once for this feature.
  - Add `shared/wanko-library-store.js` before `shared/wanko-library.js` in the shell and load it before `wanko-library.js` in every HTML consumer (`index.html`, `paint/index.html`, `wanko-cloud/index.html`, `wanko-war/index.html`, and `wanko-library/index.html`).
  - Bump only the query versions for files changed by this feature.
  - Preserve the user’s unrelated cache-number changes in `wanko-library/index.html` and `wanko-war/index.html`.
- [ ] **Step 4: Run cache tests and the full suite**

Run: `node --test tests/service-worker.test.js tests/static-shell.test.js`
Run: `npm test`

Expected: all focused tests and the complete test suite pass with zero failures.
- [ ] **Step 5: Review the final diff and commit the cache unit**

```bash
git diff --check
git status --short
git add service-worker.js tests/service-worker.test.js tests/static-shell.test.js
git commit -m "chore: refresh library PWA cache"
```

Final verification must confirm that only intended files are staged and the pre-existing `wanko-library/index.html` / `wanko-war/index.html` changes remain uncommitted if they are not part of this work.
