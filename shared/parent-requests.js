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
  const MAX_REPLY_LENGTH = 2000;
  const MAX_GAME_NAME_LENGTH = 80;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const IMAGE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

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

  function imageSize(value) {
    if (!value) return 0;
    if (Number.isFinite(Number(value.size))) return Number(value.size);
    if (Number.isFinite(Number(value.byteLength))) return Number(value.byteLength);
    return 0;
  }

  function normalizeImage(value, contentType) {
    if (!value) return null;
    const type = String(contentType || value.type || '').toLowerCase();
    if (!IMAGE_TYPES.has(type)) throw new TypeError('Unsupported image type');
    const size = imageSize(value);
    if (!size || size > MAX_IMAGE_BYTES) throw new TypeError('Image is too large');
    return { value, contentType: type, size };
  }

  function imageExtension(contentType) {
    if (contentType === 'image/webp') return 'webp';
    if (contentType === 'image/jpeg') return 'jpg';
    if (contentType === 'image/png') return 'png';
    throw new TypeError('Unsupported image type');
  }

  function requestImagePath(requestId, contentType) {
    const id = assertRequestId(requestId);
    return `requests/pending/assets/${id}/image.${imageExtension(contentType)}`;
  }

  function normalizeImagePath(value, requestId) {
    const path = String(value || '').trim();
    if (!path) return null;
    const id = assertRequestId(requestId);
    const expectedPrefix = `requests/pending/assets/${id}/image.`;
    if (!path.startsWith(expectedPrefix) || !/[.](webp|jpg|png)$/i.test(path)) throw new TypeError('Invalid image path');
    return path;
  }

  function normalizeCreatedAt(value) {
    const createdAt = String(value || '');
    if (!createdAt || Number.isNaN(Date.parse(createdAt))) throw new TypeError('Invalid createdAt');
    return createdAt;
  }

  function normalizeReply(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const message = String(value.message || '').trim();
    if (!message) return null;
    if (message.length > MAX_REPLY_LENGTH) throw new TypeError('Reply is too long');
    const repliedAt = normalizeCreatedAt(value.repliedAt);
    const readAt = value.readAt ? normalizeCreatedAt(value.readAt) : null;
    return { message, repliedAt, readAt };
  }

  function normalizeStatus(value, fallback = 'pending') {
    const status = String(value || '');
    return SUPPORTED_STATUSES.includes(status) ? status : fallback;
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
    const id = assertRequestId(record?.id);
    const payload = {
      id,
      profileId: safeSegment(record?.profileId, 'profileId'),
      appId: safeSegment(record?.appId, 'appId'),
      gameName: normalizeGameName(record?.gameName),
      type: normalizeType(record?.type),
      message: normalizeMessage(record?.message),
      createdAt: normalizeCreatedAt(record?.createdAt),
      status: 'pending'
    };
    const image = normalizeImagePath(record?.image || record?.imagePath, id);
    if (image) payload.image = image;
    return payload;
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
      const remoteBase = requestPayload(decodeRemoteJson(left));
      const localBase = requestPayload(right);
      return JSON.stringify(canonical(remoteBase)) === JSON.stringify(canonical(localBase));
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

    async function create({ requestId = createRequestId(), appId, gameName, type, message, image = null, imageContentType = '' } = {}) {
      const id = assertRequestId(requestId);
      const existing = await get(id);
      if (existing) return { ...existing };

      const profile = await profileManager.current();
      const createdAt = now();
      const preparedImage = normalizeImage(image, imageContentType);
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
        imagePath: preparedImage ? requestImagePath(id, preparedImage.contentType) : null,
        imageBlob: preparedImage?.value || null,
        imageContentType: preparedImage?.contentType || null,
        imageSize: preparedImage?.size || 0,
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

      if (record.imagePath && record.imageBlob) {
        const imageRemote = await sync.readPath(record.imagePath);
        if (!imageRemote.exists) {
          const imageResult = sync.writePathKnown
            ? await sync.writePathKnown(record.imagePath, record.imageBlob, {
                expectAbsent: true,
                message: `Add image for ${record.appId} request from ${record.profileId}`
              })
            : await sync.writePath(record.imagePath, record.imageBlob, {
                sha: '__absent__',
                message: `Add image for ${record.appId} request from ${record.profileId}`
              });
          if (imageResult?.status !== 'created' && imageResult?.status !== 'synced') throw errorFromResult(imageResult);
        }
      }

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

    async function listUnsent(options = {}) {
      const appId = options.appId ? safeSegment(options.appId, 'appId') : null;
      let profileId = options.profileId ? safeSegment(options.profileId, 'profileId') : null;
      if (!profileId && options.currentProfileOnly === true) {
        const profile = await profileManager.current();
        profileId = safeSegment(profile?.id, 'profileId');
      }
      return (await db.list('parentRequests'))
        .filter(record =>
          record?.status === 'pending' &&
          record?.syncState !== 'synced' &&
          (!appId || record?.appId === appId) &&
          (!profileId || record?.profileId === profileId)
        )
        .map(record => ({ ...record }));
    }

    async function refreshReplies(options = {}) {
      if (!sync?.readPath) return [];
      const appId = options.appId ? safeSegment(options.appId, 'appId') : null;
      let profileId = options.profileId ? safeSegment(options.profileId, 'profileId') : null;
      if (!profileId && options.currentProfileOnly === true) {
        const profile = await profileManager.current();
        profileId = safeSegment(profile?.id, 'profileId');
      }

      const records = (await db.list('parentRequests'))
        .filter(record =>
          (!appId || record?.appId === appId) &&
          (!profileId || record?.profileId === profileId)
        );
      const replies = [];

      for (const record of records) {
        const path = record.remotePath || requestPath(record);
        try {
          const remote = await sync.readPath(path);
          if (!remote?.exists) continue;
          const payload = decodeRemoteJson(remote.content);
          if (!samePayload(payload, requestPayload(record))) continue;
          const reply = normalizeReply(payload?.reply);
          const next = {
            ...record,
            status: normalizeStatus(payload?.status, record.status || 'pending'),
            syncState: 'synced',
            lastError: null,
            remotePath: path,
            remoteSha: remote.sha || record.remoteSha || null,
            reply,
            updatedAt: now()
          };
          await db.put('parentRequests', next, next.id);
          if (reply) replies.push({ ...next });
        } catch {
          continue;
        }
      }

      replies.sort((a, b) => Date.parse(a.reply?.repliedAt || 0) - Date.parse(b.reply?.repliedAt || 0));
      return replies;
    }

    async function markReplyRead(requestId) {
      if (!sync?.readPath || (!sync?.writePathKnown && !sync?.writePath)) {
        const error = new Error('Parent request sync is not configured');
        error.code = 'REMOTE_UNAVAILABLE';
        throw error;
      }
      const record = await get(requestId);
      if (!record) throw new Error('Parent request not found');
      const profile = await profileManager.current();
      if (profile?.id !== record.profileId) throw new Error('Profile must match the request');

      const path = record.remotePath || requestPath(record);
      const remote = await sync.readPath(path);
      if (!remote?.exists) return { ok:false, reason:'missing', record:{ ...record } };
      const payload = decodeRemoteJson(remote.content);
      if (!samePayload(payload, requestPayload(record))) return { ok:false, reason:'mismatch', record:{ ...record } };
      const reply = normalizeReply(payload?.reply);
      if (!reply) return { ok:false, reason:'no-reply', record:{ ...record } };

      if (reply.readAt) {
        const next = {
          ...record,
          status: normalizeStatus(payload?.status, record.status || 'pending'),
          syncState: 'synced',
          remotePath: path,
          remoteSha: remote.sha || record.remoteSha || null,
          reply,
          updatedAt: now()
        };
        await db.put('parentRequests', next, next.id);
        return { ok:true, reason:'already-read', record:{ ...next } };
      }

      const readAt = now();
      const nextPayload = {
        ...payload,
        reply: {
          ...payload.reply,
          message: reply.message,
          repliedAt: reply.repliedAt,
          readAt
        }
      };
      const result = sync.writePathKnown
        ? await sync.writePathKnown(path, nextPayload, {
            sha: remote.sha,
            message: `Mark ${record.appId} reply read by ${record.profileId}`
          })
        : await sync.writePath(path, nextPayload, {
            sha: remote.sha,
            message: `Mark ${record.appId} reply read by ${record.profileId}`
          });
      if (result?.status !== 'synced' && result?.status !== 'created') throw errorFromResult(result);

      const next = {
        ...record,
        status: normalizeStatus(payload?.status, record.status || 'pending'),
        syncState: 'synced',
        lastError: null,
        remotePath: path,
        remoteSha: result.sha || remote.sha || record.remoteSha || null,
        reply: { ...reply, readAt },
        updatedAt: readAt
      };
      await db.put('parentRequests', next, next.id);
      return { ok:true, reason:'read', record:{ ...next } };
    }

    return {
      create,
      createAndSend,
      send,
      resend,
      get,
      listUnsent,
      refreshReplies,
      markReplyRead,
      syncOne
    };
  }

  return {
    SUPPORTED_TYPES,
    SUPPORTED_STATUSES,
    MAX_MESSAGE_LENGTH,
    MAX_REPLY_LENGTH,
    MAX_IMAGE_BYTES,
    createRequestId,
    requestPath,
    requestImagePath,
    requestPayload,
    createParentRequestService
  };
});
