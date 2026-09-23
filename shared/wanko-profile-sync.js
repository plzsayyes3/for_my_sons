((root, factory) => {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WankoProfileSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, root => {
  const APP_ID = 'wanko-war';
  const SAVE_KEY = 'progress';
  const LEGACY_KEY = 'wankoGameProgressV1';
  const DATA_VERSION = 1;

  function meaningful(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
    return state.selectedStageId && state.selectedStageId !== 'S001'
      || (Array.isArray(state.discoveredElementIds) && state.discoveredElementIds.length > 0)
      || (Array.isArray(state.discoveredCharacterIds) && state.discoveredCharacterIds.length > 0)
      || (Array.isArray(state.clearedStageIds) && state.clearedStageIds.length > 0);
  }

  function createWankoProfileSync({
    api,
    profileId,
    definitions,
    progressStore,
    legacyStorage = null,
    confirmLegacy = async () => false,
    onStatus = () => {},
    debounceMs = 450
  } = {}) {
    if (!api?.save?.get || !api?.sync?.readProfileApp || !api?.sync?.writeProfileApp) {
      throw new TypeError('shared save/sync API is required');
    }
    if (typeof profileId !== 'string' || !profileId) throw new TypeError('profileId is required');
    if (!progressStore?.getState || !progressStore?.importState) throw new TypeError('progressStore is required');
    const merge = root?.WankoGameProgress?.mergeStates;
    if (typeof merge !== 'function') throw new TypeError('WankoGameProgress.mergeStates is required');

    let timer = null;
    let queuedState = null;
    let activePush = null;
    let lastRemoteSha = null;

    function emit(state, detail = {}) {
      try { onStatus({ state, ...detail }); } catch {}
    }

    async function readRemote() {
      try {
        const remote = await api.sync.readProfileApp(profileId, APP_ID);
        if (remote?.sha) lastRemoteSha = remote.sha;
        return { remote, error: null };
      } catch (error) {
        return { remote: null, error };
      }
    }

    async function pushOnce(state, expectedSha = null) {
      const payload = {
        dataVersion: DATA_VERSION,
        progress: root.WankoGameProgress.normalizeState(state, definitions)
      };
      return api.sync.writeProfileApp(profileId, APP_ID, payload, expectedSha ? { sha: expectedSha } : {});
    }

    async function push(state) {
      queuedState = null;
      const normalized = root.WankoGameProgress.normalizeState(state, definitions);
      if (activePush) {
        queuedState = normalized;
        return activePush;
      }

      activePush = (async () => {
        emit('syncing');
        try {
          let result = await pushOnce(normalized, lastRemoteSha);
          if (result?.status === 'conflict') {
            const latest = await api.sync.readProfileApp(profileId, APP_ID);
            const merged = merge(normalized, latest?.data?.progress || null, definitions);
            await progressStore.importState(merged);
            result = await pushOnce(merged, latest?.sha || null);
          }
          if (result?.sha) lastRemoteSha = result.sha;
          emit(result?.status === 'conflict' ? 'conflict' : 'synced', { result });
          return result;
        } catch (error) {
          emit('local-only', { error });
          return { status: 'local-only', error };
        } finally {
          activePush = null;
          if (queuedState) {
            const next = queuedState;
            queuedState = null;
            void push(next);
          }
        }
      })();

      return activePush;
    }

    function schedule(state) {
      queuedState = root.WankoGameProgress.normalizeState(state, definitions);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const next = queuedState;
        queuedState = null;
        if (next) void push(next);
      }, debounceMs);
    }

    async function flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (queuedState) {
        const next = queuedState;
        queuedState = null;
        return push(next);
      }
      return activePush || { status: 'idle' };
    }

    async function initialize() {
      emit('loading');
      const localRecord = await api.save.get(profileId, APP_ID, SAVE_KEY);
      const remoteResult = await readRemote();
      const remoteProgress = remoteResult.remote?.data?.progress || null;
      let localProgress = localRecord?.value || null;
      let migratedLegacy = false;

      if (!localProgress && !remoteProgress && legacyStorage?.getMeta) {
        try {
          const legacy = await legacyStorage.getMeta(LEGACY_KEY);
          if (meaningful(legacy)) {
            const approved = await confirmLegacy({
              clearedStageCount: Array.isArray(legacy.clearedStageIds) ? legacy.clearedStageIds.length : 0,
              discoveredElementCount: Array.isArray(legacy.discoveredElementIds) ? legacy.discoveredElementIds.length : 0,
              discoveredEnemyCount: Array.isArray(legacy.discoveredCharacterIds) ? legacy.discoveredCharacterIds.length : 0
            });
            if (approved) {
              localProgress = legacy;
              migratedLegacy = true;
            }
          }
        } catch {}
      }

      const merged = merge(localProgress, remoteProgress, definitions);
      await progressStore.importState(merged);
      const state = await progressStore.getState();

      if (!remoteResult.error) {
        const remoteNormalized = remoteProgress
          ? root.WankoGameProgress.normalizeState(remoteProgress, definitions)
          : null;
        if (!remoteNormalized || JSON.stringify(remoteNormalized) !== JSON.stringify(state)) {
          await push(state);
        } else {
          emit('synced');
        }
      } else {
        emit('local-only', { error: remoteResult.error });
      }

      return {
        state,
        migratedLegacy,
        remoteAvailable: !remoteResult.error,
        remoteError: remoteResult.error || null
      };
    }

    return { initialize, push, schedule, flush };
  }

  return { APP_ID, SAVE_KEY, DATA_VERSION, meaningful, createWankoProfileSync };
});
