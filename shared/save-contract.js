(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsSaveContract = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

  function validateProfileId(value) {
    if (typeof value !== 'string' || !PROFILE_ID.test(value)) throw new TypeError('Invalid profile identifier');
    return value;
  }

  function normalizeSaveRecord(record, profileId) {
    validateProfileId(profileId);
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('Invalid save record');
    if (record.profileId !== profileId) throw new TypeError('Save profile does not match requested profile');
    return { ...record };
  }

  function parseProfileIndex(schema, saveFiles) {
    if (!schema || !Array.isArray(schema.profileOrder) || !Array.isArray(saveFiles)) {
      throw new TypeError('Invalid profile index');
    }
    const filesById = new Map();
    const errors = [];
    for (const file of saveFiles) {
      try {
        const pathId = validateProfileId(file?.path?.match(/^saves\/([^/]+)\.json$/)?.[1]);
        if (filesById.has(pathId)) throw new TypeError('Duplicate save file');
        filesById.set(pathId, file.content);
      } catch {
        errors.push({ type: 'invalid-save-path' });
      }
    }
    const profiles = [];
    const seen = new Set();
    for (const rawId of schema.profileOrder) {
      let profileId;
      try { profileId = validateProfileId(rawId); }
      catch { errors.push({ type: 'invalid-profile-id' }); continue; }
      if (seen.has(profileId)) { errors.push({ type: 'duplicate-profile-id' }); continue; }
      seen.add(profileId);
      const record = filesById.get(profileId);
      if (!record) continue;
      try {
        const save = normalizeSaveRecord(record, profileId);
        if (typeof save.displayName !== 'string' || !save.displayName.trim()) throw new TypeError('Missing display name');
        profiles.push({ profileId, label: save.displayName, revision: save.revision });
      } catch {
        errors.push({ type: 'invalid-profile-save' });
      }
    }
    return { profiles, errors };
  }

  return { validateProfileId, parseProfileIndex, normalizeSaveRecord };
});
