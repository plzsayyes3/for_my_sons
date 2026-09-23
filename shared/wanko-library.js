(() => {
  const DB_NAME = "for-my-sons-wanko-library";
  const DB_VERSION = 1;
  const WANKO_STORE = "wankos";
  const META_STORE = "meta";
  const ACTIVE_KEY = "activeWankoId";

  function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return "wanko-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
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

  async function withStore(storeName, mode, handler) {
    const db = await openDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;
        try { result = handler(store, tx); } catch (error) { reject(error); return; }
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
      });
    } finally {
      db.close();
    }
  }

  function requestResult(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function putWanko(record) {
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
    window.dispatchEvent(new CustomEvent("wanko-library-changed", { detail: { id: record.id } }));
    return record;
  }

  async function registerWanko({ name, blob, creator = "family", stats = null }) {
    const now = new Date().toISOString();
    const record = {
      id: uuid(),
      name: (name || "なまえのないわんこ").trim().slice(0, 24),
      creator,
      createdAt: now,
      updatedAt: now,
      blob,
      stats: stats || { cost: 180, hp: 140, damage: 30, speed: 46, range: 44, cooldown: 0.72 },
      archived: false,
      syncStatus: "pending",
      cloudPath: null
    };
    await putWanko(record);
    await setActiveWanko(record.id);
    syncNow().catch(() => {});
    return record;
  }

  async function listWankos() {
    const db = await openDB();
    try {
      const records = await requestResult(db.transaction(WANKO_STORE, "readonly").objectStore(WANKO_STORE).getAll());
      return records.filter(x => !x.archived).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } finally { db.close(); }
  }

  async function getWanko(id) {
    if (!id) return null;
    const db = await openDB();
    try {
      return await requestResult(db.transaction(WANKO_STORE, "readonly").objectStore(WANKO_STORE).get(id));
    } finally { db.close(); }
  }

  async function setMeta(key, value) {
    const db = await openDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(META_STORE, "readwrite");
        tx.objectStore(META_STORE).put({ key, value });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }

  async function getMeta(key) {
    const db = await openDB();
    try {
      const row = await requestResult(db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(key));
      return row?.value ?? null;
    } finally { db.close(); }
  }

  async function setActiveWanko(id) {
    await setMeta(ACTIVE_KEY, id);
    window.dispatchEvent(new CustomEvent("wanko-active-changed", { detail: { id } }));
  }

  async function getActiveWanko() {
    const id = await getMeta(ACTIVE_KEY);
    if (id) {
      const found = await getWanko(id);
      if (found && !found.archived) return found;
    }
    const list = await listWankos();
    return list[0] || null;
  }

  async function getLatestWanko() {
    const list = await listWankos();
    return list[0] || null;
  }

  function blobUrl(record) {
    return record?.blob ? URL.createObjectURL(record.blob) : null;
  }

  function cloudConfig() {
    const c = window.WANKO_CLOUD_CONFIG || {};
    return {
      url: String(c.url || "").replace(/\/$/, ""),
      anonKey: c.anonKey || "",
      accessToken: c.accessToken || "",
      familyId: c.familyId || "",
      bucket: c.bucket || "wanko-images",
      table: c.table || "wankos"
    };
  }

  function cloudReady() {
    const c = cloudConfig();
    return Boolean(c.url && c.anonKey && c.accessToken && c.familyId);
  }

  function cloudHeaders(contentType) {
    const c = cloudConfig();
    return {
      apikey: c.anonKey,
      Authorization: "Bearer " + c.accessToken,
      ...(contentType ? { "Content-Type": contentType } : {})
    };
  }

  async function pushRecord(record) {
    const c = cloudConfig();
    const path = c.familyId + "/" + record.id + ".png";
    const upload = await fetch(
      c.url + "/storage/v1/object/" + encodeURIComponent(c.bucket) + "/" + path.split("/").map(encodeURIComponent).join("/"),
      {
        method: "POST",
        headers: { ...cloudHeaders(record.blob?.type || "image/png"), "x-upsert": "true" },
        body: record.blob
      }
    );
    if (!upload.ok) throw new Error("image upload failed: " + upload.status);

    const metadata = {
      id: record.id,
      family_id: c.familyId,
      name: record.name,
      creator: record.creator,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
      image_path: path,
      stats: record.stats,
      archived: Boolean(record.archived)
    };
    const meta = await fetch(c.url + "/rest/v1/" + encodeURIComponent(c.table) + "?on_conflict=id", {
      method: "POST",
      headers: {
        ...cloudHeaders("application/json"),
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(metadata)
    });
    if (!meta.ok) throw new Error("metadata sync failed: " + meta.status);

    record.syncStatus = "synced";
    record.cloudPath = path;
    record.updatedAt = new Date().toISOString();
    await putWanko(record);
  }

  async function syncNow() {
    if (!cloudReady()) {
      return { configured: false, synced: 0, pending: (await listWankos()).filter(x => x.syncStatus !== "synced").length };
    }
    const pending = (await listWankos()).filter(x => x.syncStatus !== "synced");
    let synced = 0;
    for (const record of pending) {
      try {
        await pushRecord(record);
        synced++;
      } catch (error) {
        console.warn("Wanko cloud sync failed", record.id, error);
      }
    }
    return { configured: true, synced, pending: pending.length - synced };
  }

  async function syncState() {
    const list = await listWankos();
    const pending = list.filter(x => x.syncStatus !== "synced").length;
    return {
      configured: cloudReady(),
      total: list.length,
      pending,
      synced: list.length - pending
    };
  }

  window.WankoLibrary = {
    registerWanko,
    listWankos,
    getWanko,
    setActiveWanko,
    getActiveWanko,
    getLatestWanko,
    blobUrl,
    syncNow,
    syncState,
    cloudReady
  };
})();