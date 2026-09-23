((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsShared = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function eventFor(type, detail) {
    if (typeof CustomEvent === 'function') return new CustomEvent(type, { detail });
    return { type, detail };
  }

  async function createForMySons(options = {}) {
    const dbModule = options.db ? null : (typeof require === 'function' ? require('./for-my-sons-db.js') : globalThis.ForMySonsDB);
    const db = options.db || await dbModule.openDatabase();
    const profileModule = typeof require === 'function' ? require('./profile-manager.js') : globalThis.ForMySonsProfile;
    const parentModule = typeof require === 'function' ? require('./parent-lock.js') : globalThis.ForMySonsParentLock;
    const saveModule = typeof require === 'function' ? require('./save-store.js') : globalThis.ForMySonsSaveStore;
    const githubModule = typeof require === 'function' ? require('./github-sync.js') : globalThis.ForMySonsGithubSync;
    const requestModule = typeof require === 'function' ? require('./character-requests.js') : globalThis.ForMySonsCharacterRequests;
    const eventTarget = options.eventTarget || (typeof window !== 'undefined' ? window : null);
    const dispatch = (type, detail) => eventTarget?.dispatchEvent?.(eventFor(type, detail));
    const profile = profileModule.createProfileManager(db);
    const parent = parentModule.createParentLock(db, options.crypto || globalThis.crypto);
    const save = saveModule.createSaveStore(db, profile);
    const sync = githubModule.createGithubSync({
      fetch: options.fetch || globalThis.fetch,
      tokenProvider: async () => (await db.get('settings', 'githubToken'))?.value || '',
      saveStore: save,
      profileManager: profile,
      config: options.config || {}
    });
    const characterRequests = requestModule.createCharacterRequestService({ db, sync });

    profile.onChange(event => dispatch('for-my-sons-profile-changed', { type: event.type, profileId: event.profile.id }));

    async function emitSave(record) {
      dispatch('for-my-sons-save-changed', {
        profileId: record.profileId,
        appId: record.appId,
        saveKey: record.saveKey,
        localRevision: record.localRevision,
        syncState: record.syncState
      });
      return record;
    }

    const api = {
      profile: {
        current: () => profile.current(),
        list: () => profile.list(),
        setCurrent: profileId => profile.setCurrent(profileId),
        async importRemote(items = []) {
          const imported = [];
          for (const item of items) imported.push(await profile.upsert({ id: item.id, label: item.label }));
          return imported;
        },
        async setAvatar(profileId, blob, contentType) {
          const current = await profile.current();
          if (current.id !== profileId) throw new Error('Profile must be selected before changing its avatar');
          const result = await profile.setAvatar(profileId, blob, contentType);
          await emitSave(await save.writeBinary('profile', 'avatar', blob, contentType || blob.type, 'webp'));
          return result;
        },
        getAvatar: profileId => profile.getAvatar(profileId)
      },
      parent: {
        hasPin: () => parent.hasPin(),
        setPin: pin => parent.setPin(pin),
        verify: pin => parent.verify(pin),
        lock: () => parent.lock(),
        isUnlocked: () => parent.isUnlocked(),
        importRecord: value => parent.importRecord(value),
        exportRecord: () => parent.exportRecord()
      },
      save: {
        async json(appId, saveKey, value) { return emitSave(await save.writeJson(appId, saveKey, value)); },
        readJson: (appId, saveKey) => save.readJson(appId, saveKey),
        async binary(appId, saveKey, bytes, contentType, extension) { return emitSave(await save.writeBinary(appId, saveKey, bytes, contentType, extension)); },
        readBinary: (appId, saveKey) => save.readBinary(appId, saveKey),
        get: (profileId, appId, saveKey) => save.get(profileId, appId, saveKey),
        async put(profileId, appId, saveKey, value) {
          const record = await save.put(profileId, appId, saveKey, value);
          return emitSave(record);
        },
        pending: profileId => save.listPending(profileId)
      },
      sync: {
        async status() { return sync.status(); },
        async configure(next = {}) {
          if (Object.prototype.hasOwnProperty.call(next, 'token')) {
            const normalizedToken = String(next.token || '').replace(/\s+/gu, '');
            await db.put('settings', { key: 'githubToken', value: normalizedToken }, 'githubToken');
          }
          const result = sync.configure(next);
          dispatch('for-my-sons-sync-changed', result);
          return result;
        },
        async hasToken() {
          return Boolean((await db.get('settings', 'githubToken'))?.value);
        },
        async testConnection() {
          const result = await sync.testConnection();
          dispatch('for-my-sons-sync-changed', result);
          return result;
        },
        async listProfiles() {
          const remote = await sync.listProfiles();
          await api.profile.importRemote(remote);
          return remote;
        },
        readPath: path => sync.readPath(path),
        writePath: (path, value, options) => sync.writePath(path, value, options),
        readProfileApp: (profileId, appId) => sync.readProfileApp(profileId, appId),
        writeProfileApp: (profileId, appId, data, options) => sync.writeProfileApp(profileId, appId, data, options),
        async installHousehold() {
          const connection = await sync.testConnection();
          const household = await sync.readHouseholdSettings();
          const profiles = await sync.listProfiles();
          await api.profile.importRemote(profiles);
          await api.parent.importRecord(household.parentLock);
          dispatch('for-my-sons-sync-changed', connection);
          return { connection, profiles, householdVersion: household.version };
        },
        async push() {
          const records = await save.listPending(undefined, { includeValues: true });
          const results = [];
          for (const record of records) results.push(await sync.pushRecord(record));
          dispatch('for-my-sons-sync-changed', await sync.status());
          return results;
        },
        async restore(identity) {
          const result = await sync.pullRecord(identity);
          dispatch('for-my-sons-sync-changed', await sync.status());
          return result;
        }
      },
      characterRequests: {
        create: characterRequests.create,
        get: characterRequests.get,
        listPending: characterRequests.listPending,
        syncPending: characterRequests.syncPending,
        markCompleted: characterRequests.markCompleted
      }
    };
    return api;
  }

  return { createForMySons };
});
