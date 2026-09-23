(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsAutoSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const CHANNEL = 'for-my-sons-save-events-v1';
  function createAutoSync({ sync, profile, isUnlocked, target = globalThis.window, channelFactory, isOnline = () => globalThis.navigator?.onLine !== false, retryDelayMs = 30000, onResult = () => {} } = {}) {
    if (!sync?.syncProfile || !profile?.current || typeof isUnlocked !== 'function') throw new TypeError('Auto sync dependencies are required');
    const makeChannel = channelFactory || (typeof BroadcastChannel === 'function' && target ? name => new BroadcastChannel(name) : null);
    const channel = makeChannel?.(CHANNEL) || null;
    let active = null;
    let rerun = false;
    let retryAt = 0;

    async function trigger({ force = false } = {}) {
      if (!isOnline() || !isUnlocked()) return [];
      if (active) { rerun = true; return active; }
      if (!force && Date.now() < retryAt) return [];
      active = (async () => {
        const current = await profile.current();
        if (!current?.profileId || !isUnlocked() || !isOnline()) return [];
        try {
          const results = await sync.syncProfile(current.profileId);
          retryAt = 0;
          onResult({ profileId: current.profileId, results });
          return results;
        } catch {
          retryAt = Date.now() + retryDelayMs;
          onResult({ profileId: current.profileId, results: [], failed: true });
          return [{ status: 'error' }];
        }
      })();
      try { return await active; }
      finally {
        active = null;
        if (rerun) { rerun = false; void trigger(); }
      }
    }

    const onOnline = () => { void trigger(); };
    if (target?.addEventListener) target.addEventListener('online', onOnline);
    if (channel) channel.onmessage = event => {
      if (event.data?.type !== 'save-pending' || !isUnlocked() || !isOnline()) return;
      Promise.resolve(profile.current()).then(current => {
        if (current?.profileId === event.data.profileId) void trigger();
      }).catch(() => {});
    };

    return {
      trigger,
      resetBackoff() { retryAt = 0; },
      dispose() {
        target?.removeEventListener?.('online', onOnline);
        if (channel) { channel.onmessage = null; channel.close?.(); }
      }
    };
  }
  return { createAutoSync };
});
