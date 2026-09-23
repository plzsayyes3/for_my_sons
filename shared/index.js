(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsShared = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, root => {
  async function createForMySons({ allowedOrigin = '', fetchImpl = globalThis.fetch } = {}) {
    const settings = root.ForMySonsLocalSettings.create();
    const lock = root.ForMySonsParentLock.createParentLock(settings, root.crypto, allowedOrigin);
    const saveStore = root.ForMySonsSaveStore.createSaveStore(root.ForMySonsSaveStore.createIndexedDbAdapter());
    const sync = root.ForMySonsGitHubSync.createGitHubSync({ fetchImpl, tokenVault: lock, config: root.ForMySonsConfig, saveStore });
    const profile = root.ForMySonsProfileManager.createProfileManager({ sync });
    const migration = root.ForMySonsWankoMigration ? {
      copyLegacyProgress: (profileId, confirm) => root.ForMySonsWankoMigration.copyLegacyWankoProgress({
        legacyStorage: root.WankoLibrary,
        saveStore,
        profileId,
        confirm
      })
    } : null;
    return { lock, saveStore, sync, profile, migration };
  }
  return { createForMySons };
});
