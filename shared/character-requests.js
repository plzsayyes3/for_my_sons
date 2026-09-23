((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsCharacterRequests = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const SUPPORTED_FACTIONS = ['ally', 'enemy'];
  const REQUEST_ID_PATTERN = /^request-[a-z0-9-]+$/;
  const MAX_NAME_LENGTH = 24;

  function assertRequestId(requestId) {
    if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) {
      throw new TypeError('Invalid character request ID');
    }
  }

  function assertFaction(faction) {
    if (!SUPPORTED_FACTIONS.includes(faction)) throw new TypeError('Unsupported character faction');
  }

  function normalizeName(name) {
    const normalized = String(name || '').trim();
    if (!normalized || normalized.length > MAX_NAME_LENGTH) throw new TypeError('Character name is required');
    return normalized;
  }

  function requestPaths(requestId) {
    assertRequestId(requestId);
    return {
      pendingArtwork: `character-requests/pending/${requestId}/artwork.webp`,
      pendingJson: `character-requests/pending/${requestId}/request.json`,
      completedArtwork: `character-requests/completed/${requestId}/artwork.webp`,
      completedJson: `character-requests/completed/${requestId}/request.json`
    };
  }

  function normalizeCharacterRequest(input = {}) {
    assertRequestId(input.requestId);
    const name = normalizeName(input.name);
    assertFaction(input.faction);
    const createdAt = String(input.createdAt || '');
    if (!createdAt || Number.isNaN(Date.parse(createdAt))) throw new TypeError('Invalid createdAt');
    const paths = requestPaths(input.requestId);
    return {
      id: input.requestId,
      requestId: input.requestId,
      name,
      faction: input.faction,
      createdAt,
      status: 'pending',
      artwork: paths.pendingArtwork,
      source: 'paint'
    };
  }

  async function defaultEncode(source, type, quality) {
    if (typeof source?.toBlob === 'function') {
      return new Promise(resolve => source.toBlob(resolve, type, quality));
    }
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
      return type === source.type ? source : null;
    }
    return null;
  }

  async function prepareArtwork(source, { encode = defaultEncode } = {}) {
    const webp = await encode(source, 'image/webp', 0.86);
    if (webp?.type === 'image/webp') return webp;
    const png = await encode(source, 'image/png', 1);
    if (png?.type === 'image/png') return png;
    if (source != null) return source;
    throw new TypeError('Artwork data is required');
  }

  function createRequestId() {
    const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `request-${uuid}`;
  }

  function contentTypeOf(artwork) {
    return artwork?.type || 'image/png';
  }

  function requestJson(record, paths = requestPaths(record.requestId), status = 'pending') {
    return {
      id: record.requestId,
      requestId: record.requestId,
      name: record.name,
      faction: record.faction,
      createdAt: record.createdAt,
      status,
      artwork: status === 'completed' ? paths.completedArtwork : paths.pendingArtwork,
      source: 'paint'
    };
  }

  function sameRequestJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function createCharacterRequestService({ db, sync, clock = () => Date.now(), imageEncoder } = {}) {
    if (!db?.get || !db?.put || !db?.list) throw new TypeError('database adapter is required');

    async function get(requestId) {
      assertRequestId(requestId);
      return db.get('characterRequests', requestId);
    }

    async function listPending() {
      return (await db.list('characterRequests')).filter(record =>
        record?.status === 'pending' || record?.syncState === 'pending' || record?.syncState === 'error'
      );
    }

    async function create({ requestId = createRequestId(), name, faction, artwork } = {}) {
      const preparedArtwork = await prepareArtwork(artwork, { encode: imageEncoder || defaultEncode });
      const createdAt = new Date(clock()).toISOString();
      const metadata = normalizeCharacterRequest({ requestId, name, faction, createdAt });
      const record = {
        ...metadata,
        artworkBlob: preparedArtwork,
        artworkContentType: contentTypeOf(preparedArtwork),
        syncState: 'pending',
        lastError: null,
        updatedAt: createdAt
      };
      await db.put('characterRequests', record, requestId);
      return { ...record };
    }

    async function syncOne(record) {
      if (!sync?.readPath || !sync?.writePath) throw new Error('Character request sync is not configured');
      const paths = requestPaths(record.requestId);
      const artworkRemote = await sync.readPath(paths.pendingArtwork);
      if (!artworkRemote.exists) {
        await sync.writePath(paths.pendingArtwork, record.artworkBlob, {
          kind: 'binary',
          contentType: record.artworkContentType,
          sha: artworkRemote.sha
        });
      }

      const payload = requestJson(record, paths);
      const jsonRemote = await sync.readPath(paths.pendingJson);
      if (jsonRemote.exists && !sameRequestJson(jsonRemote.content, payload)) {
        const conflict = new Error('Character request remote conflict');
        conflict.code = 'CONFLICT';
        throw conflict;
      }
      if (!jsonRemote.exists) await sync.writePath(paths.pendingJson, payload, { kind: 'json', sha: jsonRemote.sha });

      const next = {
        ...record,
        status: 'synced',
        syncState: 'synced',
        lastError: null,
        updatedAt: new Date(clock()).toISOString()
      };
      await db.put('characterRequests', next, record.requestId);
      return { ...next };
    }

    async function syncPending() {
      const records = await listPending();
      const results = [];
      for (const record of records) {
        try {
          results.push(await syncOne(record));
        } catch (error) {
          const next = {
            ...record,
            syncState: error?.code === 'CONFLICT' ? 'conflict' : 'error',
            lastError: error?.code === 'CONFLICT' ? 'conflict' : 'remote-unavailable',
            updatedAt: new Date(clock()).toISOString()
          };
          await db.put('characterRequests', next, record.requestId);
          results.push({ ...next });
        }
      }
      return results;
    }

    async function markCompleted(requestId) {
      const record = await get(requestId);
      if (!record) throw new Error('Character request not found');
      if (!sync?.writePath || !sync?.deletePath) throw new Error('Character request sync is not configured');
      const paths = requestPaths(requestId);
      const completedArtwork = paths.completedArtwork;
      const completedJson = paths.completedJson;
      await sync.writePath(completedArtwork, record.artworkBlob, {
        kind: 'binary',
        contentType: record.artworkContentType
      });
      await sync.writePath(completedJson, requestJson(record, paths, 'completed'), { kind: 'json' });
      await sync.deletePath(paths.pendingArtwork);
      await sync.deletePath(paths.pendingJson);
      const next = {
        ...record,
        status: 'completed',
        syncState: 'synced',
        artwork: completedArtwork,
        lastError: null,
        updatedAt: new Date(clock()).toISOString()
      };
      await db.put('characterRequests', next, requestId);
      return { ...next };
    }

    return { create, get, listPending, prepareArtwork, syncPending, markCompleted };
  }

  return {
    SUPPORTED_FACTIONS,
    normalizeCharacterRequest,
    requestPaths,
    prepareArtwork,
    createCharacterRequestService
  };
});
