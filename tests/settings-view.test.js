const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSettingsModel } = require('../shared/settings-view.js');

const root = path.resolve(__dirname, '..');

test('launcher exposes settings but no normal profile picker', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="current-profile-indicator"/);
  assert.match(html, /おうちの人設定/);
  assert.doesNotMatch(html, /id="profile-picker"/);
});

test('settings display model excludes secrets and private paths', () => {
  const model = buildSettingsModel({
    profile: { id: 'profile-1', label: '<b>profile-1</b>' },
    profiles: [{ id: 'profile-1', label: '<b>profile-1</b>' }, { id: 'profile-2', label: 'profile-2' }],
    lock: { unlocked: true },
    syncStatus: { state: 'pending', pending: 2, token: 'secret-pat', path: 'profiles/profile-1/private' }
  });
  assert.equal(model.currentProfile.label, '<b>profile-1</b>');
  assert.deepEqual(model.profiles.map(profile => profile.id), ['profile-1', 'profile-2']);
  assert.equal('token' in model.sync, false);
  assert.equal('path' in model.sync, false);
});

test('settings renderer uses textContent for untrusted labels', () => {
  const source = fs.readFileSync(path.join(root, 'shared/settings-view.js'), 'utf8');
  assert.match(source, /\.textContent\s*=/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(source, /api\.sync\.restore/);
});
