((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root) return;
  const exported = { createProgressStore: api.createProgressStore };
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
    clearedStageIds: []
  });

  function createProgressStore(storage, definitions) {
    if (!storage?.getMeta || !storage?.setMeta) throw new TypeError('storage must provide getMeta and setMeta');
    if (!definitions?.stages || !definitions?.elements || !definitions?.characters) throw new TypeError('game definitions are required');

    const stageById = new Map(definitions.stages.map(stage => [stage.id, stage]));
    const elementIds = new Set(definitions.elements.map(element => Number(element.id)));
    const characterById = definitions.characters;

    function normalize(raw) {
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
      const selectedStageId = stageById.has(value.selectedStageId) ? value.selectedStageId : INITIAL_STATE.selectedStageId;
      return { selectedStageId, discoveredElementIds, clearedStageIds };
    }

    async function readState() {
      const saved = await storage.getMeta(META_KEY);
      const normalized = normalize(saved);
      if (JSON.stringify(saved) !== JSON.stringify(normalized)) await storage.setMeta(META_KEY, normalized);
      return normalized;
    }

    async function writeState(mutator) {
      const state = await readState();
      const next = normalize(mutator(state) || state);
      await storage.setMeta(META_KEY, next);
      return next;
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
      const state = await readState();
      if (!await isStageUnlocked(stageId, state)) throw new Error(`Stage is locked: ${stageId}`);
      return writeState(current => ({ ...current, selectedStageId: stageId }));
    }

    async function discoverStage(stageId) {
      const stage = stageById.get(stageId);
      if (!stage) throw new Error(`Unknown stage: ${stageId}`);
      const state = await readState();
      if (!await isStageUnlocked(stageId, state)) throw new Error(`Stage is locked: ${stageId}`);
      return writeState(current => ({
        ...current,
        discoveredElementIds: [...current.discoveredElementIds, stage.elementId]
      }));
    }

    async function startStage(stageId) {
      const stage = stageById.get(stageId);
      if (!stage) throw new Error(`Unknown stage: ${stageId}`);
      const state = await readState();
      if (!await isStageUnlocked(stageId, state)) throw new Error(`Stage is locked: ${stageId}`);
      return writeState(current => ({
        ...current,
        selectedStageId: stageId,
        discoveredElementIds: [...current.discoveredElementIds, stage.elementId]
      }));
    }

    async function completeStage(stageId) {
      if (!stageById.has(stageId)) throw new Error(`Unknown stage: ${stageId}`);
      const state = await readState();
      if (!await isStageUnlocked(stageId, state)) throw new Error(`Stage is locked: ${stageId}`);
      return writeState(current => ({
        ...current,
        clearedStageIds: [...current.clearedStageIds, stageId]
      }));
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
      startStage,
      completeStage,
      isStageUnlocked,
      isCharacterUnlocked
    };
  }

  return { createProgressStore, initialState: () => ({ ...INITIAL_STATE }) };
});
