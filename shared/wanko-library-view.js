((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WankoLibraryView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function buildCustomCards(wankos, { activeId = null, requestIds = new Set() } = {}) {
    const submitted = requestIds instanceof Set ? requestIds : new Set(requestIds || []);
    return (Array.isArray(wankos) ? wankos : []).map(wanko => ({
      id: wanko.id,
      source: 'custom',
      name: wanko.name,
      blob: wanko.blob,
      createdAt: wanko.createdAt,
      active: wanko.id === activeId,
      deletable: true,
      characterRequestId: wanko.characterRequestId || null,
      requestSubmitted: Boolean(wanko.characterRequestId && submitted.has(wanko.characterRequestId))
    }));
  }

  function buildOwnedCards({ officials = [], gameCards = [] } = {}) {
    const officialCards = officials.map(official => ({
      ...official,
      source: 'official',
      deletable: false,
      unlocked: true
    }));
    const ownedGameCards = gameCards.filter(card => card.unlocked).map(card => ({
      ...card,
      source: 'game',
      deletable: false
    }));
    return [...officialCards, ...ownedGameCards];
  }

  function buildAllyCards(characters, progress) {
    const cleared = new Set(progress?.clearedStageIds || []);
    return Object.values(characters)
      .filter(character => character.faction === 'ally')
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(character => ({
        id: character.id,
        name: character.name,
        faction: character.faction,
        role: character.role,
        placeholder: character.artwork ? null : character.placeholder,
        artwork: character.artwork,
        characterStatus: character.artwork ? 'official' : 'placeholder',
        unlocked: !character.unlockAfterStage || cleared.has(character.unlockAfterStage),
        unlockAfterStage: character.unlockAfterStage,
        stats: { ...character.stats },
        legacyWankoId: character.legacyWankoId
      }));
  }

  function buildEnemyCards(characters, progress) {
    const discovered = new Set(progress?.discoveredCharacterIds || []);
    return Object.values(characters)
      .filter(character => character.faction === 'enemy')
      .sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : (a.kind === 'boss' ? 1 : -1)))
      .map(character => {
        const found = discovered.has(character.id);
        return {
          id: character.id,
          kind: character.kind,
          discovered: found,
          name: found ? character.name : 'まだひみつ',
          placeholder: found ? (character.artwork ? null : character.placeholder) : '❔',
          artwork: found ? character.artwork : null,
          characterStatus: found ? (character.artwork ? 'official' : 'placeholder') : 'undiscovered'
        };
      });
  }

  function buildElementCards(stages, elements, progress) {
    const discovered = new Set(progress?.discoveredElementIds || []);
    const cleared = new Set(progress?.clearedStageIds || []);
    const byId = new Map(elements.map(element => [Number(element.id), element]));
    return [...stages]
      .sort((a, b) => a.sequence - b.sequence)
      .map(stage => {
        const element = byId.get(Number(stage.elementId));
        const found = Boolean(element && discovered.has(Number(element.id)));
        return {
          stageId: stage.id,
          discovered: found,
          cleared: cleared.has(stage.id),
          symbol: found ? element.symbol : null,
          name: found ? element.nameJa : '???',
          atomicNumber: found ? element.atomicNumber : null
        };
      });
  }

  return { buildCustomCards, buildOwnedCards, buildAllyCards, buildEnemyCards, buildElementCards };
});
