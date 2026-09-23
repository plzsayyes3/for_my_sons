# For My Sons Character Registration Pipeline Design

## Goal

Allow a child to turn a drawing in Paint into a tracked implementation request without registering an official character in the public repository. The request is saved locally first, synchronized to the private `plzsayyes3/For-My-Sons-save` repository when possible, and remains addressable by one request ID until a character implementation Work moves it to `completed`.

## Scope and non-goals

This change covers the Paint-side request flow, local persistence, private-repository synchronization, retry/idempotency, and cache-version updates. It does not choose character stats, create files under `official-wankos/` or `assets/official-wankos/`, modify `shared/official-wankos.js`, or automate the downstream implementation Work.

The existing Paint drawing, draft persistence, phone export, puzzle export, local Wanko Library registration, and existing Supabase sync remain available. The new request flow is separate from official public character registration.

## Current-state findings

- `paint/app.js` currently opens a single name-only Wanko modal and creates a local library record plus a shareable `.wanko.json` package containing default stats.
- `shared/wanko-library.js` owns the existing Wanko IndexedDB store and optional Supabase sync; it is not a suitable location for private implementation requests because it models playable local Wankos.
- The `feat/shared-profile-save-foundation` worktree already contains `for-my-sons-db.js`, `save-store.js`, and `github-sync.js`. The character-request code will consume the common DB/sync contracts when that foundation is integrated, without duplicating GitHub Contents API calls in Paint.
- The current checkout has unrelated staged and unstaged changes. Implementation must use an isolated worktree and must not reset, unstage, or overwrite those changes.
- A local checkout of `plzsayyes3/For-My-Sons-save` was not found during read-only inspection. Its exact schema and branch will be verified through authenticated access before the sync implementation is finalized.

## Data model

The request is identified by a UUID-like `requestId`, generated once when the user confirms submission. The local record has this shape:

```js
{
  requestId: "request-<uuid>",
  name: "クリオネン",
  faction: "ally", // "ally" | "enemy"; future "boss" is additive
  createdAt: "2026-09-23T00:00:00.000Z",
  status: "pending", // pending | synced | completed | error
  artworkPath: "character-requests/pending/<requestId>/artwork.webp",
  source: "paint",
  syncState: "pending", // pending | synced | error | conflict
  lastError: null,
  updatedAt: "2026-09-23T00:00:00.000Z"
}
```

The persisted request JSON sent to the private repository contains only request metadata and no stats:

```json
{
  "id": "request-<uuid>",
  "requestId": "request-<uuid>",
  "name": "クリオネン",
  "faction": "ally",
  "createdAt": "2026-09-23T00:00:00.000Z",
  "status": "pending",
  "artwork": "character-requests/pending/request-<uuid>/artwork.webp",
  "source": "paint"
}
```

No `profileId`, personal profile name, token, or stats is written to the request JSON or public repository.

## Local persistence and synchronization

IndexedDB is the local source of truth. A request and its artwork are committed locally before any network call. The local record stores the optimized artwork Blob so an offline request can be retried without reopening the canvas.

The shared character-request service owns:

- validation and normalization of names, factions, IDs, and statuses;
- WebP conversion with a bounded 512px canvas and PNG fallback;
- local request creation and lookup by `requestId`;
- pending request listing and retry;
- private-repository path construction;
- delegating JSON and binary writes to the shared GitHub sync layer.

The Paint app calls this service and never calls the GitHub Contents API directly. If the network is unavailable, the service returns a locally saved `pending` request and the UI reports that the request was saved and will be sent later. A later app startup or explicit retry may synchronize it.

Synchronization is idempotent:

1. Read the target private paths and their SHAs.
2. If the same request already exists with equivalent metadata and artwork path, treat it as already submitted.
3. Upload/update artwork first.
4. Upload/update `request.json` with the same request ID and pending status.
5. Mark the local request `synced` only after both files succeed.

If the artwork succeeds but JSON fails, the local request remains retryable and the next attempt reuses the same paths. A remote mismatch is reported as a conflict rather than silently overwritten. The service must never send the PAT to the public repository or any host other than the configured GitHub API endpoint.

The downstream implementation Work can complete a request by moving both files from `character-requests/pending/<requestId>/` to `character-requests/completed/<requestId>/` and changing `status` to `completed`, or by using the service's future completion helper. The Paint client treats a remotely completed request as read-only and does not recreate it as pending.

## Child-facing flow

The existing "わんこに登録" action opens the new multi-step dialog:

1. show the artwork preview and ask 「どっちのわんこ？」 with large 「味方」 and 「敵」 buttons;
2. ask for a name;
3. show 「登録依頼を出す」 as the final action;
4. after local save, show 「登録依頼を出しました」; if offline, add 「あとで送るね」;
5. keep closing and cancellation safe, and prevent the final button from submitting twice.

The dialog must not show stats or imply that the character has already entered the public game. The existing local library save remains a separate compatibility action and is not used as the private request's remote status.

## Error handling and privacy

- Empty or whitespace-only names are rejected with a child-readable prompt.
- Only supported factions are accepted at the service boundary.
- Missing GitHub credentials do not discard the local request; they produce a pending/error state that can be retried by the parent or implementation workflow.
- Network, 401/403, 409, and payload errors are normalized into non-secret user-facing messages. Tokens never appear in logs, URLs, request JSON, error text, or tests.
- Request metadata and artwork remain in the private repository. Public character catalogs are untouched by this flow.

## Cache and versioning

The Paint shell and shared request scripts receive explicit asset-version changes. `service-worker.js` cache keys and `apps.json` entries are updated only as needed for the new shared assets. The final verification checks that the new scripts are in the precache list and that old cache names cannot serve an older Paint shell indefinitely.

## Verification

Automated tests cover request normalization, faction validation, WebP/PNG preparation, local-first persistence, duplicate request IDs, idempotent remote retries, partial-upload retry, conflict handling, and privacy constraints. Existing tests run unchanged.

Browser verification covers Paint drawing preservation, the staged child flow, cancellation, double-tap protection, offline submission, retry after reconnect, iPhone/iPad-sized layouts, and service-worker refresh. The public repository diff is checked for absence of private repo names beyond generic configuration, profile values, tokens, stats in request payloads, and private save data.
