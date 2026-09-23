const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCharacterRequestService,
  requestPaths
} = require('../shared/character-requests.js');
const { createMemoryDatabase } = require('../shared/for-my-sons-db.js');
const { createGithubSync } = require('../shared/github-sync.js');

function response(status, body = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    async json() { return body; }
  };
}

function makeRequest() {
  const requestId = 'request-sync123';
  return {
    id: requestId,
    requestId,
    name: '同期わんこ',
    faction: 'ally',
    createdAt: '2026-09-23T00:00:00.000Z',
    status: 'pending',
    artwork: requestPaths(requestId).pendingArtwork,
    source: 'paint',
    artworkBlob: Uint8Array.from([1, 2, 3]),
    artworkContentType: 'image/webp',
    syncState: 'pending',
    lastError: null,
    updatedAt: '2026-09-23T00:00:00.000Z'
  };
}

function createFakeSync({ calls, failJsonOnce = false, existingJson = null, failArtwork = false } = {}) {
  const remote = new Map();
  let shouldFailJson = failJsonOnce;
  return {
    async readPath(path) {
      if (existingJson && path.endsWith('/request.json')) {
        return { exists: true, content: existingJson, sha: 'sha-existing' };
      }
      const value = remote.get(path);
      return value ? { exists: true, content: value.content, sha: value.sha } : { exists: false, content: null, sha: null };
    },
    async writePath(path, value, options = {}) {
      calls.push({ kind: options.kind || 'json', path, value });
      if (options.kind === 'binary' && failArtwork) return { status: 'pending' };
      if (options.kind !== 'binary' && shouldFailJson) {
        shouldFailJson = false;
        throw new Error('temporary remote failure');
      }
      const sha = `sha-${remote.size + 1}`;
      remote.set(path, { content: value, sha });
      return { status: 'synced', sha };
    },
    async deletePath(path) {
      calls.push({ kind: 'delete', path });
      return { status: 'deleted' };
    }
  };
}

async function seededDb() {
  const db = createMemoryDatabase();
  const request = makeRequest();
  await db.put('characterRequests', request, request.requestId);
  return db;
}

test('uploads artwork before JSON and marks one request synced', async () => {
  const calls = [];
  const service = createCharacterRequestService({ db: await seededDb(), sync: createFakeSync({ calls }) });
  const result = await service.syncPending();
  assert.equal(result[0].syncState, 'synced');
  assert.deepEqual(calls.map(call => call.kind), ['binary', 'json']);
});

test('retries JSON after artwork succeeds using the same request ID and paths', async () => {
  const calls = [];
  const service = createCharacterRequestService({ db: await seededDb(), sync: createFakeSync({ calls, failJsonOnce: true }) });
  const first = await service.syncPending();
  const second = await service.syncPending();
  assert.equal(first[0].syncState, 'error');
  assert.equal(second[0].syncState, 'synced');
  assert.deepEqual([...new Set(calls.map(call => call.path))], [
    'character-requests/pending/request-sync123/artwork.webp',
    'character-requests/pending/request-sync123/request.json'
  ]);
});

test('writes request files only through the authenticated private GitHub API', async () => {
  const calls = [];
  const sync = createGithubSync({
    fetch: async (url, options) => {
      calls.push({ url, options });
      return options.method === 'GET'
        ? response(404)
        : response(201, { content: { sha: 'sha-request' } });
    },
    tokenProvider: async () => 'test-pat-never-log',
    config: { owner: 'plzsayyes3', repo: 'For-My-Sons-save', branch: 'main' }
  });

  const path = 'character-requests/pending/request-sync123/artwork.webp';
  assert.deepEqual((await sync.readPath(path)).exists, false);
  const result = await sync.writePath(path, Uint8Array.from([1, 2, 3]), {
    kind: 'binary',
    contentType: 'image/webp'
  });

  assert.equal(result.status, 'created');
  assert.ok(calls.every(call => new URL(call.url).hostname === 'api.github.com'));
  assert.ok(calls.every(call => call.options.headers.Authorization === 'Bearer test-pat-never-log'));
  assert.equal(JSON.stringify(result).includes('test-pat-never-log'), false);
  assert.match(calls.at(-1).url, /For-My-Sons-save\/contents\/character-requests\/pending\/request-sync123\/artwork\.webp$/);
});

test('marks a request as conflict when a different remote JSON already exists', async () => {
  const calls = [];
  const service = createCharacterRequestService({
    db: await seededDb(),
    sync: createFakeSync({ calls, existingJson: { requestId: 'request-sync123', name: '別のわんこ' } })
  });
  const result = await service.syncPending();
  assert.equal(result[0].syncState, 'conflict');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'binary');
});

test('keeps a request retryable when a remote write returns a pending status', async () => {
  const calls = [];
  const service = createCharacterRequestService({
    db: await seededDb(),
    sync: createFakeSync({ calls, failArtwork: true })
  });
  const result = await service.syncPending();
  assert.equal(result[0].syncState, 'error');
  assert.equal(result[0].status, 'pending');
});

test('recognizes equivalent request JSON returned as GitHub bytes', async () => {
  const calls = [];
  const request = makeRequest();
  const expected = {
    id: request.requestId,
    requestId: request.requestId,
    name: request.name,
    faction: request.faction,
    createdAt: request.createdAt,
    status: 'pending',
    artwork: request.artwork,
    source: 'paint'
  };
  const service = createCharacterRequestService({
    db: await seededDb(),
    sync: createFakeSync({
      calls,
      existingJson: new TextEncoder().encode(JSON.stringify(expected))
    })
  });
  const result = await service.syncPending();
  assert.equal(result[0].syncState, 'synced');
  assert.equal(calls.filter(call => call.kind === 'json').length, 0);
});

test('moves a request to completed paths with completed status', async () => {
  const calls = [];
  const service = createCharacterRequestService({ db: await seededDb(), sync: createFakeSync({ calls }) });
  const result = await service.markCompleted('request-sync123');
  assert.equal(result.status, 'completed');
  assert.equal(result.artwork, 'character-requests/completed/request-sync123/artwork.webp');
  assert.deepEqual(calls.map(call => call.path), [
    'character-requests/completed/request-sync123/artwork.webp',
    'character-requests/completed/request-sync123/request.json',
    'character-requests/pending/request-sync123/artwork.webp',
    'character-requests/pending/request-sync123/request.json'
  ]);
});
