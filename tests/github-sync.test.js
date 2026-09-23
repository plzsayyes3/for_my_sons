const test = require('node:test');
const assert = require('node:assert/strict');
const { createGitHubSync } = require('../shared/github-sync.js');

const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64');
function setup(responses = {}, saveStore = null) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const response = responses[String(url)] || { status: 404, ok: false, json: async () => ({ message: 'not found' }) };
    return response;
  };
  const tokenVault = { withToken: fn => fn('synthetic-token') };
  const sync = createGitHubSync({ fetchImpl, tokenVault, saveStore, config: { owner: 'example-owner', repo: 'private-save', branch: 'main' } });
  return { sync, calls };
}
const response = (body, sha = 'sha-a') => ({ ok: true, status: 200, json: async () => ({ sha, encoding: 'base64', content: encoded(body) }) });

test('lists profile summaries dynamically in private schema order', async () => {
  const schemaUrl = 'https://api.github.com/repos/example-owner/private-save/contents/schema.json?ref=main';
  const listUrl = 'https://api.github.com/repos/example-owner/private-save/contents/saves?ref=main';
  const fileA = 'https://api.github.com/repos/example-owner/private-save/contents/saves/profile-a.json?ref=main';
  const fileB = 'https://api.github.com/repos/example-owner/private-save/contents/saves/profile-b.json?ref=main';
  const { sync } = setup({
    [schemaUrl]: response({ schemaVersion: 1, profileOrder: ['profile-b', 'profile-a'] }),
    [listUrl]: { ok: true, status: 200, json: async () => [
      { path: 'saves/profile-a.json', type: 'file' }, { path: 'saves/profile-b.json', type: 'file' }
    ] },
    [fileA]: response({ profileId: 'profile-a', displayName: 'Child A', revision: 1 }),
    [fileB]: response({ profileId: 'profile-b', displayName: 'Child B', revision: 2 })
  });
  const profiles = await sync.listProfiles();
  assert.deepEqual(profiles.map(profile => profile.profileId), ['profile-b', 'profile-a']);
});

test('never sends authorization to a non-GitHub API host', async () => {
  const { sync, calls } = setup();
  await assert.rejects(sync.requestJson('https://attacker.example/data'));
  assert.equal(calls.length, 0);
});

test('uses only the configured GitHub API host and redacts response failures', async () => {
  const { sync, calls } = setup();
  await assert.rejects(sync.requestJson('https://api.github.com/repos/example-owner/private-save/contents/schema.json?ref=main'));
  assert.equal(new URL(calls[0].url).hostname, 'api.github.com');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-token');
});

test('rejects a private profile path traversal before making an API request', async () => {
  const { sync, calls } = setup();
  await assert.rejects(sync.readProfile('../escape'));
  assert.equal(calls.length, 0);
});

test('refuses private writes until the additive apps schema is present', async () => {
  const schemaUrl = 'https://api.github.com/repos/example-owner/private-save/contents/schema.json?ref=main';
  const { sync, calls } = setup({ [schemaUrl]: response({ schemaVersion: 1, profileOrder: [] }) }, {
    listPending: async () => [{ profileId: 'profile-a', appId: 'wanko-war', key: 'progress', value: {}, revision: 1 }]
  });
  await assert.rejects(sync.syncProfile('profile-a'), /schema does not yet support/i);
  assert.equal(calls.some(call => call.options.method === 'PUT'), false);
});

test('does not overwrite an existing same-app remote value without a matching baseline', async () => {
  const schemaUrl = 'https://api.github.com/repos/example-owner/private-save/contents/schema.json?ref=main';
  const profileUrl = 'https://api.github.com/repos/example-owner/private-save/contents/saves/profile-a.json?ref=main';
  let markedConflict = false;
  const { sync, calls } = setup({
    [schemaUrl]: response({ schemaVersion: 2, profileOrder: [], apps: { description: 'profile app-scoped records' } }),
    [profileUrl]: response({ profileId: 'profile-a', revision: 2, apps: { 'wanko-war': { records: { progress: { clearedStageIds: ['S001'] } } } } })
  }, {
    listPending: async () => [{ profileId: 'profile-a', appId: 'wanko-war', key: 'progress', value: { clearedStageIds: [] }, revision: 1 }],
    markConflict: async () => { markedConflict = true; }
  });
  const result = await sync.syncProfile('profile-a');
  assert.equal(result[0].status, 'conflict');
  assert.equal(markedConflict, true);
  assert.equal(calls.some(call => call.options.method === 'PUT'), false);
});
