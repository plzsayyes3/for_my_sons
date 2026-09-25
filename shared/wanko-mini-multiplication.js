((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WankoMiniMultiplication = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const TARGET_CORRECT = 99;
  const STREAK_STEP = 11;
  const MAX_PER_ANSWER = 9;

  function clampRandom(random) {
    const value = Number(random());
    if (!Number.isFinite(value)) return 0;
    return Math.min(0.999999999, Math.max(0, value));
  }

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(clampRandom(random) * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function pointsForStreak(streak) {
    const count = Math.max(1, Math.floor(Number(streak) || 1));
    return Math.min(MAX_PER_ANSWER, 1 + Math.floor((count - 1) / STREAK_STEP));
  }

  function perfectRunTotal(count = TARGET_CORRECT) {
    const total = Math.max(0, Math.floor(Number(count) || 0));
    let points = 0;
    for (let streak = 1; streak <= total; streak++) points += pointsForStreak(streak);
    return points;
  }

  function allFacts() {
    const facts = [];
    for (let a = 1; a <= 9; a++) {
      for (let b = 1; b <= 9; b++) facts.push({ a, b, answer: a * b });
    }
    return facts;
  }

  function createRound(count = TARGET_CORRECT, random = Math.random) {
    const total = Math.max(1, Math.min(999, Math.floor(Number(count) || TARGET_CORRECT)));
    const base = allFacts();
    const result = [];
    let previousKey = '';
    while (result.length < total) {
      let cycle = shuffle(base, random);
      if (previousKey && cycle.length > 1) {
        const firstKey = cycle[0].a + 'x' + cycle[0].b;
        if (firstKey === previousKey) [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
      }
      for (const fact of cycle) {
        if (result.length >= total) break;
        result.push({ ...fact, number: result.length + 1 });
        previousKey = fact.a + 'x' + fact.b;
      }
    }
    return result;
  }

  return {
    TARGET_CORRECT,
    STREAK_STEP,
    MAX_PER_ANSWER,
    pointsForStreak,
    perfectRunTotal,
    createRound
  };
});
