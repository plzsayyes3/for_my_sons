((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SkyDashStarWallet = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const BASE_CLEAR_REWARD = 10;
  const DEFAULT_APP_ID = 'sky-dash';
  const DEFAULT_SAVE_KEY = 'star-wallet';

  function normalizeScore(score) {
    const value = Number(score);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.trunc(value)));
  }

  function getClearBonusMultiplier(score) {
    const normalized = normalizeScore(score);
    if (normalized === 100) return 2.0;
    if (normalized === 99) return 1.5;
    if (normalized >= 70) return 1.0;
    return 0;
  }

  function getClearReward(score) {
    return Math.trunc(BASE_CLEAR_REWARD * getClearBonusMultiplier(score));
  }

  function normalizeSavedStars(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.trunc(value));
    }
    const stars = Number(value?.stars);
    return Number.isFinite(stars) ? Math.max(0, Math.trunc(stars)) : 0;
  }

  function createStarWallet(saveStore, options = {}) {
    if (!saveStore?.get || !saveStore?.put) throw new TypeError('save store is required');
    const profileId = options.profileId;
    if (typeof profileId !== 'string' || !profileId) throw new TypeError('profileId is required');
    const appId = options.appId || DEFAULT_APP_ID;
    const saveKey = options.saveKey || DEFAULT_SAVE_KEY;
    const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
    const onError = typeof options.onError === 'function' ? options.onError : () => {};
    let stars = 0;
    let loaded = false;
    let writeQueue = Promise.resolve();

    function notify() {
      onChange(stars);
    }

    async function loadStarWallet() {
      const record = await saveStore.get(profileId, appId, saveKey);
      stars = normalizeSavedStars(record?.value);
      loaded = true;
      notify();
      return stars;
    }

    function saveStarWallet() {
      if (!loaded) return Promise.reject(new Error('star wallet is not loaded'));
      const snapshot = stars;
      const operation = writeQueue.then(() => saveStore.put(profileId, appId, saveKey, {
        version: 1,
        stars: snapshot
      }));
      writeQueue = operation.catch(() => {});
      return operation;
    }

    function addStars(amount) {
      if (!loaded) throw new Error('star wallet is not loaded');
      const value = Math.trunc(Number(amount));
      if (!Number.isFinite(value) || value <= 0) return stars;
      stars += value;
      notify();
      saveStarWallet().catch(onError);
      return stars;
    }

    function spendStars(amount) {
      if (!loaded) throw new Error('star wallet is not loaded');
      const value = Math.trunc(Number(amount));
      if (!Number.isFinite(value) || value <= 0) return false;
      if (stars < value) return false;
      stars -= value;
      notify();
      saveStarWallet().catch(onError);
      return true;
    }

    async function flush() {
      await writeQueue;
      return stars;
    }

    return {
      loadStarWallet,
      saveStarWallet,
      addStars,
      spendStars,
      flush,
      getStars: () => stars,
      getProfileId: () => profileId
    };
  }

  function createClearRewardGuard(addStars) {
    if (typeof addStars !== 'function') throw new TypeError('addStars is required');
    let rewardedRunId = null;

    return {
      grant(runId, score) {
        const reward = getClearReward(score);
        if (reward <= 0 || rewardedRunId === runId) return 0;
        rewardedRunId = runId;
        addStars(reward);
        return reward;
      },
      wasGranted(runId) {
        return rewardedRunId === runId;
      }
    };
  }

  return {
    BASE_CLEAR_REWARD,
    DEFAULT_APP_ID,
    DEFAULT_SAVE_KEY,
    getClearBonusMultiplier,
    getClearReward,
    createStarWallet,
    createClearRewardGuard
  };
});
