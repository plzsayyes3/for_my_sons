const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SUPPORTED_FACTIONS,
  normalizeCharacterRequest,
  requestPaths
} = require('../shared/character-requests.js');

test('normalizes a valid ally request without adding stats', () => {
  const request = normalizeCharacterRequest({
    requestId: 'request-abc123',
    name: '  クリオネン  ',
    faction: 'ally',
    createdAt: '2026-09-23T00:00:00.000Z'
  });

  assert.deepEqual(request, {
    id: 'request-abc123',
    requestId: 'request-abc123',
    name: 'クリオネン',
    faction: 'ally',
    createdAt: '2026-09-23T00:00:00.000Z',
    status: 'pending',
    artwork: 'character-requests/pending/request-abc123/artwork.webp',
    source: 'paint'
  });
  assert.equal('stats' in request, false);
});

test('supports only the initial factions and rejects unsafe input', () => {
  assert.deepEqual(SUPPORTED_FACTIONS, ['ally', 'enemy']);
  assert.throws(() => normalizeCharacterRequest({ requestId: '../x', name: 'x', faction: 'ally' }));
  assert.throws(() => normalizeCharacterRequest({ requestId: 'request-x', name: 'x', faction: 'boss' }));
  assert.throws(() => normalizeCharacterRequest({ requestId: 'request-x', name: '   ', faction: 'ally' }));
});

test('builds pending and completed paths from the request ID', () => {
  assert.deepEqual(requestPaths('request-abc123'), {
    pendingArtwork: 'character-requests/pending/request-abc123/artwork.webp',
    pendingJson: 'character-requests/pending/request-abc123/request.json',
    completedArtwork: 'character-requests/completed/request-abc123/artwork.webp',
    completedJson: 'character-requests/completed/request-abc123/request.json'
  });
});
