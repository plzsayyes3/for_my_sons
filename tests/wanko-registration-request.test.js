const test = require('node:test');
const assert = require('node:assert/strict');
const { createWankoRegistrationRequest } = require('../shared/wanko-registration-request.js');

test('creates and syncs a repository request from a local wanko', async () => {
  const calls = [];
  const service = {
    async create(input) { calls.push(['create', input]); return { requestId: 'request-test-1' }; },
    async syncPending() { calls.push(['sync']); return [{ requestId: 'request-test-1', syncState: 'synced' }]; }
  };
  const result = await createWankoRegistrationRequest({
    service,
    wanko: { id: 'local-1', name: 'テストわんこ', blob: 'image-blob' },
    faction: 'ally',
    markRequested: async (...args) => calls.push(['mark', ...args])
  });
  assert.equal(result.requestId, 'request-test-1');
  assert.equal(result.synced, true);
  assert.deepEqual(calls, [
    ['create', { name: 'テストわんこ', faction: 'ally', artwork: 'image-blob' }],
    ['sync'],
    ['mark', 'local-1', 'request-test-1']
  ]);
});

test('does not create a duplicate request for an already requested local wanko', async () => {
  let created = false;
  const result = await createWankoRegistrationRequest({
    service: { create: async () => { created = true; } },
    wanko: { id: 'local-2', name: '依頼済み', blob: 'image-blob', registrationRequestId: 'request-existing' },
    faction: 'enemy'
  });
  assert.equal(result.requestId, 'request-existing');
  assert.equal(result.duplicate, true);
  assert.equal(created, false);
});
