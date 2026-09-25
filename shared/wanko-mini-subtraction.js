((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WankoMiniSubtraction = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const LEVELS = Object.freeze([
    { id: 'one-one', label: '1桁 − 1桁', maxPoints: 1, minA: 1, maxA: 9, minB: 1, maxB: 9 },
    { id: 'two-one', label: '2桁 − 1桁', maxPoints: 1, minA: 10, maxA: 99, minB: 1, maxB: 9 },
    { id: 'two-two', label: '2桁 − 2桁', maxPoints: 2, minA: 10, maxA: 99, minB: 10, maxB: 99 },
    { id: 'three-one', label: '3桁 − 1桁', maxPoints: 3, minA: 100, maxA: 999, minB: 1, maxB: 9 },
    { id: 'three-three', label: '3桁 − 3桁', maxPoints: 5, minA: 100, maxA: 999, minB: 100, maxB: 999 }
  ]);

  const COURSES = Object.freeze([
    { id: 'ant', name: '蟻', emoji: '🐜', sizeLabel: 'ちいさい', levelId: 'one-one' },
    { id: 'mouse', name: 'ネズミ', emoji: '🐭', sizeLabel: 'すこし大きい', levelId: 'two-one' },
    { id: 'dog', name: '犬', emoji: '🐕', sizeLabel: 'もっと大きい', levelId: 'two-two' },
    { id: 'elephant', name: 'ゾウ', emoji: '🐘', sizeLabel: 'かなり大きい', levelId: 'three-one' },
    { id: 'blue-whale', name: 'シロナガスクジラ', emoji: '🐋', sizeLabel: 'いちばん大きい', levelId: 'three-three' }
  ]);

  const LEVEL_BY_ID = new Map(LEVELS.map(level => [level.id, level]));
  const COURSE_BY_ID = new Map(COURSES.map(course => [course.id, course]));

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
      default: throw new Error('Unknown subtraction level: ' + levelId);
    }
  }

  function createQuestion(levelId, random = Math.random) {
    const level = LEVEL_BY_ID.get(levelId);
    if (!level) throw new Error('Unknown subtraction level: ' + levelId);
    let a = randomInt(level.minA, level.maxA, random);
    let b = randomInt(level.minB, level.maxB, random);
    if (b > a) [a, b] = [b, a];
    return {
      levelId: level.id,
      label: level.label,
      maxPoints: level.maxPoints,
      a,
      b,
      answer: a - b
    };
  }

  function createCourseRound(courseId, count = 10, random = Math.random) {
    const course = COURSE_BY_ID.get(courseId);
    if (!course) throw new Error('Unknown subtraction course: ' + courseId);
    const total = Math.max(1, Math.min(50, Math.floor(Number(count) || 10)));
    const used = new Set();
    const result = [];
    for (let index = 0; index < total; index++) {
      let question = createQuestion(course.levelId, random);
      let key = question.a + '-' + question.b;
      let attempts = 0;
      while (used.has(key) && attempts < 30) {
        question = createQuestion(course.levelId, random);
        key = question.a + '-' + question.b;
        attempts++;
      }
      used.add(key);
      result.push({ ...question, courseId: course.id, courseName: course.name, courseEmoji: course.emoji });
    }
    return result;
  }

  function createRound(random = Math.random) {
    return createCourseRound('ant', 10, random);
  }

  return { LEVELS, COURSES, scoreQuestion, createQuestion, createCourseRound, createRound };
});
