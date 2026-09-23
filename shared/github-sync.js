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

    function normalizeToken(value) {
      const compact = String(value || '').replace(/\s+/gu, '');
      if (!compact) return '';
      if (!/^[\x21-\x7E]+$/.test(compact)) {
        const error = new Error('Token contains non-ASCII characters');
        error.code = 'TOKEN_FORMAT';
        throw error;
      }
      return compact;
    }

    async function token() {
      return normalizeToken(await tokenProvider());
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

    async function writePath(path, value, options = {}) {
      const remote = await readRemote(path);
      if (options.sha && remote.exists && options.sha !== remote.sha) {
        return { status: 'conflict', remoteSha: remote.sha };
      }
      const payload = {
        message: options.message || `Sync ${path}`,
        content: encodeBase64(value),
        branch: settings.branch
      };
      if (remote.exists) payload.sha = remote.sha;
      const response = await request(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.status === 401 || response.status === 403) return { status: 'auth-error' };
      if (response.status === 409) return { status: 'conflict', remoteSha: remote.sha };
      if (!response.ok) return { status: 'pending', reason: 'remote-unavailable' };
      const body = await response.json();
      return {
        status: remote.exists ? 'synced' : 'created',
        sha: body.content?.sha || body.sha || null
      };
    }

    async function deletePath(path) {
      const remote = await readRemote(path);
      if (!remote.exists) return { status: 'absent' };
      const response = await request(path, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Complete ${path}`, sha: remote.sha, branch: settings.branch })
      });
      if (response.status === 401 || response.status === 403) return { status: 'auth-error' };
      if (response.status === 409) return { status: 'conflict', remoteSha: remote.sha };
      if (!response.ok) return { status: 'pending', reason: 'remote-unavailable' };
      return { status: 'deleted' };
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
      const current = await saveStore.readRecord(identity);
      const remote = await readRemote(saveStore.pathFor(current || { ...identity, kind: 'json' }));
      if (!remote.exists) throw new Error('Remote save not found');
      const profile = await profileManager.current();
      if (profile.id !== identity.profileId) throw new Error('Profile must be selected before restore');
      if (current) await saveStore.createSnapshot(identity);
      const isBinary = current?.kind === 'binary';
      if (isBinary) await saveStore.writeBinary(identity.appId, identity.saveKey, remote.content, current.contentType, current.extension);
      else await saveStore.writeJson(identity.appId, identity.saveKey, JSON.parse(new TextDecoder().decode(remote.content)));
      const next = await saveStore.readRecord(identity);
      await saveStore.markSynced(next, remote.sha);
      return saveStore.readRecord(identity);
    }

    async function listDirectory(path) {
      const response = await request(path, { method: 'GET' });
      if (response.status === 401 || response.status === 403) {
        const error = new Error('GitHub authentication failed');
        error.code = 'AUTH_FAILED';
        throw error;
      }
      if (!response.ok) throw new Error('GitHub directory read failed (' + response.status + ')');
      const body = await response.json();
      if (!Array.isArray(body)) throw new Error('GitHub path is not a directory');
      return body.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type,
        sha: item.sha || null
      }));
    }

    async function testConnection() {
      const pat = await token();
      if (!pat) {
        const error = new Error('Token is not configured');
        error.code = 'AUTH_REQUIRED';
        throw error;
      }

      const userResponse = await fetcher(settings.apiBase + '/user', {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + pat,
          'X-GitHub-Api-Version': API_VERSION
        }
      });

      if (userResponse.status === 401) {
        const error = new Error('Token is invalid or expired');
        error.code = 'TOKEN_INVALID';
        error.status = 401;
        throw error;
      }
      if (userResponse.status === 403) {
        const error = new Error('GitHub authentication is temporarily blocked or forbidden');
        error.code = 'TOKEN_FORBIDDEN';
        error.status = 403;
        throw error;
      }
      if (!userResponse.ok) {
        const error = new Error('GitHub user check failed (' + userResponse.status + ')');
        error.code = 'USER_CHECK_FAILED';
        error.status = userResponse.status;
        throw error;
      }

      const user = await userResponse.json();
      const schema = await readRemote('schema.json');
      if (!schema.exists) {
        const error = new Error('Save repository is not visible to this token');
        error.code = 'REPO_NOT_VISIBLE';
        error.status = 404;
        throw error;
      }
      return {
        ok: true,
        login: user.login || '',
        repo: settings.owner + '/' + settings.repo,
        branch: settings.branch
      };
    }

    async function readHouseholdSettings() {
      const remote = await readRemote('settings/household.json');
      if (!remote.exists) throw new Error('Household settings were not found');
      const parsed = JSON.parse(new TextDecoder().decode(remote.content));
      if (!parsed?.parentLock) throw new Error('Parent lock settings are missing');
      return {
        version: Number(parsed.version || 1),
        parentLock: parsed.parentLock,
        sha: remote.sha
      };
    }

    async function listProfiles() {
      const entries = await listDirectory('saves');
      const jsonFiles = entries.filter(item => item.type === 'file' && /[.]json$/i.test(item.name));
      const profiles = [];
      for (const item of jsonFiles) {
        const remote = await readRemote(item.path);
        if (!remote.exists) continue;
        try {
          const parsed = JSON.parse(new TextDecoder().decode(remote.content));
          const id = String(parsed.profileId || '').trim();
          if (!id) continue;
          profiles.push({
            id,
            label: String(parsed.displayName || id),
            order: Number.isFinite(Number(parsed.profileOrder)) ? Number(parsed.profileOrder) : Number.MAX_SAFE_INTEGER,
            path: item.path,
            sha: remote.sha
          });
        } catch {}
      }
      profiles.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'ja'));
      return profiles;
    }

    function safeSegment(value, name) {
      const text = String(value || '');
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(text)) throw new TypeError(name + ' is invalid');
      return text;
    }

    async function readProfileSave(profileId) {
      const id = safeSegment(profileId, 'profileId');
      const path = 'saves/' + id + '.json';
      const remote = await readRemote(path);
      if (!remote.exists) return { exists: false, path, record: null, sha: null };
      const record = JSON.parse(new TextDecoder().decode(remote.content));
      if (!record || typeof record !== 'object' || Array.isArray(record) || String(record.profileId || '') !== id) {
        throw new Error('Profile save is invalid');
      }
      return { exists: true, path, record, sha: remote.sha };
    }

    async function readProfileApp(profileId, appId) {
      const app = safeSegment(appId, 'appId');
      const remote = await readProfileSave(profileId);
      if (!remote.exists) return { exists: false, data: null, sha: null, revision: null };
      const apps = remote.record.apps && typeof remote.record.apps === 'object' && !Array.isArray(remote.record.apps)
        ? remote.record.apps
        : {};
      const data = apps[app] && typeof apps[app] === 'object' && !Array.isArray(apps[app])
        ? apps[app]
        : null;
      return {
        exists: Boolean(data),
        data: data ? JSON.parse(JSON.stringify(data)) : null,
        sha: remote.sha,
        revision: Number.isFinite(Number(remote.record.revision)) ? Number(remote.record.revision) : 0
      };
    }

    async function writeProfileApp(profileId, appId, data, options = {}) {
      const app = safeSegment(appId, 'appId');
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('app data must be an object');
      const remote = await readProfileSave(profileId);
      if (!remote.exists) throw new Error('Profile save was not found');
      const previousApps = remote.record.apps && typeof remote.record.apps === 'object' && !Array.isArray(remote.record.apps)
        ? remote.record.apps
        : {};
      const previousApp = previousApps[app] && typeof previousApps[app] === 'object' && !Array.isArray(previousApps[app])
        ? previousApps[app]
        : {};
      const appData = { ...previousApp, ...JSON.parse(JSON.stringify(data)) };
      const nextRecord = {
        ...remote.record,
        apps: { ...previousApps, [app]: appData },
        revision: (Number.isFinite(Number(remote.record.revision)) ? Number(remote.record.revision) : 0) + 1,
        updatedAt: new Date().toISOString()
      };
      const result = await writePath(remote.path, nextRecord, {
        sha: options.sha || remote.sha,
        message: options.message || ('Sync ' + app + ' for ' + profileId)
      });
      return {
        ...result,
        data: appData,
        revision: nextRecord.revision,
        updatedAt: nextRecord.updatedAt
      };
    }

    async function status() {
      const pending = saveStore?.listPending ? await saveStore.listPending() : [];
      return { configured: Boolean(settings.owner && settings.repo), pending: pending.length, state: pending.length ? 'pending' : 'idle' };
    }

    function configure(next = {}) {
      if (next.owner) settings.owner = String(next.owner);
      if (next.repo) settings.repo = String(next.repo);
      if (next.branch) settings.branch = String(next.branch);
      return { owner: settings.owner, repo: settings.repo, branch: settings.branch };
    }

    return {
      readRemote,
      readPath: readRemote,
      listDirectory,
      testConnection,
      readHouseholdSettings,
      listProfiles,
      readProfileSave,
      readProfileApp,
      writeProfileApp,
      writePath,
      deletePath,
      pushRecord,
      pullRecord,
      status,
      configure,
      encodeBase64,
      decodeBase64
    };
  }

  return { createGithubSync, encodeBase64, decodeBase64 };
});
