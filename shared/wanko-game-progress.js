((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root) return;
  const exported = { createProgressStore: api.createProgressStore, createProfileStore: api.createProfileStore, mergeStates: api.mergeStates, normalizeState: api.normalizeState };
  if (root.WankoLibrary && root.WankoGameData) {
    const store = api.createProgressStore({
      getMeta: () => root.WankoLibrary.getMeta('wankoGameProgressV1'),
      setMeta: (_key, value) => root.WankoLibrary.setMeta('wankoGameProgressV1', value)
    }, root.WankoGameData);
    Object.assign(exported, store);
  }
  root.WankoGameProgress = exported;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const META_KEY = 'wankoGameProgressV1';
  const INITIAL_STATE = Object.freeze({
    selectedStageId: 'S001',
    discoveredElementIds: [],
    discoveredCharacterIds: [],
    clearedStageIds: []
  });

  function normalizeState(raw, definitions) {
    if (!definitions?.stages || !definitions?.elements || !definitions?.characters) throw new TypeError('game definitions are required');
    const stageById = new Map(definitions.stages.map(stage => [stage.id, stage]));
    const elementIds = new Set(definitions.elements.map(element => Number(element.id)));
    const characterById = definitions.characters;
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const clearedStageIds = [...new Set(
      (Array.isArray(value.clearedStageIds) ? value.clearedStageIds : [])
        .filter(id => stageById.has(id))
    )].sort((a, b) => stageById.get(a).sequence - stageById.get(b).sequence);
    const discoveredElementIds = [...new Set(
      (Array.isArray(value.discoveredElementIds) ? value.discoveredElementIds : [])
        .map(Number)
        .filter(id => Number.isInteger(id) && elementIds.has(id))
    )].sort((a, b) => a - b);
    const discoveredCharacterIds = [...new Set(
      (Array.isArray(value.discoveredCharacterIds) ? value.discoveredCharacterIds : [])
        .filter(id => characterById[id]?.faction === 'enemy')
    )].sort();
    const selectedStageId = stageById.has(value.selectedStageId) ? value.selectedStageId : INITIAL_STATE.selectedStageId;
    return { selectedStageId, discoveredElementIds, discoveredCharacterIds, clearedStageIds };
  }

  function mergeStates(left, right, definitions) {
    const a = normalizeState(left, definitions);
    const b = normalizeState(right, definitions);
    const stageById = new Map(definitions.stages.map(stage => [stage.id, stage]));
    const selectedStageId = [a.selectedStageId, b.selectedStageId]
      .sort((x, y) => (stageById.get(y)?.sequence || 0) - (stageById.get(x)?.sequence || 0))[0] || INITIAL_STATE.selectedStageId;
    return normalizeState({
      selectedStageId,
      discoveredElementIds: [...a.discoveredElementIds, ...b.discoveredElementIds],
      discoveredCharacterIds: [...a.discoveredCharacterIds, ...b.discoveredCharacterIds],
      clearedStageIds: [...a.clearedStageIds, ...b.clearedStageIds]
    }, definitions);
  }

  function createProgressStore(storage, definitions) {
    if (!storage?.getMeta || !storage?.setMeta) throw new TypeError('storage must provide getMeta and setMeta');
    if (!definitions?.stages || !definitions?.elements || !definitions?.characters) throw new TypeError('game definitions are required');

    const stageById = new Map(definitions.stages.map(stage => [stage.id, stage]));
    const elementIds = new Set(definitions.elements.map(element => Number(element.id)));
    const characterById = definitions.characters;
    let writeQueue = Promise.resolve();

    function normalize(raw) {
      return normalizeState(raw, definitions);
    }

    async function readState() {
      const saved = await storage.getMeta(META_KEY);
      const normalized = normalize(saved);
      if (JSON.stringify(saved) !== JSON.stringify(normalized)) await storage.setMeta(META_KEY, normalized);
      return normalized;
    }

    function writeState(mutator) {
      const operation = writeQueue.then(async () => {
        const state = await readState();
        const next = normalize(await mutator(state) || state);
        if (JSON.stringify(state) !== JSON.stringify(next)) await storage.setMeta(META_KEY, next);
        return next;
      });
      writeQueue = operation.catch(() => {});
      return operation;
    }

    async function isStageUnlocked(stageId, state = null) {
      const stage = stageById.get(stageId);
      if (!stage) return false;
      if (stage.sequence === 1) return true;
      const progress = state || await readState();
      const previous = definitions.stages.find(candidate => candidate.sequence === stage.sequence - 1);
      return Boolean(previous && progress.clearedStageIds.includes(previous.id));
    }

    async function selectStage(stageId) {
      const stage = stageById.get(stageId);
      if (!stage) throw new Error(`Unknown stage: ${stageId}`);
      return writeState(async current => {
        if (!await isStageUnlocked(stageId, current)) throw new Error(`Stage is locked: ${stageId}`);
        return { ...current, selectedStageId: stageId };
      });
    }

    async function discoverStage(stageId) {
      const stage = stageById.get(stageId);
      if (!stage) throw new Error(`Unknown stage: ${stageId}`);
      return writeState(async current => {
        if (!await isStageUnlocked(stageId, current)) throw new Error(`Stage is locked: ${stageId}`);
        return { ...current, discoveredElementIds: [...current.discoveredElementIds, stage.elementId] };
      });
    }

    async function startStage(stageId) {
      const stage = stageById.get(stageId);
      if (!stage) throw new Error(`Unknown stage: ${stageId}`);
      return writeState(async current => {
        if (!await isStageUnlocked(stageId, current)) throw new Error(`Stage is locked: ${stageId}`);
        return {
          ...current,
          selectedStageId: stageId,
          discoveredElementIds: [...current.discoveredElementIds, stage.elementId]
        };
      });
    }

    async function discoverCharacter(characterId) {
      const character = characterById[characterId];
      if (!character) throw new Error(`Unknown character: ${characterId}`);
      if (character.faction !== 'enemy') throw new Error(`Character is not an enemy: ${characterId}`);
      return writeState(current => current.discoveredCharacterIds.includes(characterId)
        ? current
        : { ...current, discoveredCharacterIds: [...current.discoveredCharacterIds, characterId] });
    }

    async function completeStage(stageId) {
      if (!stageById.has(stageId)) throw new Error(`Unknown stage: ${stageId}`);
      return writeState(async current => {
        if (!await isStageUnlocked(stageId, current)) throw new Error(`Stage is locked: ${stageId}`);
        return { ...current, clearedStageIds: [...current.clearedStageIds, stageId] };
      });
    }

    async function importState(raw) {
      const next = normalize(raw);
      await storage.setMeta(META_KEY, next);
      return next;
    }

    async function isCharacterUnlocked(characterId) {
      const character = characterById[characterId];
      if (!character) return false;
      if (!character.unlockAfterStage) return true;
      return (await readState()).clearedStageIds.includes(character.unlockAfterStage);
    }

    return {
      metaKey: META_KEY,
      getState: readState,
      selectStage,
      discoverStage,
      discoverCharacter,
      startStage,
      completeStage,
      importState,
      isStageUnlocked,
      isCharacterUnlocked
    };
  }

  function createProfileStore(profileId, saveStore, definitions) {
    if (typeof profileId !== 'string' || !saveStore?.get || !saveStore?.put) throw new TypeError('A profile and save store are required');
    return createProgressStore({
      getMeta: async () => (await saveStore.get(profileId, 'wanko-war', 'progress'))?.value ?? null,
      setMeta: async (_key, value) => saveStore.put(profileId, 'wanko-war', 'progress', value)
    }, definitions);
  }

  return { createProgressStore, createProfileStore, mergeStates, normalizeState, initialState: () => ({ ...INITIAL_STATE }) };
});
