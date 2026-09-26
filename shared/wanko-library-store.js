((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WankoLibraryStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const WANKO_STORE = 'wankos';
  const META_STORE = 'meta';
  const ACTIVE_KEY = 'activeWankoId';

  function clone(value) {
    if (value === undefined || value === null) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (Array.isArray(value)) return value.map(clone);
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
  }

  function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function createWankoLibraryStore({ db, clock = () => Date.now(), onChange = () => {}, onActiveChange = () => {} } = {}) {
    if (!db?.get || !db?.put || !db?.list) throw new TypeError('database adapter is required');

    async function getWanko(id) {
      if (!id) return null;
      return db.get(WANKO_STORE, id);
    }

    async function listWankos() {
      return (await db.list(WANKO_STORE))
        .filter(record => !record.archived)
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
        .map(clone);
    }

    async function putWanko(record, emit = true) {
      const saved = await db.put(WANKO_STORE, record, record.id);
      if (emit) onChange({ id: record.id });
      return clone(saved || record);
    }

    async function getMeta(key) {
      return (await db.get(META_STORE, key))?.value ?? null;
    }

    async function setMeta(key, value) {
      await db.put(META_STORE, { key, value }, key);
      return value;
    }

    async function setActiveWanko(id, { cloud = true } = {}) {
      await setMeta(ACTIVE_KEY, id || null);
      onActiveChange(id || null, { cloud });
      return id || null;
    }

    async function getActiveWanko() {
      const id = await getMeta(ACTIVE_KEY);
      const found = await getWanko(id);
      if (found && !found.archived) return clone(found);
      const list = await listWankos();
      return list[0] || null;
    }

    async function registerWanko({ name, blob, creator = 'family', stats = null, characterRequestId = null } = {}) {
      const now = new Date(clock()).toISOString();
      const record = {
        id: createId(),
        name: (name || 'なまえのないわんこ').trim().slice(0, 24),
        creator,
        createdAt: now,
        updatedAt: now,
        blob,
        stats: stats || { cost: 180, hp: 140, damage: 30, speed: 46, range: 44, cooldown: 0.72 },
        archived: false,
        syncStatus: 'pending',
        cloudPath: null,
        ...(characterRequestId ? { characterRequestId } : {})
      };
      const saved = await putWanko(record);
      await setActiveWanko(saved.id);
      return saved;
    }

    async function archiveWanko(id) {
      const record = await getWanko(id);
      if (!record) throw new Error('Wanko not found');
      if (record.archived) return clone(record);
      const archived = await putWanko({ ...record, archived: true, updatedAt: new Date(clock()).toISOString() });
      if (await getMeta(ACTIVE_KEY) === id) {
        const replacement = (await listWankos())[0] || null;
        await setActiveWanko(replacement?.id || null);
      }
      return archived;
    }

    return {
      registerWanko,
      listWankos,
      getWanko,
      getMeta,
      setMeta,
      setActiveWanko,
      getActiveWanko,
      archiveWanko
    };
  }

  return { createWankoLibraryStore };
});
