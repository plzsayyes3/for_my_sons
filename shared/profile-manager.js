((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsProfile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const PROFILE_ID_PATTERN = /^profile-[a-z0-9-]+$/;
  const CURRENT_PROFILE_KEY = 'currentProfile';

  function assertProfileId(profileId) {
    if (typeof profileId !== 'string' || !PROFILE_ID_PATTERN.test(profileId)) {
      throw new TypeError('Invalid profile ID');
    }
  }

  function timestamp(clock) {
    return new Date(clock()).toISOString();
  }

  function normalizeProfile(profile, now) {
    assertProfileId(profile?.id);
    const label = typeof profile.label === 'string' && profile.label.trim()
      ? profile.label.trim()
      : profile.id;
    return {
      id: profile.id,
      label,
      createdAt: profile.createdAt || now,
      updatedAt: profile.updatedAt || now
    };
  }

  function createProfileManager(db, options = {}) {
    if (!db?.get || !db?.put || !db?.list) throw new TypeError('database adapter is required');
    const clock = options.clock || (() => Date.now());
    const listeners = new Set();

    function emit(type, profile) {
      const event = { type, profile: { ...profile } };
      for (const listener of listeners) listener(event);
    }

    async function getProfile(profileId) {
      return db.get('profiles', profileId);
    }

    async function upsert(profile) {
      const now = timestamp(clock);
      const existing = await getProfile(profile?.id);
      const normalized = normalizeProfile({ ...existing, ...profile }, now);
      normalized.createdAt = existing?.createdAt || normalized.createdAt;
      normalized.updatedAt = now;
      await db.put('profiles', normalized, normalized.id);
      return { ...normalized };
    }

    async function ensureProfile(profileId) {
      const existing = await getProfile(profileId);
      return existing || upsert({ id: profileId, label: profileId });
    }

    async function current() {
      const setting = await db.get('settings', CURRENT_PROFILE_KEY);
      const profileId = setting?.value || 'profile-1';
      assertProfileId(profileId);
      const profile = await ensureProfile(profileId);
      if (!setting) await db.put('settings', { key: CURRENT_PROFILE_KEY, value: profile.id }, CURRENT_PROFILE_KEY);
      return { ...profile };
    }

    async function list() {
      return (await db.list('profiles')).filter(profile => {
        try { assertProfileId(profile?.id); return true; } catch { return false; }
      }).map(profile => ({ ...profile }));
    }

    async function setCurrent(profileId) {
      assertProfileId(profileId);
      const profile = await ensureProfile(profileId);
      await db.put('settings', { key: CURRENT_PROFILE_KEY, value: profileId }, CURRENT_PROFILE_KEY);
      emit('currentProfile', profile);
      return { ...profile };
    }

    async function setAvatar(profileId, blob, contentType = blob?.type || 'application/octet-stream') {
      assertProfileId(profileId);
      if (blob == null) throw new TypeError('avatar data is required');
      const profile = await ensureProfile(profileId);
      await db.put('avatars', { id: profileId, blob, contentType }, profileId);
      const updated = await upsert(profile);
      emit('avatar', updated);
      return { ...updated };
    }

    async function getAvatar(profileId) {
      assertProfileId(profileId);
      const record = await db.get('avatars', profileId);
      return record ? { blob: record.blob, contentType: record.contentType } : null;
    }

    return {
      list,
      current,
      setCurrent,
      upsert,
      setAvatar,
      getAvatar,
      onChange(listener) {
        if (typeof listener !== 'function') throw new TypeError('listener must be a function');
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }

  return { PROFILE_ID_PATTERN, createProfileManager };
});
