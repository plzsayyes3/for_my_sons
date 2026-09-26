(() => {
  const DB_NAME = "for-my-sons-wanko-library";
  const DB_VERSION = 1;
  const WANKO_STORE = "wankos";
  const META_STORE = "meta";
  const ACTIVE_KEY = "activeWankoId";

  function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
    return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(WANKO_STORE)) {
          const store = db.createObjectStore(WANKO_STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
          store.createIndex("updatedAt", "updatedAt");
          store.createIndex("syncStatus", "syncStatus");
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function requestResult(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const libraryStore = WankoLibraryStore.createWankoLibraryStore({
    db: {
      async get(store, key) {
        const db = await openDB();
        try { return await requestResult(db.transaction(store, "readonly").objectStore(store).get(key)); }
        finally { db.close(); }
      },
      async put(store, value, key) {
        const db = await openDB();
        try {
          await new Promise((resolve, reject) => {
            const tx = db.transaction(store, "readwrite");
            tx.objectStore(store).put(value, key);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          });
          return value;
        } finally { db.close(); }
      },
      async list(store) {
        const db = await openDB();
        try { return await requestResult(db.transaction(store, "readonly").objectStore(store).getAll()); }
        finally { db.close(); }
      }
    },
    onChange: detail => window.dispatchEvent(new CustomEvent("wanko-library-changed", { detail })),
    onActiveChange: (id, { cloud = true } = {}) => {
      window.dispatchEvent(new CustomEvent("wanko-active-changed", { detail: { id } }));
      if (id && cloud && window.WankoCloud?.configured()) {
        WankoCloud.getSession().then(session => {
          if (session) WankoCloud.setActiveWanko(id).catch(error => console.warn("Active wanko cloud sync failed", error));
        }).catch(() => {});
      }
    }
  });

  async function putWanko(record, emit = true) {
    const db = await openDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(WANKO_STORE, "readwrite");
        tx.objectStore(WANKO_STORE).put(record);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    if (emit) window.dispatchEvent(new CustomEvent("wanko-library-changed", { detail: { id: record.id } }));
    return record;
  }

  async function registerWanko(input = {}) {
    const record = await libraryStore.registerWanko(input);
    syncNow().catch(() => {});
    return record;
  }

  async function listWankos() {
    return libraryStore.listWankos();
  }

  async function getWanko(id) {
    return libraryStore.getWanko(id);
  }

  async function markRegistrationRequested(id, requestId) {
    const record = await getWanko(id);
    if (!record) throw new Error("Wanko not found");
    if (record.registrationRequestId && record.registrationRequestId !== requestId) {
      throw new Error("Wanko registration request already exists");
    }
    return putWanko({ ...record, registrationRequestId: requestId, updatedAt: new Date().toISOString() });
  }

  async function setMeta(key, value) {
    await libraryStore.setMeta(key, value);
  }

  async function getMeta(key) {
    return libraryStore.getMeta(key);
  }

  async function setActiveWanko(id, options = {}) { return libraryStore.setActiveWanko(id, options); }

  async function getActiveWanko() {
    return libraryStore.getActiveWanko();
  }

  async function archiveWanko(id) {
    const archived = await libraryStore.archiveWanko(id);
    await syncNow().catch(() => {});
    return archived;
  }

  async function getLatestWanko() {
    const list = await listWankos();
    return list[0] || null;
  }

  function blobUrl(record) {
    return record?.blob ? URL.createObjectURL(record.blob) : null;
  }

  async function pushPending() {
    if (!window.WankoCloud?.configured()) return { synced: 0, failed: 0 };
    const session = await WankoCloud.getSession();
    if (!session) return { synced: 0, failed: 0 };

    const pending = (await listWankos()).filter(x => x.syncStatus !== "synced");
    let synced = 0, failed = 0;
    for (const record of pending) {
      try {
        const path = await WankoCloud.pushWanko(record);
        record.syncStatus = "synced";
        record.cloudPath = path;
        await putWanko(record, false);
        synced++;
      } catch (error) {
        failed++;
        console.warn("Wanko cloud push failed", record.id, error);
      }
    }
    return { synced, failed };
  }

  async function pullRemote() {
    if (!window.WankoCloud?.configured()) return { pulled: 0 };
    const session = await WankoCloud.getSession();
    if (!session) return { pulled: 0 };

    const rows = await WankoCloud.listRemoteWankos();
    let pulled = 0;
    for (const row of rows) {
      const local = await getWanko(row.id);
      const remoteTime = Date.parse(row.updated_at || row.created_at || 0);
      const localTime = Date.parse(local?.updatedAt || 0);
      if (local?.syncStatus === "pending" && localTime >= remoteTime) continue;
      if (local && localTime >= remoteTime && local.blob) continue;

      try {
        const blob = await WankoCloud.downloadImage(row.image_path);
        await putWanko({
          id: row.id,
          name: row.name,
          creator: row.creator || "paint",
          createdAt: row.created_at,
          updatedAt: row.updated_at || row.created_at,
          blob,
          stats: row.stats || { cost: 180, hp: 140, damage: 30, speed: 46, range: 44, cooldown: 0.72 },
          archived: Boolean(row.archived),
          syncStatus: "synced",
          cloudPath: row.image_path
        }, false);
        pulled++;
      } catch (error) {
        console.warn("Wanko cloud pull failed", row.id, error);
      }
    }

    try {
      const profile = await WankoCloud.getProfile();
      if (profile?.active_wanko_id && await getWanko(profile.active_wanko_id)) {
        await setActiveWanko(profile.active_wanko_id, { cloud: false });
      }
    } catch (error) {
      console.warn("Wanko profile pull failed", error);
    }

    if (pulled) window.dispatchEvent(new CustomEvent("wanko-library-changed"));
    return { pulled };
  }

  async function syncNow() {
    const local = await listWankos();
    if (!window.WankoCloud?.configured()) {
      return { configured: false, authenticated: false, synced: 0, pulled: 0, pending: local.filter(x => x.syncStatus !== "synced").length };
    }
    const session = await WankoCloud.getSession().catch(() => null);
    if (!session) {
      return { configured: true, authenticated: false, synced: 0, pulled: 0, pending: local.filter(x => x.syncStatus !== "synced").length };
    }

    const pushed = await pushPending();
    const pulled = await pullRemote();
    const after = await listWankos();
    return {
      configured: true,
      authenticated: true,
      synced: pushed.synced,
      failed: pushed.failed,
      pulled: pulled.pulled,
      pending: after.filter(x => x.syncStatus !== "synced").length
    };
  }

  async function syncState() {
    const list = await listWankos();
    const configured = Boolean(window.WankoCloud?.configured());
    const session = configured ? await WankoCloud.getSession().catch(() => null) : null;
    const pending = list.filter(x => x.syncStatus !== "synced").length;
    return {
      configured,
      authenticated: Boolean(session),
      total: list.length,
      pending,
      synced: list.length - pending,
      user: session?.user || null
    };
  }

  window.WankoLibrary = {
    registerWanko,
    listWankos,
    getWanko,
    markRegistrationRequested,
    getMeta,
    setMeta,
    setActiveWanko,
    archiveWanko,
    getActiveWanko,
    getLatestWanko,
    blobUrl,
    syncNow,
    syncState,
    cloudReady: () => Boolean(window.WankoCloud?.configured())
  };
})();
