((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root) return;
  const exported = { createProgressStore: api.createProgressStore, createProfileStore: api.createProfileStore, mergeStates: api.mergeStates, normalizeState: api.normalizeState, walletFromState: api.walletFromState, starsFromState: api.starsFromState };
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
    clearedStageIds: [],
    selectedWanko: null,
    ownedWankoIds: [],
    wankoDuplicateDraws: {},
    economy: {
      pointEarned: {},
      pointSpent: {},
      ticketEarned: {},
      ticketSpent: {}
    }
  });

  function normalizeCounterMap(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const result = {};
    for (const [key, value] of Object.entries(source)) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) continue;
      const number = Math.floor(Number(value));
      if (Number.isFinite(number) && number > 0) result[key] = number;
    }
    return result;
  }

  function mergeCounterMaps(left, right) {
    const a = normalizeCounterMap(left);
    const b = normalizeCounterMap(right);
    const merged = { ...a };
    for (const [key, value] of Object.entries(b)) merged[key] = Math.max(merged[key] || 0, value);
    return merged;
  }

  function sumCounterMap(map) {
    return Object.values(normalizeCounterMap(map)).reduce((sum, value) => sum + value, 0);
  }

  function normalizeWankoCounterMap(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const result = {};
    for (const [wankoId, counters] of Object.entries(source)) {
      const id = typeof wankoId === 'string' ? wankoId.trim().slice(0, 120) : '';
      if (!id || !/^[A-Za-z0-9:_-]{1,120}$/.test(id)) continue;
      const normalized = normalizeCounterMap(counters);
      if (Object.keys(normalized).length) result[id] = normalized;
    }
    return result;
  }

  function mergeWankoCounterMaps(left, right) {
    const a = normalizeWankoCounterMap(left);
    const b = normalizeWankoCounterMap(right);
    const result = { ...a };
    for (const [wankoId, counters] of Object.entries(b)) {
      result[wankoId] = mergeCounterMaps(result[wankoId], counters);
    }
    return result;
  }

  function starsFromState(state, wankoId) {
    const id = typeof wankoId === 'string' ? wankoId.trim() : '';
    if (!id || !Array.isArray(state?.ownedWankoIds) || !state.ownedWankoIds.includes(id)) return 0;
    return 1 + sumCounterMap(state?.wankoDuplicateDraws?.[id]);
  }

  function walletFromState(state) {
    const economy = state?.economy || {};
    return {
      points: Math.max(0, sumCounterMap(economy.pointEarned) - sumCounterMap(economy.pointSpent)),
      tickets: Math.max(0, sumCounterMap(economy.ticketEarned) - sumCounterMap(economy.ticketSpent))
    };
  }

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
    const rawWanko = value.selectedWanko;
    const selectedWanko = rawWanko
      && (rawWanko.source === 'official' || rawWanko.source === 'custom')
      && typeof rawWanko.id === 'string'
      && rawWanko.id.trim()
      ? { source: rawWanko.source, id: rawWanko.id.trim().slice(0, 120) }
      : null;
    const ownedWankoIds = [...new Set(
      (Array.isArray(value.ownedWankoIds) ? value.ownedWankoIds : [])
        .filter(id => typeof id === 'string' && id.trim())
        .map(id => id.trim().slice(0, 120))
    )].sort();
    const duplicateSource = normalizeWankoCounterMap(value.wankoDuplicateDraws);
    const wankoDuplicateDraws = {};
    for (const id of ownedWankoIds) {
      if (duplicateSource[id]) wankoDuplicateDraws[id] = duplicateSource[id];
    }
    const economySource = value.economy && typeof value.economy === 'object' && !Array.isArray(value.economy)
      ? value.economy
      : {};
    const economy = {
      pointEarned: normalizeCounterMap(economySource.pointEarned),
      pointSpent: normalizeCounterMap(economySource.pointSpent),
      ticketEarned: normalizeCounterMap(economySource.ticketEarned),
      ticketSpent: normalizeCounterMap(economySource.ticketSpent)
    };
    return { selectedStageId, discoveredElementIds, discoveredCharacterIds, clearedStageIds, selectedWanko, ownedWankoIds, wankoDuplicateDraws, economy };
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
      clearedStageIds: [...a.clearedStageIds, ...b.clearedStageIds],
      selectedWanko: a.selectedWanko || b.selectedWanko,
      ownedWankoIds: [...a.ownedWankoIds, ...b.ownedWankoIds],
      wankoDuplicateDraws: mergeWankoCounterMaps(a.wankoDuplicateDraws, b.wankoDuplicateDraws),
      economy: {
        pointEarned: mergeCounterMaps(a.economy.pointEarned, b.economy.pointEarned),
        pointSpent: mergeCounterMaps(a.economy.pointSpent, b.economy.pointSpent),
        ticketEarned: mergeCounterMaps(a.economy.ticketEarned, b.economy.ticketEarned),
        ticketSpent: mergeCounterMaps(a.economy.ticketSpent, b.economy.ticketSpent)
      }
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

    async function setSelectedWanko(selection) {
      return writeState(current => ({
        ...current,
        selectedWanko: selection
          && (selection.source === 'official' || selection.source === 'custom')
          && typeof selection.id === 'string'
          ? { source: selection.source, id: selection.id }
          : null
      }));
    }

    async function ownWanko(wankoId) {
      const id = typeof wankoId === 'string' ? wankoId.trim().slice(0, 120) : '';
      if (!id) throw new TypeError('wankoId is required');
      return writeState(current => current.ownedWankoIds.includes(id)
        ? current
        : { ...current, ownedWankoIds: [...current.ownedWankoIds, id] });
    }

    async function isWankoOwned(wankoId) {
      const id = typeof wankoId === 'string' ? wankoId.trim() : '';
      if (!id) return false;
      return (await readState()).ownedWankoIds.includes(id);
    }

    async function recordDuplicateWankoDraw(wankoId, deviceId, refundPoints = 10) {
      const id = typeof wankoId === 'string' ? wankoId.trim().slice(0, 120) : '';
      const device = safeDeviceId(deviceId);
      const refund = Math.max(0, Math.floor(Number(refundPoints) || 0));
      if (!id) throw new TypeError('wankoId is required');
      return writeState(current => {
        if (!current.ownedWankoIds.includes(id)) throw new Error('Wanko is not owned');
        const counters = current.wankoDuplicateDraws[id] || {};
        return {
          ...current,
          wankoDuplicateDraws: {
            ...current.wankoDuplicateDraws,
            [id]: { ...counters, [device]: (counters[device] || 0) + 1 }
          },
          economy: refund > 0 ? {
            ...current.economy,
            pointEarned: {
              ...current.economy.pointEarned,
              [device]: (current.economy.pointEarned[device] || 0) + refund
            }
          } : current.economy
        };
      });
    }

    async function getWankoStars(wankoId) {
      return starsFromState(await readState(), wankoId);
    }

    function safeDeviceId(deviceId) {
      const id = typeof deviceId === 'string' ? deviceId.trim() : '';
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new TypeError('deviceId is invalid');
      return id;
    }

    async function awardPoints(amount, deviceId) {
      const points = Math.floor(Number(amount));
      const device = safeDeviceId(deviceId);
      if (!Number.isFinite(points) || points <= 0) throw new TypeError('amount must be positive');
      return writeState(current => {
        const currentCount = current.economy.pointEarned[device] || 0;
        return {
          ...current,
          economy: {
            ...current.economy,
            pointEarned: { ...current.economy.pointEarned, [device]: currentCount + points }
          }
        };
      });
    }

    async function exchangePointsForTicket(cost, deviceId) {
      const points = Math.floor(Number(cost));
      const device = safeDeviceId(deviceId);
      if (!Number.isFinite(points) || points <= 0) throw new TypeError('cost must be positive');
      return writeState(current => {
        if (walletFromState(current).points < points) throw new Error('Not enough points');
        return {
          ...current,
          economy: {
            ...current.economy,
            pointSpent: {
              ...current.economy.pointSpent,
              [device]: (current.economy.pointSpent[device] || 0) + points
            },
            ticketEarned: {
              ...current.economy.ticketEarned,
              [device]: (current.economy.ticketEarned[device] || 0) + 1
            }
          }
        };
      });
    }

    async function spendGachaTicket(deviceId) {
      const device = safeDeviceId(deviceId);
      return writeState(current => {
        if (walletFromState(current).tickets < 1) throw new Error('No gacha ticket');
        return {
          ...current,
          economy: {
            ...current.economy,
            ticketSpent: {
              ...current.economy.ticketSpent,
              [device]: (current.economy.ticketSpent[device] || 0) + 1
            }
          }
        };
      });
    }

    async function getWallet() {
      return walletFromState(await readState());
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
      setSelectedWanko,
      ownWanko,
      isWankoOwned,
      recordDuplicateWankoDraw,
      getWankoStars,
      awardPoints,
      exchangePointsForTicket,
      spendGachaTicket,
      getWallet,
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

  return { createProgressStore, createProfileStore, mergeStates, normalizeState, walletFromState, starsFromState, initialState: () => JSON.parse(JSON.stringify(INITIAL_STATE)) };
});
