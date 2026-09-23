(function (root, factory) {
  const api = factory(root?.ForMySonsSaveContract);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsSaveStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, contract => {
  const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

  function validateSegment(value, label) {
    if (typeof value !== 'string' || !SEGMENT.test(value) || value === '.' || value === '..') throw new TypeError(`Invalid ${label}`);
    return value;
  }

  function validateProfile(value) {
    return contract ? contract.validateProfileId(value) : validateSegment(value, 'profile identifier');
  }

  function composite(profileId, appId, key) {
    validateProfile(profileId);
    validateSegment(appId, 'app identifier');
    validateSegment(key, 'save key');
    return JSON.stringify([profileId, appId, key]);
  }

  function createSaveStore(adapter) {
    if (!adapter?.get || !adapter?.put || !adapter?.list) throw new TypeError('Save adapter is incomplete');

    async function getRecord(profileId, appId, key) {
      return adapter.get(composite(profileId, appId, key));
    }

    async function putRecord(profileId, appId, key, value, kind = 'json') {
      const storageKey = composite(profileId, appId, key);
      const existing = await adapter.get(storageKey);
      const record = {
        profileId, appId, key, kind, value,
        updatedAt: new Date().toISOString(),
        revision: (existing?.revision || 0) + 1,
        syncState: 'pending'
      };
      await adapter.put(storageKey, record);
      return record;
    }

    return {
      async get(profileId, appId, key) { return getRecord(profileId, appId, key); },
      put(profileId, appId, key, value) { return putRecord(profileId, appId, key, value); },
      async getBlob(profileId, appId, key) {
        const record = await getRecord(profileId, appId, key);
        return record?.kind === 'blob' ? record.value : null;
      },
      putBlob(profileId, appId, key, blob) {
        if (typeof Blob === 'undefined' || !(blob instanceof Blob)) throw new TypeError('A Blob is required');
        return putRecord(profileId, appId, key, blob, 'blob');
      },
      async listPending(profileId) {
        validateProfile(profileId);
        return (await adapter.list()).filter(record => record.profileId === profileId && record.syncState === 'pending');
      },
      async markSynced(profileId, appId, key, remoteSha = null) {
        const storageKey = composite(profileId, appId, key);
        const record = await adapter.get(storageKey);
        if (!record) return null;
        const synced = { ...record, syncState: 'synced', remoteSha };
        await adapter.put(storageKey, synced);
        return synced;
      },
      async markConflict(profileId, appId, key, conflict) {
        const storageKey = composite(profileId, appId, key);
        const record = await adapter.get(storageKey);
        if (!record) return null;
        const conflicted = { ...record, syncState: 'conflict', conflict };
        await adapter.put(storageKey, conflicted);
        return conflicted;
      }
    };
  }

  function createIndexedDbAdapter(indexedDB = globalThis.indexedDB, databaseName = 'for-my-sons-shared-saves-v1') {
    if (!indexedDB) throw new Error('IndexedDB is unavailable');
    let databasePromise;
    function database() {
      if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('records')) db.createObjectStore('records');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Could not open local save storage'));
      });
      return databasePromise;
    }
    async function transaction(mode, operation) {
      const db = await database();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('records', mode);
        const store = tx.objectStore('records');
        let result;
        try { result = operation(store); }
        catch (error) { reject(error); return; }
        tx.oncomplete = () => resolve(result?.result ?? result);
        tx.onerror = () => reject(new Error('Local save transaction failed'));
        tx.onabort = () => reject(new Error('Local save transaction aborted'));
      });
    }
    return {
      get(key) {
        return database().then(db => new Promise((resolve, reject) => {
          const request = db.transaction('records', 'readonly').objectStore('records').get(key);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(new Error('Could not read local save'));
        }));
      },
      put(key, record) { return transaction('readwrite', store => store.put(record, key)); },
      list() {
        return database().then(db => new Promise((resolve, reject) => {
          const request = db.transaction('records', 'readonly').objectStore('records').getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(new Error('Could not list local saves'));
        }));
      }
    };
  }

  return { createSaveStore, createIndexedDbAdapter };
});
