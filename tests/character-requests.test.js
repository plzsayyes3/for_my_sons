const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SUPPORTED_FACTIONS,
  normalizeCharacterRequest,
  requestPaths,
  createCharacterRequestService,
  prepareArtwork
} = require('../shared/character-requests.js');
const { createMemoryDatabase } = require('../shared/for-my-sons-db.js');

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

test('creates a request locally before attempting synchronization', async () => {
  const calls = [];
  const service = createCharacterRequestService({
    db: createMemoryDatabase(),
    sync: { pushCharacterRequest: async () => calls.push('remote') }
  });

  const request = await service.create({
    name: 'ねこわん',
    faction: 'enemy',
    artwork: new Uint8Array([1, 2, 3])
  });

  assert.equal(request.status, 'pending');
  assert.equal(request.syncState, 'pending');
  assert.deepEqual(calls, []);
  assert.equal((await service.get(request.requestId)).name, 'ねこわん');
});

test('uses WebP when available and PNG when the browser encoder cannot produce WebP', async () => {
  const source = { width: 512, height: 512 };
  const webpBlob = { type: 'image/webp', size: 12 };
  const pngBlob = { type: 'image/png', size: 12 };
  const webp = await prepareArtwork(source, { encode: (_source, type) => type === 'image/webp' ? webpBlob : pngBlob });
  assert.equal(webp.type, 'image/webp');
  const png = await prepareArtwork(source, { encode: (_source, type) => type === 'image/png' ? pngBlob : null });
  assert.equal(png.type, 'image/png');
});
