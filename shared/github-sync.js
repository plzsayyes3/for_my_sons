(function (root, factory) {
  const api = factory(root?.ForMySonsSaveContract);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsGitHubSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, contract => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const encode = value => encodeURIComponent(value);
  const b64encode = text => typeof Buffer !== 'undefined'
    ? Buffer.from(text, 'utf8').toString('base64')
    : btoa(Array.from(encoder.encode(text), byte => String.fromCharCode(byte)).join(''));
  const b64decode = value => {
    const binary = typeof Buffer !== 'undefined' ? Buffer.from(value, 'base64').toString('binary') : atob(value.replace(/\s/g, ''));
    if (typeof Buffer !== 'undefined') return Buffer.from(value, 'base64').toString('utf8');
    return decoder.decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
  };

  function createGitHubSync({ fetchImpl = globalThis.fetch, tokenVault, config, saveStore = null } = {}) {
    if (!fetchImpl || !tokenVault?.withToken || !config?.owner || !config?.repo) throw new TypeError('GitHub sync dependencies are required');
    const apiBase = config.apiBase || 'https://api.github.com';
    const base = `${apiBase}/repos/${encode(config.owner)}/${encode(config.repo)}/contents`;
    const branch = config.branch || 'main';

    async function requestJson(url, init = {}) {
      const parsed = new URL(url);
      if (parsed.origin !== 'https://api.github.com' || !parsed.pathname.startsWith(`/repos/${encode(config.owner)}/${encode(config.repo)}/`)) {
        throw new Error('GitHub request destination is not allowed');
      }
      return tokenVault.withToken(async token => {
        let response;
        try {
          response = await fetchImpl(parsed.href, {
            ...init,
            redirect: 'error',
            headers: {
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              ...(init.headers || {}),
              Authorization: `Bearer ${token}`
            }
          });
        } catch {
          throw new Error('GitHub connection failed');
        }
        if (!response.ok) throw Object.assign(new Error(`GitHub request failed (${response.status})`), { status: response.status });
        return response.json();
      });
    }

    async function contents(path) {
      const url = `${base}/${path.split('/').map(encode).join('/')}?ref=${encode(branch)}`;
      const item = await requestJson(url);
      if (!item.content || item.encoding !== 'base64') throw new Error('Unsupported GitHub content response');
      return { data: JSON.parse(b64decode(item.content)), sha: item.sha };
    }

    async function readProfile(profileId) {
      if (!(contract?.validateProfileId ? safeValidate(profileId) : /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(profileId))) throw new TypeError('Invalid profile identifier');
      return contents(`saves/${profileId}.json`);
    }

    function safeValidate(value) {
      try { contract.validateProfileId(value); return true; } catch { return false; }
    }

    async function listProfiles() {
      const schema = (await contents('schema.json')).data;
      const listing = await requestJson(`${base}/saves?ref=${encode(branch)}`);
      if (!Array.isArray(listing)) throw new Error('Invalid private save listing');
      const available = new Set(listing.filter(item => item?.type === 'file').map(item => item.path));
      const files = [];
      for (const rawId of schema.profileOrder || []) {
        let profileId;
        try { profileId = contract?.validateProfileId ? contract.validateProfileId(rawId) : rawId; }
        catch { continue; }
        const path = `saves/${profileId}.json`;
        if (!available.has(path)) continue;
        try {
          const { data } = await contents(path);
          files.push({ path, content: data });
        } catch { /* A missing/inaccessible profile is not fabricated into the list. */ }
      }
      if (contract?.parseProfileIndex) return contract.parseProfileIndex(schema, files).profiles;
      return files.map(file => ({ profileId: file.content.profileId, label: file.content.displayName, revision: file.content.revision }));
    }

    async function syncRecord(profileId, record) {
      const { data: save, sha } = await readProfile(profileId);
      if (save.profileId !== profileId) throw new Error('Private save identity mismatch');
      if (record.remoteSha && record.remoteSha !== sha) {
        await saveStore?.markConflict(profileId, record.appId, record.key, { remoteSha: sha, localRevision: record.revision });
        return { status: 'conflict', remoteSha: sha };
      }
      if (!record.remoteSha && save.apps?.[record.appId]?.records?.[record.key] !== undefined) {
        await saveStore?.markConflict(profileId, record.appId, record.key, { remoteSha: sha, localRevision: record.revision });
        return { status: 'conflict', remoteSha: sha };
      }
      const app = save.apps?.[record.appId] || { dataVersion: 1, records: {} };
      const next = {
        ...save,
        apps: { ...(save.apps || {}), [record.appId]: { ...app, records: { ...(app.records || {}), [record.key]: record.value } } },
        revision: (Number(save.revision) || 0) + 1,
        updatedAt: new Date().toISOString()
      };
      try {
        const result = await requestJson(`${base}/saves/${encode(profileId)}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Update app save data', content: b64encode(JSON.stringify(next, null, 2)), sha, branch })
        });
        await saveStore?.markSynced(profileId, record.appId, record.key, result.content?.sha || null);
        return { status: 'synced', sha: result.content?.sha || null };
      } catch (error) {
        if (error.status === 409 || error.status === 422) {
          await saveStore?.markConflict(profileId, record.appId, record.key, { remoteSha: sha, localRevision: record.revision });
          return { status: 'conflict', remoteSha: sha };
        }
        throw error;
      }
    }

    async function syncProfile(profileId) {
      if (!saveStore) throw new Error('Local save store is not configured');
      const schema = (await contents('schema.json')).data;
      if (Number(schema.schemaVersion) < 2 || !schema.apps || typeof schema.apps !== 'object' || Array.isArray(schema.apps)) {
        throw new Error('Private save schema does not yet support app-scoped records');
      }
      const pending = await saveStore.listPending(profileId);
      const results = [];
      for (const record of pending) results.push({ key: record.key, ...(await syncRecord(profileId, record)) });
      return results;
    }

    return { requestJson, listProfiles, readProfile, syncProfile, syncRecord };
  }

  return { createGitHubSync };
});
