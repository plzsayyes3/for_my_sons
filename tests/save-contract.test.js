const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProfileId, parseProfileIndex, normalizeSaveRecord } = require('../shared/save-contract.js');

const schema = {
  schemaVersion: 1,
  profileOrder: ['profile-b', 'profile-a'],
  saveShape: { required: ['profileId', 'displayName', 'revision'] }
};

test('validates profile IDs as safe single path segments', () => {
  assert.equal(validateProfileId('profile-a'), 'profile-a');
  for (const value of ['', '../profile-a', 'a/b', 'a\\b', '.']) {
    assert.throws(() => validateProfileId(value));
  }
});

test('maps dynamic profile summaries in schema order without inventing missing saves', () => {
  const result = parseProfileIndex(schema, [
    { path: 'saves/profile-a.json', content: { profileId: 'profile-a', displayName: 'Child A', revision: 2 } },
    { path: 'saves/profile-b.json', content: { profileId: 'profile-b', displayName: 'Child B', revision: 1 } }
  ]);
  assert.deepEqual(result.profiles.map(profile => profile.profileId), ['profile-b', 'profile-a']);
  assert.deepEqual(result.profiles.map(profile => profile.label), ['Child B', 'Child A']);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(parseProfileIndex(schema, []).profiles, []);
});

test('rejects mismatched identity and preserves all existing and extension fields', () => {
  const record = {
    version: 1, profileId: 'profile-a', displayName: 'Child A', revision: 4,
    profileOrder: 3, stageProgress: [1], privateExtension: { keep: true }
  };
  assert.throws(() => normalizeSaveRecord(record, 'profile-b'));
  const normalized = normalizeSaveRecord(record, 'profile-a');
  assert.deepEqual(normalized, record);
  assert.notEqual(normalized, record);
});

test('reports malformed and duplicate private profile entries instead of using them', () => {
  const result = parseProfileIndex({ ...schema, profileOrder: ['../escape', 'profile-a', 'profile-a'] }, [
    { path: 'saves/profile-a.json', content: { profileId: 'profile-a', displayName: 'Child A', revision: 1 } }
  ]);
  assert.equal(result.profiles.length, 1);
  assert.ok(result.errors.length >= 2);
});
