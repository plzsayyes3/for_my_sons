# For My Sons Character Request Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a local-first, private-repository-backed character implementation request flow to Paint without registering official public characters.

**Architecture:** Build a focused `character-requests.js` shared service on top of the existing shared IndexedDB and GitHub sync foundation. The service owns request validation, artwork preparation, local records, and idempotent private-repo synchronization; Paint owns only the child-facing multi-step dialog and invokes the service. The public repo remains free of request artwork, stats, profile values, and tokens.

**Tech Stack:** Vanilla browser JavaScript, IndexedDB, GitHub Contents API through the shared sync layer, Canvas/WebP with PNG fallback, Node built-in test runner, existing PWA service worker.

**Spec:** `docs/superpowers/specs/2026-09-23-character-request-pipeline-design.md`

## Global Constraints

- IndexedDB is the local source of truth; private GitHub is synchronization and backup.
- Paint must not call the GitHub Contents API directly.
- Request JSON contains no stats, profile ID, personal profile name, token, or private save data.
- Public official character files and `shared/official-wankos.js` are not modified by Paint.
- Existing drawing, draft persistence, puzzle export, phone export, local Wanko Library registration, and Supabase sync remain available.
- The same `requestId` and private paths must be reused on retry; duplicate submission must be harmless.
- PAT data is confined to the existing private-repo GitHub sync layer and never logged or sent to the public repository.
- Changes must be made in an isolated worktree and committed in small, reviewable commits.

## Review Focus

- Offline-first submission: the local request and artwork remain available when GitHub is unavailable; covered by Task 2.
- Partial remote upload: artwork success followed by JSON failure retries safely without duplicate requests; covered by Task 3.
- Existing shared IndexedDB compatibility: adding the request store does not reset current stores or Paint drafts; covered by Task 1 and Task 5.
- Child-flow cancellation and double taps: canceling does not lose the drawing and final submission runs once; covered by Task 4.
- Privacy boundaries: request payloads contain no stats/profile/token and auth is only sent to the private GitHub API; covered by Task 3 and Task 6.

### Task 1: Integrate the shared foundation and add the request data store

**Files:**
- Create or modify: `shared/for-my-sons-db.js` to add the `characterRequests` object store without changing existing store names or data.
- Create: `shared/character-requests.js` containing pure validation, normalization, path generation, artwork preparation, and a storage/sync service factory.
- Modify: `shared/for-my-sons.js` to expose `characterRequests.create`, `characterRequests.get`, `characterRequests.listPending`, `characterRequests.retry`, and `characterRequests.markCompleted` through the existing shared facade.
- Test: `tests/character-requests.test.js`.
- Test: `tests/for-my-sons-db.test.js` if the foundation test is present in the selected base.

**Interfaces:**
- Consumes: `db.get/put/delete/list`, the current profile-independent shared DB adapter, and the shared GitHub sync adapter.
- Produces: `createCharacterRequestService({ db, sync, clock, imageEncoder })`; `normalizeCharacterRequest(input)`; `requestPaths(requestId)`; and facade methods returning request records with `requestId`, `status`, `syncState`, and `artwork` metadata.

- [ ] **Step 1: Write the failing validation and path tests**

```js
test('normalizes a valid ally request without adding stats', () => {
  const request = normalizeCharacterRequest({
    requestId: 'request-abc123', name: '  クリオネン  ', faction: 'ally',
    createdAt: '2026-09-23T00:00:00.000Z'
  });
  assert.deepEqual(request, {
    id: 'request-abc123', requestId: 'request-abc123', name: 'クリオネン', faction: 'ally',
    createdAt: '2026-09-23T00:00:00.000Z', status: 'pending',
    artwork: 'character-requests/pending/request-abc123/artwork.webp', source: 'paint'
  });
  assert.equal('stats' in request, false);
});

test('rejects unsupported factions and unsafe IDs', () => {
  assert.throws(() => normalizeCharacterRequest({ requestId: '../x', name: 'x', faction: 'boss' }));
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the missing module/export**

Run: `node --test tests/character-requests.test.js`

Expected: FAIL because `shared/character-requests.js` and its exports do not yet exist.

- [ ] **Step 3: Implement the minimal pure model and add the IndexedDB store**

Keep `SUPPORTED_FACTIONS = ['ally', 'enemy']`, require a trimmed non-empty name of at most 24 characters, require `request-` followed by safe ID characters, force `status: 'pending'` at creation, and derive all remote paths from the validated request ID. Increment the shared DB version only when necessary and create `characterRequests` during upgrade; never delete or recreate `settings`, `profiles`, `avatars`, `saves`, or `snapshots`.

- [ ] **Step 4: Run focused tests and the full existing suite**

Run: `node --test tests/character-requests.test.js`

Expected: PASS.

Run: `npm test`

Expected: all existing tests and the new focused tests pass.

- [ ] **Step 5: Commit the foundation integration**

```bash
git add shared/for-my-sons-db.js shared/character-requests.js shared/for-my-sons.js tests/character-requests.test.js tests/for-my-sons-db.test.js
git commit -m "feat: add character request local model"
```

### Task 2: Implement local-first request creation and artwork preparation

**Files:**
- Modify: `shared/character-requests.js` to add local create/get/list/retry behavior and bounded artwork encoding.
- Test: `tests/character-requests.test.js`.

**Interfaces:**
- Consumes: Task 1 normalization and DB store.
- Produces: `service.create({ name, faction, artwork })`, `service.get(requestId)`, `service.listPending()`, and `service.prepareArtwork(blobOrCanvas)`.

- [ ] **Step 1: Write failing local-first and image tests**

```js
test('creates a request locally before attempting synchronization', async () => {
  const calls = [];
  const service = createCharacterRequestService({ db: createMemoryDatabase(), sync: { pushCharacterRequest: async () => calls.push('remote') } });
  const request = await service.create({ name: 'ねこわん', faction: 'enemy', artwork: new Uint8Array([1, 2, 3]) });
  assert.equal(request.status, 'pending');
  assert.deepEqual(calls, []);
  assert.equal((await service.get(request.requestId)).name, 'ねこわん');
});

test('uses WebP when available and PNG when the browser encoder cannot produce WebP', async () => {
  const webp = await prepareArtwork(fakeCanvas, { encode: type => type === 'image/webp' ? webpBlob : null });
  assert.equal(webp.type, 'image/webp');
  const png = await prepareArtwork(fakeCanvas, { encode: () => null });
  assert.equal(png.type, 'image/png');
});
```

- [ ] **Step 2: Run focused tests and verify the new behavior fails**

Run: `node --test tests/character-requests.test.js`

Expected: FAIL because the local create and encoder functions are absent.

- [ ] **Step 3: Implement local persistence**

Generate `request-<uuid>` once per create call, prepare the artwork before writing, store the request metadata and Blob in one logical local operation, and return the local record without requiring credentials or network access. Store the exact `artworkPath` used by the eventual remote sync.

- [ ] **Step 4: Implement artwork preparation**

Draw into a transparent 512x512-or-smaller canvas preserving aspect ratio, request WebP at a quality that keeps child artwork legible, and use PNG if `toBlob('image/webp')` returns null or errors. Preserve the returned MIME type in the local binary record.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/character-requests.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit local-first persistence**

```bash
git add shared/character-requests.js tests/character-requests.test.js
git commit -m "feat: persist character requests offline"
```

### Task 3: Add idempotent private GitHub synchronization

**Files:**
- Modify: `shared/github-sync.js` to expose private request binary/JSON operations through the existing authenticated request path, or add `shared/character-request-sync.js` if the existing sync module's record shape cannot safely represent the request bundle.
- Modify: `shared/character-requests.js` to synchronize artwork first, then request JSON, and update local sync state.
- Modify: `shared/for-my-sons.js` to expose explicit `characterRequests.syncPending()`.
- Test: `tests/character-requests-sync.test.js`.
- Create if needed: `docs/superpowers/notes/for-my-sons-save-schema.md` containing only the verified private repo paths and compatibility notes; never copy private save contents into Public.

**Interfaces:**
- Consumes: Task 2 local request records and the authenticated GitHub sync adapter.
- Produces: `syncPending()` returning `{ requestId, status, syncState }` results; `markCompleted(requestId)` that validates the completed path and status without creating official public files.

- [ ] **Step 1: Inspect the authenticated Private repo and write contract tests from its real structure**

Use the configured authenticated GitHub access to read only repository metadata and the target `character-requests` paths. Confirm the default branch, existing pending/completed conventions, and whether the repo already has a schema file. Do not print PATs, full save JSON, profile names, or unrelated private data. Pin the verified path convention in test fixtures using synthetic request IDs only.

- [ ] **Step 2: Write failing sync tests**

```js
test('uploads artwork before JSON and marks one request synced', async () => {
  const calls = [];
  const sync = createFakeSync({ calls });
  const service = createCharacterRequestService({ db: seededDbWithPendingRequest(), sync });
  const result = await service.syncPending();
  assert.equal(result[0].syncState, 'synced');
  assert.deepEqual(calls.map(call => call.kind), ['binary', 'json']);
});

test('retries JSON after artwork succeeded using the same request ID and does not create a second request', async () => {
  const calls = [];
  const sync = createFakeSync({ calls, failJsonOnce: true });
  const service = createCharacterRequestService({ db: seededDbWithPendingRequest(), sync });
  const first = await service.syncPending();
  const second = await service.syncPending();
  assert.equal(first[0].syncState, 'error');
  assert.equal(second[0].syncState, 'synced');
  assert.equal(new Set(calls.map(call => call.path)).size, 2);
});

test('does not send the auth token to a non-GitHub endpoint or public repository', async () => {
  const requests = captureFetchRequests();
  await syncOneRequestWithPrivateGithubConfig(requests);
  assert.ok(requests.every(request => new URL(request.url).hostname === 'api.github.com'));
});
```

- [ ] **Step 3: Run sync tests and verify the expected missing behavior**

Run: `node --test tests/character-requests-sync.test.js`

Expected: FAIL because request-bundle sync is not implemented.

- [ ] **Step 4: Implement remote path and SHA-safe idempotent writes**

Use `character-requests/pending/<requestId>/artwork.<ext>` and `request.json`, preserving the verified repository convention from Step 1. Read existing blobs before writes; reuse the existing SHA for updates; treat an equivalent existing request JSON as already synced; return conflict rather than overwriting a different request with the same path. Upload binary before JSON and mark local state only after both succeed. Normalize offline, auth, conflict, and payload failures without logging credentials.

- [ ] **Step 5: Implement completion tracking**

Expose a method for the implementation Work to update the request JSON status to `completed` and move/copy both files to `character-requests/completed/<requestId>/` using the same GitHub sync layer. The Paint-side code must recognize a completed remote request and never recreate a pending copy.

- [ ] **Step 6: Run sync and full tests**

Run: `node --test tests/character-requests-sync.test.js && npm test`

Expected: all tests pass, including partial-upload retry, duplicate request ID, conflict, and auth-host assertions.

- [ ] **Step 7: Commit private synchronization**

```bash
git add shared/github-sync.js shared/character-request-sync.js shared/character-requests.js shared/for-my-sons.js tests/character-requests-sync.test.js docs/superpowers/notes/for-my-sons-save-schema.md
git commit -m "feat: sync character requests to private save repo"
```

### Task 4: Replace the Paint modal with the child-facing staged flow

**Files:**
- Modify: `paint/index.html` to add faction selection, step text, request-submit button, and offline/pending status area.
- Modify: `paint/app.js` to call the shared character-request service, preserve existing local Wanko Library behavior, and prevent duplicate submits.
- Modify: `paint/styles.css` for large touch-friendly faction buttons and clear completion/error messages.
- Test: `tests/static-shell.test.js` and `tests/paint-character-request.test.js`.

**Interfaces:**
- Consumes: `ForMySonsShared.createForMySons()` character-request facade and existing `WankoLibrary.registerWanko()`.
- Produces: child-visible flow 「味方 / 敵」→ name → 「登録依頼を出す」, with completion text 「登録依頼を出しました」 and offline text 「あとで送るね」.

- [ ] **Step 1: Write failing DOM/static tests**

```js
test('Paint contains the faction choices and request submit action', () => {
  const html = readFile('paint/index.html');
  assert.match(html, /味方/);
  assert.match(html, /敵/);
  assert.match(html, /登録依頼を出す/);
  assert.doesNotMatch(html, /stats.*cost|cost.*stats/);
});

test('Paint source uses the shared request facade instead of a public official registration path', () => {
  const source = readFile('paint/app.js');
  assert.match(source, /characterRequests/);
  assert.doesNotMatch(source, /official-wankos/);
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `node --test tests/paint-character-request.test.js tests/static-shell.test.js`

Expected: FAIL because the current modal has no faction choices, no request submit action, and no shared request call.

- [ ] **Step 3: Implement the staged modal**

Keep the existing preview/crop behavior intact. Add a faction step with large buttons, then reveal the name field and final action. Require a selected faction and non-empty trimmed name. The final action disables immediately, creates the local request once, starts a best-effort sync, and updates the status text based on whether sync completed or remains pending. Do not call `makeWankoPackage()` for this flow and do not add stats to the request.

- [ ] **Step 4: Preserve existing local compatibility behavior**

Continue calling `WankoLibrary.registerWanko({ name, blob, creator: 'paint' })` only for the existing local library feature if that behavior is still intentionally retained by the current UI. Keep phone/puzzle save handlers and draft storage unchanged. Do not use the local Wanko record as the private request status.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/paint-character-request.test.js tests/static-shell.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit the Paint flow**

```bash
git add paint/index.html paint/app.js paint/styles.css tests/paint-character-request.test.js tests/static-shell.test.js
git commit -m "feat: submit Paint character implementation requests"
```

### Task 5: Wire shared assets, PWA cache versions, and startup retry

**Files:**
- Modify: `paint/index.html` to load the shared DB/facade/request scripts before Paint.
- Modify: `service-worker.js` to bump the cache name and precache new shared/request assets plus the updated Paint query versions.
- Modify: `apps.json` only if the existing app manifest schema requires the Paint version to change.
- Modify: `paint/app.js` to trigger a quiet pending-request retry on startup or explicit retry without blocking drawing.
- Test: `tests/static-shell.test.js` and `tests/service-worker.test.js`.

**Interfaces:**
- Consumes: Task 3 facade and Task 4 UI.
- Produces: a cache-busted Paint shell that can operate offline and retry pending requests later.

- [ ] **Step 1: Write failing shell/cache tests**

```js
test('service worker precaches the shared character request assets and uses a new cache name', () => {
  const source = readFile('service-worker.js');
  assert.match(source, /for-my-sons-v[0-9]+/);
  assert.match(source, /character-requests\.js/);
  assert.match(source, /for-my-sons\.js/);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test tests/service-worker.test.js tests/static-shell.test.js`

Expected: FAIL because the new assets and cache version are absent.

- [ ] **Step 3: Add scripts in dependency order and update cache versions**

Load DB, request service, shared facade, and then Paint. Bump the cache name and Paint asset query versions together. Keep old cache deletion behavior. Do not add private repo files or request data to the precache.

- [ ] **Step 4: Add non-blocking retry**

On Paint startup, call the shared request retry method only when available, catch errors without preventing canvas initialization, and leave the child-facing UI quiet unless a request changes state or the user opens the request status UI.

- [ ] **Step 5: Run full tests and commit**

Run: `node --test tests/service-worker.test.js tests/static-shell.test.js && npm test`

Expected: all tests pass.

```bash
git add paint/index.html paint/app.js service-worker.js apps.json tests/static-shell.test.js tests/service-worker.test.js
git commit -m "chore: refresh Paint request PWA assets"
```

### Task 6: Browser verification and privacy audit

**Files:**
- Modify: only files required by verified browser failures.
- Test: existing automated suite plus a manual iPhone/iPad Safari/PWA checklist recorded in the final report.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: exit code 0 with no failing tests.

- [ ] **Step 2: Run a local browser smoke test at iPhone and iPad viewport sizes**

Verify drawing, undo/redo, clear, puzzle save, phone save, modal cancel, ally selection, enemy selection, name validation, one-tap submission, success message, offline local pending behavior, reconnect retry, and app reload after service-worker update.

- [ ] **Step 3: Audit the public diff**

Run: `git diff --check`, then search the changed Public files for PAT-like strings, profile IDs/names, private save JSON, stats fields in request payload construction, and direct `api.github.com` calls from `paint/`. Expected: no secrets or private data; only the shared sync module may contain the generic GitHub API endpoint.

- [ ] **Step 4: Commit any browser-only corrections and report evidence**

Use a focused commit for each correction, rerun `npm test`, and record the exact test count, browser checks, private repo path convention, and any environment limitation such as unavailable iOS hardware.
