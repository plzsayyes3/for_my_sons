(function (root, factory) {
  const api = factory(root?.ForMySonsSaveContract || (typeof require === 'function' ? require('./save-contract.js') : null));
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsWankoMigration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, contract => {
  const LEGACY_KEY = 'wankoGameProgressV1';
  function validProfileId(id) {
    try { contract.validateProfileId(id); return true; } catch { return false; }
  }
  async function copyLegacyWankoProgress({ legacyStorage, saveStore, profileId, confirm } = {}) {
    if (!validProfileId(profileId)) return { status: 'invalid-profile' };
    if (!legacyStorage?.getMeta || !saveStore?.get || !saveStore?.put || typeof confirm !== 'function') throw new TypeError('Migration dependencies are required');
    const legacy = await legacyStorage.getMeta(LEGACY_KEY);
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return { status: 'no-legacy-data' };
    const existing = await saveStore.get(profileId, 'wanko-war', 'progress');
    if (existing) return { status: 'already-exists' };
    const preview = {
      discoveredElementCount: Array.isArray(legacy.discoveredElementIds) ? legacy.discoveredElementIds.length : 0,
      discoveredEnemyCount: Array.isArray(legacy.discoveredCharacterIds) ? legacy.discoveredCharacterIds.length : 0,
      clearedStageCount: Array.isArray(legacy.clearedStageIds) ? legacy.clearedStageIds.length : 0
    };
    if (!await confirm(preview)) return { status: 'cancelled', preview };
    await saveStore.put(profileId, 'wanko-war', 'progress', legacy);
    return { status: 'copied', preview };
  }
  return { copyLegacyWankoProgress };
});
