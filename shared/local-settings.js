(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsLocalSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function create() {
    let promise;
    const db = () => promise ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('for-my-sons-shared-saves-v1', 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('records')) request.result.createObjectStore('records');
        if (!request.result.objectStoreNames.contains('settings')) request.result.createObjectStore('settings');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Local settings are unavailable'));
    });
    return {
      async get(key) {
        const database = await db();
        return new Promise((resolve, reject) => {
          const request = database.transaction('settings', 'readonly').objectStore('settings').get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error('Could not read local settings'));
        });
      },
      async set(key, value) {
        const database = await db();
        return new Promise((resolve, reject) => {
          const transaction = database.transaction('settings', 'readwrite');
          transaction.objectStore('settings').put(value, key);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(new Error('Could not save local settings'));
        });
      }
    };
  }
  return { create };
});
