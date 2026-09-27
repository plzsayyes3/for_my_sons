const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createMemoryDatabase } = require('../shared/for-my-sons-db.js');
const { createProfileManager } = require('../shared/profile-manager.js');
const {
  requestPath,
  requestPayload,
  createParentRequestService
} = require('../shared/parent-requests.js');

const skyDashIndex = fs.readFileSync(path.join(__dirname, '..', 'sky-dash-sample', 'index.html'), 'utf8');

function remoteContent(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

test('builds the requested pending path and payload shape', () => {
  const record = {
    id: 'request-abc123',
    profileId: 'soma',
    appId: 'sky-dash',
    gameName: 'Sky Dash',
    type: 'feature',
    message: 'ジャンプを2回できるようにしてほしい',
    createdAt: '2026-09-27T03:30:00.000Z',
    status: 'pending'
  };

  assert.equal(
    requestPath(record),
    'requests/pending/2026-09-27_sky-dash_soma_request-abc123.json'
  );
  assert.deepEqual(requestPayload(record), record);
});

test('uses the selected profile automatically and rejects an empty message', async () => {
  const db = createMemoryDatabase();
  const profiles = createProfileManager(db);
  await profiles.setCurrent('sora');
  const service = createParentRequestService({
    db,
    profileManager: profiles,
    clock: () => Date.parse('2026-09-27T03:30:00.000Z')
  });

  await assert.rejects(
    service.create({
      requestId: 'request-empty',
      appId: 'sky-dash',
      gameName: 'Sky Dash',
      type: 'problem',
      message: '   '
    }),
    /Message is required/
  );

  const request = await service.create({
    requestId: 'request-profile',
    appId: 'sky-dash',
    gameName: 'Sky Dash',
    type: 'problem',
    message: 'うごかない'
  });
  assert.equal(request.profileId, 'sora');
  assert.equal(request.status, 'pending');
  assert.equal(request.syncState, 'pending');
});

test('retries the same local request id without creating a duplicate', async () => {
  const db = createMemoryDatabase();
  const profiles = createProfileManager(db);
  await profiles.setCurrent('riku');
  let remote = null;
  let writeCount = 0;

  const sync = {
    async readPath() {
      return remote
        ? { exists: true, content: remoteContent(remote), sha: 'sha-remote' }
        : { exists: false, content: null, sha: null };
    },
    async writePathKnown(_path, payload) {
      writeCount += 1;
      remote = payload;
      return { status: 'created', sha: 'sha-created' };
    }
  };

  const service = createParentRequestService({
    db,
    profileManager: profiles,
    sync,
    clock: () => Date.parse('2026-09-27T03:30:00.000Z')
  });

  const created = await service.create({
    requestId: 'request-idempotent',
    appId: 'sky-dash',
    gameName: 'Sky Dash',
    type: 'feature',
    message: 'もっと速くしたい'
  });
  const first = await service.send(created.id);
  const second = await service.resend(created.id);

  assert.equal(first.id, created.id);
  assert.equal(second.id, created.id);
  assert.equal(second.syncState, 'synced');
  assert.equal(writeCount, 1);
  assert.equal((await db.list('parentRequests')).length, 1);
});

test('keeps the message and request id when remote sending fails', async () => {
  const db = createMemoryDatabase();
  const profiles = createProfileManager(db);
  await profiles.setCurrent('soma');
  const service = createParentRequestService({
    db,
    profileManager: profiles,
    sync: {
      async readPath() {
        const error = new Error('auth required');
        error.code = 'AUTH_REQUIRED';
        throw error;
      },
      async writePathKnown() {
        throw new Error('should not write');
      }
    }
  });

  const created = await service.create({
    requestId: 'request-retry',
    appId: 'sky-dash',
    gameName: 'Sky Dash',
    type: 'problem',
    message: 'ジャンプできない'
  });
  const result = await service.send(created.id);
  const stored = await service.get(created.id);

  assert.equal(result.syncState, 'auth-required');
  assert.equal(stored.id, 'request-retry');
  assert.equal(stored.message, 'ジャンプできない');
  assert.equal(stored.status, 'pending');
});

test('Sky Dash mounts the reusable papa request form and never embeds a token', () => {
  assert.match(skyDashIndex, /parent-requests\.js\?v=1/);
  assert.match(skyDashIndex, /parent-request-view\.js\?v=1/);
  assert.match(skyDashIndex, /appId:'sky-dash'/);
  assert.match(skyDashIndex, /gameName:'Sky Dash'/);
  assert.match(skyDashIndex, /papaRequestMount/);
  assert.doesNotMatch(skyDashIndex, /github_pat_[A-Za-z0-9_]+/);
  assert.doesNotMatch(skyDashIndex, /ghp_[A-Za-z0-9]+/);
});
