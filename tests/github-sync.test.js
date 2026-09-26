const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryDatabase } = require('../shared/for-my-sons-db.js');
const { createProfileManager } = require('../shared/profile-manager.js');
const { createSaveStore } = require('../shared/save-store.js');
const { createGithubSync } = require('../shared/github-sync.js');

function response(status, body = {}, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => headers[name.toLowerCase()] || null },
    async json() { return body; }
  };
}

async function setup(fetch) {
  const db = createMemoryDatabase();
  const profiles = createProfileManager(db);
  await profiles.current();
  const store = createSaveStore(db, profiles);
  const sync = createGithubSync({
    fetch,
    tokenProvider: async () => 'test-pat-never-log',
    saveStore: store,
    profileManager: profiles,
    config: { owner: 'plzsayyes3', repo: 'For-My-Sons-save', branch: 'main' }
  });
  return { db, profiles, store, sync };
}

test('encodes and decodes UTF-8 JSON and binary content', () => {
  const sync = createGithubSync({ config: {} });
  const encoded = sync.encodeBase64(new TextEncoder().encode('{"label":"こんにちは"}'));
  assert.deepEqual(new TextDecoder().decode(sync.decodeBase64(encoded)), '{"label":"こんにちは"}');
  assert.deepEqual([...sync.decodeBase64(sync.encodeBase64(Uint8Array.from([0, 255])))], [0, 255]);
});

test('creates a new remote file without leaking the PAT', async () => {
  const calls = [];
  const { store, sync } = await setup(async (url, options) => {
    calls.push({ url, options });
    return options.method === 'GET'
      ? response(404, { message: 'Not Found' })
      : response(201, { content: { sha: 'sha-created' } });
  });
  const record = await store.writeJson('paint', 'progress', { score: 2 });
  const result = await sync.pushRecord(record);
  assert.equal(result.status, 'created');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-pat-never-log');
  assert.equal(JSON.stringify(result).includes('test-pat-never-log'), false);
  assert.equal((await store.readRecord(record)).syncState, 'synced');
});

test('updates a matching SHA and sends the configured branch', async () => {
  const calls = [];
  const { store, sync } = await setup(async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'GET') return response(200, { content: Buffer.from('{}').toString('base64'), sha: 'sha-old' });
    return response(200, { content: '', sha: 'sha-new' });
  });
  const record = await store.writeJson('paint', 'progress', { score: 3 });
  await store.markSynced(record, 'sha-old');
  const updated = await store.writeJson('paint', 'progress', { score: 4 });
  updated.remoteSha = 'sha-old';
  const result = await sync.pushRecord(updated);
  assert.equal(result.status, 'synced');
  const payload = JSON.parse(calls[1].options.body);
  assert.equal(payload.branch, 'main');
  assert.equal(payload.sha, 'sha-old');
});

test('refuses to overwrite a changed remote SHA', async () => {
  const putRequests = [];
  const { store, sync } = await setup(async (_url, options) => {
    if (options.method === 'PUT') putRequests.push(options);
    return options.method === 'GET'
      ? response(200, { content: Buffer.from('{}').toString('base64'), sha: 'sha-new' })
      : response(200, { sha: 'unused' });
  });
  const record = await store.writeJson('paint', 'progress', { score: 4 });
  record.remoteSha = 'sha-old';
  const result = await sync.pushRecord(record);
  assert.deepEqual(result, { status: 'conflict', remoteSha: 'sha-new' });
  assert.equal(putRequests.length, 0);
  assert.equal((await store.readRecord(record)).syncState, 'conflict');
});

test('returns safe statuses for missing auth and network failure', async () => {
  const noAuth = createGithubSync({ fetch: async () => response(200), tokenProvider: async () => '', config: {} });
  assert.deepEqual(await noAuth.pushRecord({ path: 'profiles/profile-1/apps/paint/progress.json', value: '{}' }), { status: 'auth-error' });

  const { store, sync } = await setup(async () => { throw new Error('offline-secret'); });
  const record = await store.writeJson('paint', 'progress', { score: 5 });
  const result = await sync.pushRecord(record);
  assert.equal(result.status, 'pending');
  assert.equal(JSON.stringify(result).includes('offline-secret'), false);
});

test('returns an authentication status for GitHub 401 and 403 responses', async () => {
  for (const status of [401, 403]) {
    const sync = createGithubSync({
      fetch: async (_url, options) => options.method === 'GET'
        ? response(404)
        : response(status),
      tokenProvider: async () => 'secret-pat-never-log',
      config: { owner: 'plzsayyes3', repo: 'For-My-Sons-save', branch: 'main' }
    });
    const result = await sync.writePath('character-requests/pending/request-auth/artwork.webp', Uint8Array.from([1]), { kind: 'binary' });
    assert.equal(result.status, 'auth-error');
    assert.equal(JSON.stringify(result).includes('secret-pat-never-log'), false);
  }
});

test('restores binary records through the binary repository path', async () => {
  const calls = [];
  const { store, sync } = await setup(async (url, options) => {
    calls.push({ url, options });
    return response(200, { content: Buffer.from([7, 6, 5]).toString('base64'), sha: 'sha-binary' });
  });
  await store.writeBinary('kids-3d', 'model-stl', Uint8Array.from([1]), 'model/stl', 'stl');
  await sync.pullRecord({ profileId: 'profile-1', appId: 'kids-3d', saveKey: 'model-stl' });
  assert.match(calls[0].url, /\/files\/kids-3d\/model-stl\.stl$/);
  assert.deepEqual([...((await store.readBinary('kids-3d', 'model-stl')).bytes)], [7, 6, 5]);
});


test('merges wanko app data into an existing profile save without dropping legacy fields', async () => {
  const existing = {
    version: 1,
    profileId: 'child-a',
    displayName: 'Child A',
    profileOrder: 1,
    revision: 4,
    stageProgress: { unlockedStage: 1, clearedStages: [], bestResults: {} },
    wallet: { elementMedals: 3, gachaTickets: 1 }
  };
  const calls = [];
  const { sync } = await setup(async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'GET') {
      return response(200, { content: Buffer.from(JSON.stringify(existing)).toString('base64'), sha: 'sha-old' });
    }
    return response(200, { content: { sha: 'sha-new' } });
  });
  const result = await sync.writeProfileApp('child-a', 'wanko-war', {
    dataVersion: 1,
    progress: { selectedStageId: 'S002', discoveredElementIds: [1], discoveredCharacterIds: [], clearedStageIds: ['S001'] }
  });
  assert.equal(result.status, 'synced');
  const put = calls.find(call => call.options.method === 'PUT');
  const payload = JSON.parse(put.options.body);
  const saved = JSON.parse(Buffer.from(payload.content, 'base64').toString('utf8'));
  assert.equal(saved.profileId, 'child-a');
  assert.equal(saved.wallet.elementMedals, 3);
  assert.equal(saved.revision, 5);
  assert.equal(saved.apps['wanko-war'].progress.selectedStageId, 'S002');
});


test('writePath refuses to overwrite a file that appeared after an expected-absent read', async () => {
  const putRequests = [];
  const { sync } = await setup(async (_url, options) => {
    if (options.method === 'PUT') putRequests.push(options);
    return options.method === 'GET'
      ? response(200, { content: Buffer.from('{}').toString('base64'), sha: 'sha-surprise' })
      : response(200, { content: { sha: 'unused' } });
  });
  const result = await sync.writePath(
    'profiles/profile-1/apps/kids-3d-playgrand/project.json',
    { version: 1, project: {} },
    { sha: '__absent__' }
  );
  assert.deepEqual(result, { status: 'conflict', remoteSha: 'sha-surprise' });
  assert.equal(putRequests.length, 0);
});


test('writePathKnown updates with one PUT and no GET', async () => {
  const calls = [];
  const { sync } = await setup(async (url, options) => {
    calls.push({ url, options });
    return response(200, { content: { sha: 'sha-new' } });
  });
  const result = await sync.writePathKnown(
    'profiles/profile-1/apps/kids-3d-playgrand/project.json',
    Uint8Array.from([1, 2, 3]),
    { sha: 'sha-old', message: 'save' }
  );
  assert.equal(result.status, 'synced');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(JSON.parse(calls[0].options.body).sha, 'sha-old');
});

test('writePathKnown treats 422 as a safe conflict for expected-absent creates', async () => {
  const { sync } = await setup(async () => response(422, { message: 'already exists' }));
  const result = await sync.writePathKnown(
    'profiles/profile-1/apps/kids-3d-playgrand/history/backup.json',
    Uint8Array.from([1]),
    { expectAbsent: true }
  );
  assert.equal(result.status, 'conflict');
});

test('writePathKnown reports GitHub rate limiting separately from auth failure', async () => {
  const { sync } = await setup(async () => response(403, { message: 'rate limited' }, {
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': '1893456000'
  }));
  const result = await sync.writePathKnown(
    'profiles/profile-1/apps/kids-3d-playgrand/project.json',
    Uint8Array.from([1]),
    { sha: 'sha-old' }
  );
  assert.equal(result.status, 'rate-limit');
  assert.ok(result.resetAt);
});

test('deletePathKnown deletes with one request using a listed SHA', async () => {
  const calls = [];
  const { sync } = await setup(async (url, options) => {
    calls.push({ url, options });
    return response(200, {});
  });
  const result = await sync.deletePathKnown('history/old.json', 'sha-old');
  assert.equal(result.status, 'deleted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'DELETE');
  assert.equal(JSON.parse(calls[0].options.body).sha, 'sha-old');
});
