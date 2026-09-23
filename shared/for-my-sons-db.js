((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsDB = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const DB_NAME = 'for-my-sons-shared-v1';
  const DB_VERSION = 1;
  const STORE_NAMES = ['settings', 'profiles', 'avatars', 'saves', 'snapshots'];

  function encodeKey(key) {
    return Array.isArray(key)
      ? `array:${key.map(encodeKey).join('|')}`
      : `${typeof key}:${String(key)}`;
  }

  function clone(value) {
    if (value === undefined || value === null) return value;
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return value.slice(0);
    if (typeof structuredClone === 'function') return structuredClone(value);
    if (Array.isArray(value)) return value.map(clone);
    if (typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    }
    return value;
  }

  function assertStore(store) {
    if (!STORE_NAMES.includes(store)) throw new Error(`Unknown shared database store: ${store}`);
  }

  function createMemoryDatabase() {
    const stores = new Map(STORE_NAMES.map(name => [name, new Map()]));
    return {
      async get(store, key) {
        assertStore(store);
        return clone(stores.get(store).get(encodeKey(key)) ?? null);
      },
      async put(store, value, key) {
        assertStore(store);
        stores.get(store).set(encodeKey(key), clone(value));
        return clone(value);
      },
      async delete(store, key) {
        assertStore(store);
        stores.get(store).delete(encodeKey(key));
      },
      async list(store) {
        assertStore(store);
        return [...stores.get(store).values()].map(clone);
      }
    };
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function createIndexedDatabase(database) {
    return {
      async get(store, key) {
        return requestPromise(database.transaction(store, 'readonly').objectStore(store).get(key));
      },
      async put(store, value, key) {
        return requestPromise(database.transaction(store, 'readwrite').objectStore(store).put(value, key));
      },
      async delete(store, key) {
        await requestPromise(database.transaction(store, 'readwrite').objectStore(store).delete(key));
      },
      async list(store) {
        const request = database.transaction(store, 'readonly').objectStore(store).getAll();
        return requestPromise(request);
      },
      close() { database.close(); }
    };
  }

  function openDatabase(indexedDB = globalThis.indexedDB) {
    if (!indexedDB?.open) return Promise.reject(new Error('IndexedDB is unavailable'));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        for (const name of STORE_NAMES) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
        }
      };
      request.onsuccess = () => resolve(createIndexedDatabase(request.result));
      request.onerror = () => reject(request.error || new Error('Unable to open shared IndexedDB'));
    });
  }

  return { DB_NAME, DB_VERSION, STORE_NAMES, createMemoryDatabase, openDatabase };
});
