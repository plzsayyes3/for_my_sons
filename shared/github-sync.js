((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsGithubSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const API_VERSION = '2022-11-28';

  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return new Uint8Array(value);
    return new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  }

  function encodeBase64(value) {
    const bytes = toBytes(value);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function decodeBase64(value) {
    const normalized = String(value || '').replace(/\s/g, '');
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(normalized, 'base64'));
    const binary = atob(normalized);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function createGithubSync({ fetch: fetcher = globalThis.fetch, tokenProvider = async () => '', saveStore, profileManager, config = {} } = {}) {
    const settings = {
      owner: config.owner || 'plzsayyes3',
      repo: config.repo || 'For-My-Sons-save',
      branch: config.branch || 'main',
      apiBase: (config.apiBase || 'https://api.github.com').replace(/\/$/, '')
    };
    if (typeof fetcher !== 'function') throw new TypeError('fetch is required');

    function endpoint(path) {
      return `${settings.apiBase}/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${String(path).split('/').map(encodeURIComponent).join('/')}`;
    }

    async function token() {
      return String(await tokenProvider() || '');
    }

    async function request(path, options = {}) {
      const pat = await token();
      if (!pat) {
        const error = new Error('GitHub authentication is not configured');
        error.code = 'AUTH_REQUIRED';
        throw error;
      }
      return fetcher(endpoint(path), {
        ...options,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${pat}`,
          'X-GitHub-Api-Version': API_VERSION,
          ...(options.headers || {})
        }
      });
    }

    async function readRemote(path) {
      const response = await request(path, { method: 'GET' });
      if (response.status === 404) return { exists: false, content: null, sha: null, etag: null };
      if (response.status === 401 || response.status === 403) {
        const error = new Error('GitHub authentication failed');
        error.code = 'AUTH_FAILED';
        throw error;
      }
      if (!response.ok) throw new Error(`GitHub read failed (${response.status})`);
      const body = await response.json();
      return {
        exists: true,
        content: decodeBase64(body.content),
        sha: body.sha || null,
        etag: response.headers?.get('etag') || null
      };
    }

    function contentForRecord(record) {
      return record.kind === 'binary' ? toBytes(record.value) : new TextEncoder().encode(JSON.stringify(record.value));
    }

    async function pushRecord(record) {
      try {
        if (!await token()) return { status: 'auth-error' };
        const path = record.path || saveStore.pathFor(record);
        const remote = await readRemote(path);
        if (remote.exists && record.remoteSha !== remote.sha) {
          if (saveStore?.markConflict) await saveStore.markConflict(record, remote.sha);
          return { status: 'conflict', remoteSha: remote.sha };
        }
        const payload = {
          message: `Sync ${path}`,
          content: encodeBase64(contentForRecord(record)),
          branch: settings.branch
        };
        if (remote.exists) payload.sha = remote.sha;
        const response = await request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (response.status === 401 || response.status === 403) return { status: 'auth-error' };
        if (response.status === 409) return { status: 'conflict', remoteSha: remote.sha };
        if (!response.ok) return { status: 'pending', reason: 'remote-unavailable' };
        const body = await response.json();
        const sha = body.content?.sha || body.sha;
        if (saveStore?.markSynced && sha) await saveStore.markSynced(record, sha);
        return { status: remote.exists ? 'synced' : 'created', sha };
      } catch (error) {
        if (error?.code === 'AUTH_REQUIRED' || error?.code === 'AUTH_FAILED') return { status: 'auth-error' };
        return { status: 'pending', reason: 'offline' };
      }
    }

    async function pullRecord(identity) {
      const remote = await readRemote(saveStore.pathFor({ ...identity, kind: 'json' }));
      if (!remote.exists) throw new Error('Remote save not found');
      const current = await saveStore.readRecord(identity);
      if (current) await saveStore.createSnapshot(identity);
      const profile = await profileManager.current();
      if (profile.id !== identity.profileId) throw new Error('Profile must be selected before restore');
      const isBinary = current?.kind === 'binary';
      if (isBinary) await saveStore.writeBinary(identity.appId, identity.saveKey, remote.content, current.contentType, current.extension);
      else await saveStore.writeJson(identity.appId, identity.saveKey, JSON.parse(new TextDecoder().decode(remote.content)));
      const next = await saveStore.readRecord(identity);
      await saveStore.markSynced(next, remote.sha);
      return saveStore.readRecord(identity);
    }

    async function status() {
      const pending = saveStore?.listPending ? await saveStore.listPending() : [];
      return { configured: Boolean(settings.owner && settings.repo), pending: pending.length, state: pending.length ? 'pending' : 'idle' };
    }

    return { readRemote, pushRecord, pullRecord, status, encodeBase64, decodeBase64 };
  }

  return { createGithubSync, encodeBase64, decodeBase64 };
});
