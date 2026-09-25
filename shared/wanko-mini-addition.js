((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WankoMiniAddition = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const LEVELS = Object.freeze([
    { id: 'one-one', label: '1桁 + 1桁', maxPoints: 1, minA: 1, maxA: 9, minB: 1, maxB: 9 },
    { id: 'two-one', label: '2桁 + 1桁', maxPoints: 1, minA: 10, maxA: 99, minB: 1, maxB: 9 },
    { id: 'two-two', label: '2桁 + 2桁', maxPoints: 2, minA: 10, maxA: 99, minB: 10, maxB: 99 },
    { id: 'three-one', label: '3桁 + 1桁', maxPoints: 3, minA: 100, maxA: 999, minB: 1, maxB: 9 },
    { id: 'three-three', label: '3桁 + 3桁', maxPoints: 5, minA: 100, maxA: 999, minB: 100, maxB: 999 }
  ]);

  const LEVEL_BY_ID = new Map(LEVELS.map(level => [level.id, level]));

  function clampRandom(random) {
    const value = Number(random());
    if (!Number.isFinite(value)) return 0;
    return Math.min(0.999999999, Math.max(0, value));
  }

  function randomInt(min, max, random = Math.random) {
    return min + Math.floor(clampRandom(random) * (max - min + 1));
  }

  function scoreQuestion(levelId, mistakes) {
    const miss = Math.max(0, Math.floor(Number(mistakes) || 0));
    switch (levelId) {
      case 'one-one': return miss === 0 ? 1 : 0;
      case 'two-one': return 1;
      case 'two-two': return miss === 0 ? 2 : 1;
      case 'three-one': return miss === 0 ? 3 : 1;
      case 'three-three': return Math.max(1, 5 - miss);
      default: throw new Error('Unknown addition level: ' + levelId);
    }
  }

  function createQuestion(levelId, random = Math.random) {
    const level = LEVEL_BY_ID.get(levelId);
    if (!level) throw new Error('Unknown addition level: ' + levelId);
    const a = randomInt(level.minA, level.maxA, random);
    const b = randomInt(level.minB, level.maxB, random);
    return {
      levelId: level.id,
      label: level.label,
      maxPoints: level.maxPoints,
      a,
      b,
      answer: a + b
    };
  }

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(clampRandom(random) * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function createRound(random = Math.random) {
    const levelIds = LEVELS.flatMap(level => [level.id, level.id]);
    const used = new Set();
    return shuffle(levelIds, random).map(levelId => {
      let question = createQuestion(levelId, random);
      let key = levelId + ':' + question.a + '+' + question.b;
      let attempts = 0;
      while (used.has(key) && attempts < 20) {
        question = createQuestion(levelId, random);
        key = levelId + ':' + question.a + '+' + question.b;
        attempts++;
      }
      used.add(key);
      return question;
    });
  }

  return { LEVELS, scoreQuestion, createQuestion, createRound };
});
