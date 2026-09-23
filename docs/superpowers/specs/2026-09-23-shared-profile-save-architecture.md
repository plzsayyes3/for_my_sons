# Shared Profile / Save Architecture

## Status

Approved design for the first shared-platform implementation. This document is the implementation source of truth for `for_my_sons`.

## Intent

For My Sons is a launcher for several child-facing web apps. It needs one shared local profile and save foundation so every app can eventually use the same current profile, parent-only settings, offline-first persistence, and private GitHub backup. The first implementation must add the foundation without rewriting existing apps.

The implementation uses only generic profile IDs such as `profile-1`, `profile-2`, and `profile-3`. It must not contain or emit personal names in source code, comments, logs, tests, or public repository files.

## Scope

### In scope

- A shared `currentProfile` state for the launcher and future app adapters.
- Parent-only settings protected by a locally verified PIN whose plaintext is never stored.
- IndexedDB as the normal local source of truth.
- Generic profile records and cached profile images.
- A common JSON and binary save API with dirty/pending-sync state.
- GitHub Contents API synchronization to the private `For-My-Sons-save` repository.
- Fine-grained PAT configuration held only on the device.
- SHA-based latest-version reads and safe conflict detection.
- Manual sync, restore, and sync status in the parent settings UI.
- Profile avatar selection from an image file, local caching, and repository backup.
- A model/project JSON save contract with optional STL and thumbnail files.
- Service-worker and cache-version updates for the new shared modules.

### Out of scope for the first slice

- Rewriting Wanko War, Wanko Library, Paint, Merge Block, Piano, or external apps to the new store.
- Server-side authentication or a backend proxy for GitHub.
- Strong per-profile cryptographic isolation inside one PAT/repository.
- Large media or video storage.
- Automatic destructive conflict resolution.

## Runtime architecture

```text
Launcher / future app adapters
              |
      shared/for-my-sons.js
        /      |       \
 profile-manager parent-lock save-store
                              |
                       github-sync
                              |
              private GitHub Contents API
                              |
                 For-My-Sons-save (private)
```

Each module has a narrow responsibility:

- `profile-manager.js`: validates profile IDs, stores and reads the current profile, and manages profile metadata/avatar cache.
- `parent-lock.js`: creates and verifies the parent PIN using Web Crypto PBKDF2. It exposes an in-memory unlock state and never returns the original PIN.
- `save-store.js`: owns the IndexedDB schema and app-scoped save records. It supports JSON and binary values, pending-sync metadata, and local restore snapshots.
- `github-sync.js`: is the only module that calls GitHub. It accepts a local configuration and a token provider, never logs credentials, and performs Contents API GET/PUT operations with SHA preconditions.
- `for-my-sons.js`: exposes the stable browser facade and dispatches shared state events. Future apps use this facade instead of touching GitHub or IndexedDB directly.

## IndexedDB contract

Database name: `for-my-sons-shared-v1`.

Object stores:

- `settings`: singleton records for `currentProfile`, parent-lock metadata, and GitHub sync configuration. The PAT is stored as a device-local secret record only and is never included in exported save payloads.
- `profiles`: records keyed by `profileId`, containing generic ID, display label, avatar cache key, and timestamps.
- `avatars`: binary image blobs keyed by `profileId`.
- `saves`: records keyed by `[profileId, appId, saveKey]`, containing JSON or binary data, content type, local revision, remote SHA, dirty state, pending-sync state, and updated timestamp.
- `snapshots`: local restore points keyed by save identity and snapshot ID.

The local database is authoritative during normal use. Every write resolves locally before any network attempt. A failed or unavailable network request leaves the record usable and marks it pending.

## Generic API

The initial browser facade provides these behaviors:

```js
const profile = await ForMySons.profile.current();
await ForMySons.profile.setCurrent('profile-2');

await ForMySons.save.json('merge-block', 'progress', value);
const value = await ForMySons.save.readJson('merge-block', 'progress');

await ForMySons.save.binary('profile', 'avatar', blob, 'image/webp');
const file = await ForMySons.save.readBinary('profile', 'avatar');

await ForMySons.sync.status();
await ForMySons.sync.push();
await ForMySons.sync.restore({ profileId: 'profile-1', appId: 'merge-block', saveKey: 'progress' });
```

The implementation may expose lower-level module factories for tests, but app-facing calls must resolve the current profile automatically unless an explicit parent-settings operation supplies a profile ID.

## Repository layout and paths

The private repository is one shared backup repository for the whole For My Sons family data set:

```text
profiles/
  profile-1/
    profile.json
    avatar.webp
    apps/<app-id>/<save-key>.json
    files/<app-id>/<save-key>.<extension>
  profile-2/
  profile-3/
schema.json
```

Profile IDs are validated against `^profile-[a-z0-9-]+$`; no display name is used to build a path. JSON payloads include schema/version metadata and a profile ID, but no personal identity fields.

For 3D projects, editable project/model JSON is the canonical save. STL and thumbnail are optional companion files. STL must not replace the editable JSON as the source of truth.

## GitHub synchronization

`github-sync.js` uses `https://api.github.com/repos/{owner}/{repo}/contents/{path}` with:

- `GET` to read content and the current SHA.
- `PUT` with base64 content and the known SHA to update an existing file.
- `PUT` without SHA only when creating a file that was confirmed absent.

The default configuration targets the private repository but contains no token. The parent settings UI accepts the owner, repository, branch, and Fine-grained PAT. The token is retained only in device-local storage and must be excluded from diagnostics, exceptions, exports, and repository files.

Before a push, the sync layer compares the locally remembered SHA with the latest remote SHA. If they differ, it returns a conflict result and does not overwrite remote data. The UI offers restore/download or an explicit parent-reviewed retry after the local record has been reconciled. Offline and network failures return a pending result rather than throwing away local data.

## Parent settings flow

Normal launcher UI shows the current profile in a non-editable indicator and does not render a profile picker. The settings entry is `おうちの人設定`.

The protected settings surface contains:

- profile selection using generic profile IDs and labels;
- profile image selection and preview;
- GitHub repository and PAT configuration;
- current sync status and pending count;
- manual sync;
- backup restore;
- parent PIN setup/change.

Profile changes require an explicit confirmation and update `currentProfile` only after the new profile is selected. Existing app pages are not forcibly reloaded; the shared state event lets future adapters respond, while current apps remain backward compatible.

## Security and privacy

- PIN plaintext is never persisted. The record contains algorithm, iterations, salt, and derived hash only.
- PAT is never committed, bundled, cached by the service worker, included in JSON saves, or written to logs.
- The browser-only PAT model protects repository access from the public site but cannot provide a security boundary against someone with developer tools or the device itself. The UI PIN is an operational lock, not account-level authorization.
- All user-provided IDs and app IDs are path-encoded and validated before GitHub requests.
- Image processing should prefer a bounded WebP thumbnail and reject obviously excessive files before upload.

## Migration and compatibility

The first slice is additive. Existing localStorage, Wanko Cloud, and app-specific stores remain untouched. No current save is silently moved or deleted. Each later app migration must define an explicit adapter, a one-time copy/verify step, and a rollback path. Existing apps continue to load even when the shared database or GitHub configuration is unavailable.

## Offline and failure behavior

- Local reads and writes work without a network.
- A write queues a pending sync marker when synchronization is configured but unavailable.
- Sync status distinguishes idle, pending, syncing, synced, offline, authentication failure, and conflict.
- Remote malformed data is rejected and does not overwrite valid local data.
- Restore writes a new local snapshot first, then replaces the selected local record only after validation.
- The service worker caches code and static shell resources only; it must never cache PAT-bearing requests or private API responses.

## Verification

Automated tests must cover:

- generic profile validation and current-profile persistence;
- PIN verification without plaintext persistence;
- IndexedDB JSON/binary round trips and pending-sync behavior;
- avatar cache behavior;
- GitHub request construction, base64 encoding, SHA update, missing-file creation, and conflict refusal;
- offline writes and safe restore validation;
- launcher settings visibility and absence of a normal profile picker;
- service-worker shell coverage and cache-version update.

Manual acceptance on iPhone/iPad-sized viewports must cover profile display, parent PIN entry, profile switching, image selection/caching, offline save, GitHub sync, and a simulated remote conflict.
