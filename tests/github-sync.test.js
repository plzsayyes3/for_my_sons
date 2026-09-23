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
