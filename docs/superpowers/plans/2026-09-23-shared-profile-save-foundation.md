# Shared Profile / Save Foundation Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for native execution or `superpowers:subagent-driven-development` for task-by-task delegated execution. Follow the red-green-refactor order in every implementation task.

**Goal:** Add the shared For My Sons profile, parent settings, IndexedDB save store, and private GitHub backup foundation without migrating or breaking existing apps.

**Architecture:** Browser-facing modules live under `shared/`. `for-my-sons-db.js` owns the IndexedDB schema and a test memory adapter. `profile-manager.js`, `parent-lock.js`, and `save-store.js` use that adapter. `github-sync.js` is the only module that calls GitHub. `for-my-sons.js` composes the modules into the stable global facade. The root launcher gets a parent-only settings surface, while existing child apps remain on their current storage until later adapters are explicitly added.

**Tech stack:** Static HTML/CSS/JavaScript, browser IndexedDB and Web Crypto APIs, GitHub Contents API, Node.js standard `node:test`. No runtime dependency or build step is added.

**Spec:** [docs/superpowers/specs/2026-09-23-shared-profile-save-architecture.md](../specs/2026-09-23-shared-profile-save-architecture.md)

## Global constraints

- Only generic IDs such as `profile-1`, `profile-2`, and `profile-3` may appear in implementation fixtures and UI labels.
- Do not add personal names, PATs, or private repository contents to source, comments, tests, logs, or public files.
- IndexedDB is authoritative for normal writes; network failure must never discard a successful local write.
- Existing Wanko Cloud, Wanko Library, Paint, Merge Block, Piano, and external app storage remain untouched in this phase.
- GitHub calls are isolated to `shared/github-sync.js`; launcher and apps use the facade.
- Never cache PAT-bearing requests or GitHub private API responses in the service worker.
- Every task starts with a failing test and ends with the smallest focused commit that keeps the entire suite green.

## File map

| File | Responsibility |
| --- | --- |
| `shared/for-my-sons-db.js` | IndexedDB schema/opening plus test memory adapter |
| `shared/profile-manager.js` | Profile ID validation, current profile, profile metadata, avatar cache |
| `shared/parent-lock.js` | PBKDF2 PIN setup/verification and in-memory unlock state |
| `shared/save-store.js` | JSON/binary save records, revisions, dirty/pending state, snapshots |
| `shared/github-sync.js` | GitHub Contents API requests, base64, SHA conflict handling |
| `shared/for-my-sons.js` | Stable browser facade and shared event wiring |
| `shared/settings-view.js` | Parent settings view model and safe DOM rendering helpers |
| `shared/for-my-sons.css` | Launcher profile indicator and parent settings styles |
| `tests/for-my-sons-db.test.js` | Database adapter contract |
| `tests/profile-manager.test.js` | Profile behavior and avatar cache |
| `tests/parent-lock.test.js` | PIN hashing and unlock behavior |
| `tests/save-store.test.js` | Local JSON/binary save behavior |
| `tests/github-sync.test.js` | GitHub request and conflict behavior |
| `tests/for-my-sons-facade.test.js` | Cross-module facade behavior |
| `tests/settings-view.test.js` | Settings visibility and safe display model |
| `tests/static-shell.test.js` | Static shell and service-worker coverage |
| `index.html` / `app.js` / `styles.css` | Launcher integration |
| `service-worker.js` | Versioned cache for shared static modules only |

## Review focus

- A malformed or missing IndexedDB record must return a safe default rather than prevent launcher startup; `profile-manager.test.js` and `save-store.test.js` pin this behavior.
- A second device changing the same remote file must produce a conflict and must not overwrite remote content; `github-sync.test.js` pins this behavior.
- A failed network request after a local save must leave the record readable and pending; `save-store.test.js` and `for-my-sons-facade.test.js` pin this behavior.
- A PAT or PIN must not appear in serialized settings, errors, logs, or service-worker caches; `parent-lock.test.js`, `github-sync.test.js`, and `static-shell.test.js` pin this behavior.
- A profile ID or save key containing path traversal characters must be rejected before any remote request; `profile-manager.test.js` and `github-sync.test.js` pin this behavior.

---

### Task 1: IndexedDB adapter and test storage contract

**Files:**
- Create: `shared/for-my-sons-db.js`
- Create: `tests/for-my-sons-db.test.js`

**Interfaces:**
- Export `DB_NAME = 'for-my-sons-shared-v1'` and `DB_VERSION = 1`.
- Export `openDatabase(indexedDB = globalThis.indexedDB)` returning a Promise of an IndexedDB database with stores `settings`, `profiles`, `avatars`, `saves`, and `snapshots`.
- Export `createMemoryDatabase()` for Node tests. It implements `get(store, key)`, `put(store, value, key)`, `delete(store, key)`, and `list(store)` as async methods.
- Use explicit keys: settings use string keys; profiles and avatars use `profileId`; saves use `[profileId, appId, saveKey]`; snapshots use `[profileId, appId, saveKey, snapshotId]`.

- [ ] **Step 1: Write the failing tests.** Add tests that create a memory database, write/read/delete a record in every store, preserve binary `Buffer`/`Uint8Array` values without JSON conversion, and assert the schema constants and store names.

```js
test('memory database preserves save records and binary values', async () => {
  const db = createMemoryDatabase();
  const key = ['profile-1', 'paint', 'canvas'];
  const blob = Uint8Array.from([1, 2, 3]);
  await db.put('saves', { key, value: blob, contentType: 'image/webp' }, key);
  const saved = await db.get('saves', key);
  assert.deepEqual([...saved.value], [1, 2, 3]);
  assert.equal(saved.contentType, 'image/webp');
});
```

- [ ] **Step 2: Run the focused test and verify RED.** Run `node --test tests/for-my-sons-db.test.js`. It must fail because the module does not exist.
- [ ] **Step 3: Implement the minimal adapter.** Create the memory adapter with a stable key encoder and implement `openDatabase` with `onupgradeneeded` object-store creation. Do not add migrations beyond version 1.
- [ ] **Step 4: Run focused and full tests.** Run `node --test tests/for-my-sons-db.test.js` and then `npm test`.
- [ ] **Step 5: Commit.** Run `git diff --check`; commit as `feat: add shared indexeddb adapter`.

### Task 2: Generic profiles and avatar cache

**Files:**
- Create: `shared/profile-manager.js`
- Create: `tests/profile-manager.test.js`
- Modify: `shared/for-my-sons-db.js` only if adapter key behavior needs correction

**Interfaces:**
- Export `PROFILE_ID_PATTERN = /^profile-[a-z0-9-]+$/` and `createProfileManager(db, options = {})`.
- `manager.list()` returns profiles in stable insertion order.
- `manager.current()` returns the current profile record, creating `profile-1` with a generic label when no current profile exists.
- `manager.setCurrent(profileId)` validates, persists, and returns the selected profile.
- `manager.upsert(profile)` validates `id`, `label`, and timestamps; labels are display-only strings and never used for paths.
- `manager.setAvatar(profileId, blob, contentType = blob.type)` stores the binary in `avatars` and metadata in `profiles`.
- `manager.getAvatar(profileId)` returns `{ blob, contentType }` or `null`.
- `manager.onChange(listener)` subscribes to `currentProfile` and avatar changes; returned function unsubscribes.

- [ ] **Step 1: Write failing tests.** Cover default `profile-1`, accepted IDs `profile-1` and `profile-2`, rejection of `../`, spaces, uppercase IDs, and personal-looking labels in code fixtures. Test profile switching, stable list order, avatar round-trip, and event emission.

```js
test('rejects unsafe profile IDs before persistence', async () => {
  const manager = createProfileManager(createMemoryDatabase());
  await assert.rejects(() => manager.setCurrent('../profile-2'), /profile ID/i);
  assert.equal((await manager.list()).length, 1);
});
```

- [ ] **Step 2: Run RED.** Run `node --test tests/profile-manager.test.js` and confirm the missing module/API failure.
- [ ] **Step 3: Implement.** Persist only generic IDs and metadata; store avatar blobs separately. Normalize malformed records to safe defaults. Never log input values.
- [ ] **Step 4: Run GREEN and full suite.** Run the focused test, then `npm test`.
- [ ] **Step 5: Commit.** Commit as `feat: add shared profile manager`.

### Task 3: Parent PIN lock

**Files:**
- Create: `shared/parent-lock.js`
- Create: `tests/parent-lock.test.js`

**Interfaces:**
- Export `createParentLock(db, cryptoProvider = globalThis.crypto)`.
- `lock.hasPin()` returns a boolean.
- `lock.setPin(pin)` accepts a 4–12 digit string, generates a random salt, derives a PBKDF2-SHA-256 hash, and stores only `{ algorithm, iterations, salt, hash }`.
- `lock.verify(pin)` returns `true`/`false` and sets an in-memory unlocked flag only on success.
- `lock.isUnlocked()` returns the in-memory flag.
- `lock.lock()` clears the in-memory flag.
- `lock.exportRecordForTest()` is test-only and must return metadata with no plaintext PIN.

- [ ] **Step 1: Write failing tests.** Test setup, correct/incorrect verification, invalid PIN rejection, lock reset, a record inspection that contains no submitted PIN, and a new salt when the PIN changes.
- [ ] **Step 2: Run RED.** Run `node --test tests/parent-lock.test.js`.
- [ ] **Step 3: Implement.** Use Web Crypto `getRandomValues`, `subtle.importKey`, `subtle.deriveBits`, and constant-time byte comparison. Keep the unlocked flag in memory only.
- [ ] **Step 4: Run GREEN.** Run the focused test and `npm test`.
- [ ] **Step 5: Commit.** Commit as `feat: protect parent settings with hashed pin`.

### Task 4: Offline-first JSON and binary save store

**Files:**
- Create: `shared/save-store.js`
- Create: `tests/save-store.test.js`

**Interfaces:**
- Export `createSaveStore(db, profileManager, clock = Date)`.
- `store.writeJson(appId, saveKey, value)` validates JSON-serializability, stores a cloned value for the current profile, increments `localRevision`, sets `dirty: true` and `syncState: 'pending'`, and returns the record.
- `store.readJson(appId, saveKey)` returns a cloned value or `null`.
- `store.writeBinary(appId, saveKey, bytes, contentType, extension = 'bin')` stores bytes and metadata.
- `store.readBinary(appId, saveKey)` returns `{ bytes, contentType, extension }` or `null`.
- `store.markSynced(identity, remoteSha)` clears dirty/pending state and records the SHA.
- `store.markConflict(identity, remoteSha)` records conflict without changing local data.
- `store.listPending(profileId = current)` returns pending records without binary payloads.
- `store.createSnapshot(identity)` and `store.restoreSnapshot(identity, snapshotId)` validate before replacing local data.
- `store.pathFor(record)` returns the repository path under `profiles/{profileId}/apps/...` or `files/...` using validated IDs.

- [ ] **Step 1: Write failing tests.** Cover JSON clone behavior, binary round-trip, per-profile separation, local revision increments, pending status after write, malformed JSON rejection, path traversal rejection, snapshot restore, and preserving local data after a simulated network failure.
- [ ] **Step 2: Run RED.** Run `node --test tests/save-store.test.js`.
- [ ] **Step 3: Implement.** Store JSON as structured values and binary as `Uint8Array`/Blob-compatible values. Never call `fetch` from this module. Validate `appId` and `saveKey` as single path segments.
- [ ] **Step 4: Run GREEN and full suite.** Run the focused test and `npm test`.
- [ ] **Step 5: Commit.** Commit as `feat: add offline-first shared save store`.

### Task 5: GitHub Contents sync with SHA conflicts

**Files:**
- Create: `shared/github-sync.js`
- Create: `tests/github-sync.test.js`

**Interfaces:**
- Export `createGithubSync({ fetch, tokenProvider, saveStore, profileManager, config })`.
- `sync.readRemote(path)` returns `{ exists, content, sha, etag }` and never returns a token.
- `sync.pushRecord(record)` reads the latest remote file, compares `record.remoteSha`, and returns `{ status: 'synced', sha }`, `{ status: 'created', sha }`, `{ status: 'conflict', remoteSha }`, `{ status: 'pending', reason }`, or `{ status: 'auth-error' }`.
- `sync.pullRecord(identity)` downloads, decodes, validates, snapshots local data, replaces local data only after validation, and marks the new SHA.
- `sync.status()` returns aggregate state counts without secrets.
- `sync.encodeBase64(bytes)` and `sync.decodeBase64(content)` are pure helpers for tests.
- Requests use `Authorization: Bearer <PAT>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, and the configured branch. The module must not write to the service-worker cache.

- [ ] **Step 1: Write failing tests.** Use a local fetch stub that records requests and returns deterministic GET/PUT bodies. Test URL/path encoding, headers without logging the PAT, JSON and binary base64, create without SHA, update with matching SHA, conflict refusal on changed SHA, 401 auth error, and network pending result.

```js
test('refuses to overwrite a changed remote SHA', async () => {
  const sync = createGithubSync(/* deterministic test dependencies */);
  const result = await sync.pushRecord({ path: 'profiles/profile-1/apps/paint/progress.json', remoteSha: 'old', value: '{}' });
  assert.deepEqual(result, { status: 'conflict', remoteSha: 'new' });
  assert.equal(putRequests.length, 0);
});
```

- [ ] **Step 2: Run RED.** Run `node --test tests/github-sync.test.js`.
- [ ] **Step 3: Implement.** Centralize request construction, encode contents with UTF-8-safe base64, handle 404/401/409/5xx distinctly, and redact secrets from errors. Only call `saveStore.markSynced` after a successful PUT.
- [ ] **Step 4: Run GREEN and full suite.** Run the focused test and `npm test`.
- [ ] **Step 5: Commit.** Commit as `feat: add github contents sync with conflict detection`.

### Task 6: Shared facade and 3D save contract

**Files:**
- Create: `shared/for-my-sons.js`
- Create: `tests/for-my-sons-facade.test.js`
- Create: `schema.json`

**Interfaces:**
- Export `createForMySons({ db, fetch, crypto, config })` and expose the same object as `window.ForMySons` in browsers.
- `ForMySons.profile.current/list/setCurrent/setAvatar/getAvatar` delegate to the profile manager.
- `ForMySons.parent.hasPin/setPin/verify/lock/isUnlocked` delegate to the parent lock.
- `ForMySons.save.json/readJson/binary/readBinary/pending` delegate to the save store.
- `ForMySons.sync.status/push/restore/configure` delegate to GitHub sync.
- Dispatch `for-my-sons-profile-changed`, `for-my-sons-save-changed`, and `for-my-sons-sync-changed` CustomEvents without including PATs or raw binary payloads.
- `schema.json` documents `profile.json`, app JSON saves, model/project JSON, STL, and thumbnail media roles using only generic IDs.

- [ ] **Step 1: Write failing tests.** Test facade composition with injected memory dependencies, current-profile routing, event payload redaction, JSON save round-trip, and a model/project JSON object remaining distinct from optional STL/thumbnail records.
- [ ] **Step 2: Run RED.** Run `node --test tests/for-my-sons-facade.test.js`.
- [ ] **Step 3: Implement.** Compose the previously tested modules; keep the facade thin and make all browser globals injectable for Node tests.
- [ ] **Step 4: Run GREEN and full suite.** Run the focused test and `npm test`.
- [ ] **Step 5: Commit.** Commit as `feat: expose shared for my sons facade`.

### Task 7: Parent settings UI and launcher integration

**Files:**
- Create: `shared/settings-view.js`
- Create: `shared/for-my-sons.css`
- Create: `tests/settings-view.test.js`
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`

**Interfaces:**
- Export `buildSettingsModel({ profile, profiles, lock, syncStatus })` returning safe display data with no token, PIN, raw blob, or private path.
- Export `renderSettings(container, api)` that builds DOM nodes via `textContent`, `createElement`, and event listeners; it must not interpolate untrusted values into `innerHTML`.
- The root page includes a non-editable current-profile indicator, a button named `おうちの人設定`, a hidden settings dialog/panel, PIN entry, profile selection, image file input, repository/PAT fields, status, manual sync, and restore controls.
- Normal home view has no profile picker. Profile selection controls exist only inside the authenticated parent panel.
- Parent settings can be opened only after `verify` succeeds. New PIN setup is allowed only when no PIN exists; changing it requires current unlock.

- [ ] **Step 1: Write failing tests.** Assert the root HTML contains the indicator/settings entry and no normal profile picker, the display model excludes secrets, and unsafe labels are rendered as text rather than HTML.
- [ ] **Step 2: Run RED.** Run `node --test tests/settings-view.test.js`.
- [ ] **Step 3: Implement the view model and DOM rendering.** Add accessible labels, `aria-modal`, focus return on close, `input type=password` for PIN/PAT, file input for avatars, confirmation before changing profile, and status text for offline/pending/conflict/synced.
- [ ] **Step 4: Integrate the facade on the launcher.** Load shared scripts before `app.js`, initialize the facade after DOM readiness, render the current profile, and leave app tile loading and recent Wanko behavior unchanged when shared initialization fails.
- [ ] **Step 5: Run GREEN, full tests, and browser-level static checks.** Run focused tests and `npm test`; verify keyboard focus and touch-sized controls in a narrow viewport if the browser surface is available.
- [ ] **Step 6: Commit.** Commit as `feat: add parent settings and profile controls`.

### Task 8: PWA cache, static shell, and acceptance verification

**Files:**
- Modify: `service-worker.js`
- Modify: `tests/static-shell.test.js`
- Modify: `apps.json` only if the launcher versioned URL changes are required

**Interfaces:**
- `service-worker.js` includes the root shared scripts and stylesheet in `SHELL` with explicit versions.
- `CACHE_NAME` increments from the current generation.
- The fetch handler continues to cache same-origin static resources only and never caches GitHub API requests or non-GET requests.
- Static tests confirm every local shell URL maps to a real file/directory and that shared modules are included.

- [ ] **Step 1: Extend the failing static tests.** Assert the shared scripts, shared stylesheet, `index.html`, and the next cache generation are present; assert no GitHub API URL appears in `SHELL`.
- [ ] **Step 2: Run RED.** Run `node --test tests/static-shell.test.js` and confirm failure because the new files are not yet cached.
- [ ] **Step 3: Update the shell.** Add versioned shared module/style URLs and increment `CACHE_NAME`. Do not add PAT, API, or private save URLs.
- [ ] **Step 4: Run full verification.** Run `npm test`, `git diff --check`, and inspect `git diff --stat`. If browser automation is available, verify iPhone/iPad-sized flows: profile indicator, PIN gate, profile change, image cache, offline local save, configured sync, and simulated SHA conflict.
- [ ] **Step 5: Commit.** Commit as `feat: cache shared profile foundation`.

## Final verification checklist

- [ ] `npm test` passes with all existing and new tests.
- [ ] `git diff --check` passes.
- [ ] `rg -n "PAT|token|profile-[123]"` is reviewed so no secret or personal identity leaked into source/log fixtures.
- [ ] Existing Wanko, Paint, Merge Block, Piano, and launcher paths remain unchanged except for shared script loading and visible profile/settings affordances.
- [ ] IndexedDB local writes succeed with no network.
- [ ] GitHub sync uses a Fine-grained PAT locally and refuses stale-SHA overwrite.
- [ ] Restore snapshots local data before replacing it.
- [ ] Profile avatar is cached locally and has an optional repository backup path.
- [ ] Model/project JSON is treated as editable canonical data; STL and thumbnail are optional companions.
- [ ] Service worker caches code only, with the new generation installed.
