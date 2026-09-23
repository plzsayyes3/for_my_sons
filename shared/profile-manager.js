(function (root, factory) {
  const api = factory(root?.ForMySonsSaveContract);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsProfileManager = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, contract => {
  const CURRENT_KEY = 'forMySons.currentProfileId.v1';
  const CACHE_KEY = 'forMySons.verifiedProfileSummaries.v1';
  const validate = id => contract ? contract.validateProfileId(id) : /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id);

  function createProfileManager({ sync, localStorage = globalThis.localStorage, eventTarget = globalThis.window } = {}) {
    if (!sync?.listProfiles || !localStorage) throw new TypeError('Profile manager dependencies are required');
    let verified = null;

    async function listProfiles({ refresh = false } = {}) {
      if (!refresh && verified) return verified.map(profile => ({ ...profile }));
      try {
        const profiles = await sync.listProfiles();
        verified = profiles.map(profile => ({ ...profile }));
        localStorage.setItem(CACHE_KEY, JSON.stringify(verified));
      } catch (error) {
        if (verified) return verified.map(profile => ({ ...profile }));
        try {
          const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
          if (Array.isArray(cached)) return cached;
        } catch { /* Ignore malformed local summary cache. */ }
        throw error;
      }
      return verified.map(profile => ({ ...profile }));
    }

    async function current() {
      const profiles = await listProfiles();
      const id = localStorage.getItem(CURRENT_KEY);
      return profiles.find(profile => profile.profileId === id) || null;
    }

    async function switchProfile(profileId) {
      if (!validate(profileId)) throw new TypeError('Invalid profile identifier');
      const profiles = await listProfiles();
      const selected = profiles.find(profile => profile.profileId === profileId);
      if (!selected) throw new Error('Profile is not available');
      localStorage.setItem(CURRENT_KEY, profileId);
      const event = typeof CustomEvent === 'function'
        ? new CustomEvent('for-my-sons-profile-changed', { detail: { profileId } })
        : { type: 'for-my-sons-profile-changed', detail: { profileId } };
      eventTarget?.dispatchEvent?.(event);
      return { ...selected };
    }

    async function openSession() {
      const profile = await current();
      if (!profile) throw new Error('Select a profile in parent settings first');
      return Object.freeze({ profileId: profile.profileId });
    }

    return { listProfiles, current, switchProfile, openSession };
  }

  return { createProfileManager };
});
