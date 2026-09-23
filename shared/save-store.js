((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsSaveStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const PROFILE_ID_PATTERN = /^profile-[a-z0-9-]+$/;

  function assertSegment(value, name) {
    if (typeof value !== 'string' || !value || value === '.' || value === '..' || /[\\/\u0000]/.test(value)) {
      throw new TypeError(`${name} contains an unsafe path segment`);
    }
  }

  function assertIdentity(identity) {
    if (!PROFILE_ID_PATTERN.test(identity?.profileId)) throw new TypeError('Invalid profile ID');
    assertSegment(identity.appId, 'appId');
    assertSegment(identity.saveKey, 'saveKey');
  }

  function keyOf(identity) {
    assertIdentity(identity);
    return [identity.profileId, identity.appId, identity.saveKey];
  }

  function cloneJson(value) {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new TypeError('Value must be JSON-serializable');
    return JSON.parse(encoded);
  }

  function bytesOf(value) {
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    throw new TypeError('Binary value must be an ArrayBuffer or typed array');
  }

  function createSaveStore(db, profileManager, clock = Date) {
    if (!db?.get || !db?.put || !db?.list) throw new TypeError('database adapter is required');
    if (!profileManager?.current) throw new TypeError('profile manager is required');

    function now() {
      return new Date(typeof clock === 'function' ? clock() : clock.now()).toISOString();
    }

    async function currentIdentity(appId, saveKey) {
      const profile = await profileManager.current();
      const identity = { profileId: profile.id, appId, saveKey };
      assertIdentity(identity);
      return identity;
    }

    async function readRecord(identity) {
      assertIdentity(identity);
      return db.get('saves', keyOf(identity));
    }

    async function writeRecord(identity, value, kind, contentType, extension) {
      const existing = await readRecord(identity);
      const record = {
        ...(existing || {}),
        ...identity,
        value,
        kind,
        contentType: contentType || null,
        extension: extension || (kind === 'json' ? 'json' : 'bin'),
        localRevision: (existing?.localRevision || 0) + 1,
        dirty: true,
        syncState: 'pending',
        updatedAt: now()
      };
      await db.put('saves', record, keyOf(identity));
      return { ...record };
    }

    async function writeJson(appId, saveKey, value) {
      const identity = await currentIdentity(appId, saveKey);
      return writeRecord(identity, cloneJson(value), 'json', 'application/json', 'json');
    }

    async function readJson(appId, saveKey) {
      const identity = await currentIdentity(appId, saveKey);
      const record = await readRecord(identity);
      return record?.kind === 'json' ? cloneJson(record.value) : null;
    }

    async function writeBinary(appId, saveKey, bytes, contentType, extension = 'bin') {
      const identity = await currentIdentity(appId, saveKey);
      assertSegment(extension, 'extension');
      return writeRecord(identity, bytesOf(bytes), 'binary', contentType, extension);
    }

    async function readBinary(appId, saveKey) {
      const identity = await currentIdentity(appId, saveKey);
      const record = await readRecord(identity);
      if (!record || record.kind !== 'binary') return null;
      return { bytes: bytesOf(record.value), contentType: record.contentType, extension: record.extension };
    }

    async function markSynced(identity, remoteSha) {
      const record = await readRecord(identity);
      if (!record) throw new Error('Save record not found');
      const next = { ...record, remoteSha: String(remoteSha), dirty: false, syncState: 'synced', updatedAt: now() };
      await db.put('saves', next, keyOf(identity));
      return { ...next };
    }

    async function markConflict(identity, remoteSha) {
      const record = await readRecord(identity);
      if (!record) throw new Error('Save record not found');
      const next = { ...record, remoteSha: String(remoteSha), dirty: true, syncState: 'conflict', updatedAt: now() };
      await db.put('saves', next, keyOf(identity));
      return { ...next };
    }

    async function listPending(profileId) {
      const selectedProfileId = profileId || (await profileManager.current()).id;
      if (!PROFILE_ID_PATTERN.test(selectedProfileId)) throw new TypeError('Invalid profile ID');
      return (await db.list('saves'))
        .filter(record => record.profileId === selectedProfileId && (record.dirty || record.syncState === 'pending'))
        .map(({ value, ...record }) => record);
    }

    async function createSnapshot(identity) {
      const record = await readRecord(identity);
      if (!record) throw new Error('Save record not found');
      const snapshotId = `snapshot-${Date.now()}-${record.localRevision}`;
      const snapshot = { snapshotId, ...identity, value: record.value, kind: record.kind, contentType: record.contentType, extension: record.extension };
      await db.put('snapshots', snapshot, [...keyOf(identity), snapshotId]);
      return { ...snapshot };
    }

    async function restoreSnapshot(identity, snapshotId) {
      assertIdentity(identity);
      assertSegment(snapshotId, 'snapshotId');
      const snapshot = await db.get('snapshots', [...keyOf(identity), snapshotId]);
      if (!snapshot) throw new Error('Snapshot not found');
      if (snapshot.kind === 'json') cloneJson(snapshot.value);
      const current = await readRecord(identity);
      const next = {
        ...(current || {}),
        ...identity,
        value: snapshot.kind === 'json' ? cloneJson(snapshot.value) : bytesOf(snapshot.value),
        kind: snapshot.kind,
        contentType: snapshot.contentType,
        extension: snapshot.extension,
        localRevision: (current?.localRevision || 0) + 1,
        dirty: true,
        syncState: 'pending',
        updatedAt: now()
      };
      await db.put('saves', next, keyOf(identity));
      return { ...next };
    }

    function pathFor(record) {
      assertIdentity(record);
      const base = `profiles/${record.profileId}`;
      if (record.kind === 'json') return `${base}/apps/${record.appId}/${record.saveKey}.json`;
      assertSegment(record.extension || 'bin', 'extension');
      return `${base}/files/${record.appId}/${record.saveKey}.${record.extension || 'bin'}`;
    }

    return {
      writeJson,
      readJson,
      writeBinary,
      readBinary,
      readRecord,
      markSynced,
      markConflict,
      listPending,
      createSnapshot,
      restoreSnapshot,
      pathFor
    };
  }

  return { createSaveStore };
});
