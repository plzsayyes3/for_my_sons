((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsParentRequests = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const SUPPORTED_TYPES = ['problem', 'feature'];
  const SUPPORTED_STATUSES = ['pending', 'working', 'done', 'declined'];
  const ID_PATTERN = /^request-[a-z0-9-]+$/;
  const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
  const MAX_MESSAGE_LENGTH = 2000;
  const MAX_GAME_NAME_LENGTH = 80;

  function safeSegment(value, name) {
    const text = String(value || '');
    if (!SEGMENT_PATTERN.test(text)) throw new TypeError(name + ' is invalid');
    return text;
  }

  function assertRequestId(value) {
    const id = String(value || '');
    if (!ID_PATTERN.test(id)) throw new TypeError('Invalid request ID');
    return id;
  }

  function normalizeType(value) {
    const type = String(value || '');
    if (!SUPPORTED_TYPES.includes(type)) throw new TypeError('Unsupported request type');
    return type;
  }

  function normalizeMessage(value) {
    const message = String(value || '').trim();
    if (!message) throw new TypeError('Message is required');
    if (message.length > MAX_MESSAGE_LENGTH) throw new TypeError('Message is too long');
    return message;
  }

  function normalizeGameName(value) {
    const gameName = String(value || '').trim();
    if (!gameName) throw new TypeError('Game name is required');
    if (gameName.length > MAX_GAME_NAME_LENGTH) throw new TypeError('Game name is too long');
    return gameName;
  }

  function normalizeCreatedAt(value) {
    const createdAt = String(value || '');
    if (!createdAt || Number.isNaN(Date.parse(createdAt))) throw new TypeError('Invalid createdAt');
    return createdAt;
  }

  function createRequestId() {
    const cryptoRef = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    const token = cryptoRef && typeof cryptoRef.randomUUID === 'function'
      ? cryptoRef.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    return 'request-' + String(token).toLowerCase();
  }

  function requestPath(record) {
    const id = assertRequestId(record?.id);
    const profileId = safeSegment(record?.profileId, 'profileId');
    const appId = safeSegment(record?.appId, 'appId');
    const createdAt = normalizeCreatedAt(record?.createdAt);
    const date = createdAt.slice(0, 10);
    return `requests/pending/${date}_${appId}_${profileId}_${id}.json`;
  }

  function requestPayload(record) {
    return {
      id: assertRequestId(record?.id),
      profileId: safeSegment(record?.profileId, 'profileId'),
      appId: safeSegment(record?.appId, 'appId'),
      gameName: normalizeGameName(record?.gameName),
      type: normalizeType(record?.type),
      message: normalizeMessage(record?.message),
      createdAt: normalizeCreatedAt(record?.createdAt),
      status: 'pending'
    };
  }

  function decodeRemoteJson(content) {
    if (content == null) return null;
    if (typeof content === 'object' && !(content instanceof Uint8Array) && !(content instanceof ArrayBuffer)) return content;
    const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    return value;
  }

  function samePayload(left, right) {
    try {
      return JSON.stringify(canonical(decodeRemoteJson(left))) === JSON.stringify(canonical(right));
    } catch {
      return false;
    }
  }

  function errorFromResult(result) {
    const error = new Error('Parent request remote write failed');
    if (result?.status === 'conflict') error.code = 'CONFLICT';
    else if (result?.status === 'auth-error') error.code = 'AUTH_REQUIRED';
    else if (result?.status === 'rate-limit') {
      error.code = 'RATE_LIMIT';
      error.resetAt = result.resetAt || null;
    } else error.code = 'REMOTE_UNAVAILABLE';
    return error;
  }

  function syncStateForError(error) {
    if (error?.code === 'AUTH_REQUIRED' || error?.code === 'AUTH_FAILED') return 'auth-required';
    if (error?.code === 'CONFLICT') return 'conflict';
    if (error?.code === 'RATE_LIMIT') return 'rate-limit';
    return 'error';
  }

  function createParentRequestService({ db, profileManager, sync, clock = () => Date.now() } = {}) {
    if (!db?.get || !db?.put || !db?.list) throw new TypeError('database adapter is required');
    if (!profileManager?.current) throw new TypeError('profile manager is required');

    function now() {
      return new Date(clock()).toISOString();
    }

    async function get(requestId) {
      return db.get('parentRequests', assertRequestId(requestId));
    }

    async function create({ requestId = createRequestId(), appId, gameName, type, message } = {}) {
      const id = assertRequestId(requestId);
      const existing = await get(id);
      if (existing) return { ...existing };

      const profile = await profileManager.current();
      const createdAt = now();
      const record = {
        id,
        profileId: safeSegment(profile?.id, 'profileId'),
        appId: safeSegment(appId, 'appId'),
        gameName: normalizeGameName(gameName),
        type: normalizeType(type),
        message: normalizeMessage(message),
        createdAt,
        status: 'pending',
        syncState: 'pending',
        lastError: null,
        remotePath: null,
        updatedAt: createdAt
      };
      record.remotePath = requestPath(record);
      await db.put('parentRequests', record, id);
      return { ...record };
    }

    async function markSynced(record, remoteSha = null) {
      const next = {
        ...record,
        status: 'pending',
        syncState: 'synced',
        lastError: null,
        remoteSha: remoteSha || record.remoteSha || null,
        updatedAt: now()
      };
      await db.put('parentRequests', next, next.id);
      return { ...next };
    }

    async function markFailed(record, error) {
      const state = syncStateForError(error);
      const next = {
        ...record,
        status: 'pending',
        syncState: state,
        lastError: state,
        updatedAt: now()
      };
      await db.put('parentRequests', next, next.id);
      return { ...next };
    }

    async function syncOne(record) {
      if (!sync?.readPath || (!sync?.writePathKnown && !sync?.writePath)) {
        const error = new Error('Parent request sync is not configured');
        error.code = 'REMOTE_UNAVAILABLE';
        throw error;
      }

      const payload = requestPayload(record);
      const path = record.remotePath || requestPath(record);
      const remote = await sync.readPath(path);

      if (remote.exists) {
        if (samePayload(remote.content, payload)) return markSynced({ ...record, remotePath: path }, remote.sha);
        const conflict = new Error('Parent request remote conflict');
        conflict.code = 'CONFLICT';
        throw conflict;
      }

      const result = sync.writePathKnown
        ? await sync.writePathKnown(path, payload, {
            expectAbsent: true,
            message: `Add ${record.appId} request from ${record.profileId}`
          })
        : await sync.writePath(path, payload, {
            sha: '__absent__',
            message: `Add ${record.appId} request from ${record.profileId}`
          });

      if (result?.status !== 'created' && result?.status !== 'synced') throw errorFromResult(result);
      return markSynced({ ...record, remotePath: path }, result.sha || null);
    }

    async function send(requestId) {
      const record = await get(requestId);
      if (!record) throw new Error('Parent request not found');
      if (record.syncState === 'synced') return { ...record };
      try {
        return await syncOne(record);
      } catch (error) {
        return markFailed(record, error);
      }
    }

    async function createAndSend(input = {}) {
      const record = await create(input);
      return send(record.id);
    }

    async function resend(requestId) {
      return send(requestId);
    }

    async function listUnsent() {
      return (await db.list('parentRequests'))
        .filter(record => record?.status === 'pending' && record?.syncState !== 'synced')
        .map(record => ({ ...record }));
    }

    return {
      create,
      createAndSend,
      send,
      resend,
      get,
      listUnsent,
      syncOne
    };
  }

  return {
    SUPPORTED_TYPES,
    SUPPORTED_STATUSES,
    MAX_MESSAGE_LENGTH,
    createRequestId,
    requestPath,
    requestPayload,
    createParentRequestService
  };
});
