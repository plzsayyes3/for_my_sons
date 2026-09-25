const test = require('node:test');
const assert = require('node:assert/strict');
const addition = require('../shared/wanko-mini-addition.js');

test('addition scoring follows the configured mistake rules', () => {
  assert.equal(addition.scoreQuestion('one-one', 0), 1);
  assert.equal(addition.scoreQuestion('one-one', 1), 0);
  assert.equal(addition.scoreQuestion('two-one', 0), 1);
  assert.equal(addition.scoreQuestion('two-one', 4), 1);
  assert.equal(addition.scoreQuestion('two-two', 0), 2);
  assert.equal(addition.scoreQuestion('two-two', 1), 1);
  assert.equal(addition.scoreQuestion('three-one', 0), 3);
  assert.equal(addition.scoreQuestion('three-one', 1), 1);
  assert.equal(addition.scoreQuestion('three-three', 0), 5);
  assert.equal(addition.scoreQuestion('three-three', 1), 4);
  assert.equal(addition.scoreQuestion('three-three', 2), 3);
  assert.equal(addition.scoreQuestion('three-three', 3), 2);
  assert.equal(addition.scoreQuestion('three-three', 4), 1);
  assert.equal(addition.scoreQuestion('three-three', 8), 1);
});

test('a round contains two questions from each addition level', () => {
  let seed = 0;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const round = addition.createRound(random);
  assert.equal(round.length, 10);
  const counts = new Map();
  for (const question of round) {
    counts.set(question.levelId, (counts.get(question.levelId) || 0) + 1);
    assert.equal(question.answer, question.a + question.b);
  }
  for (const level of addition.LEVELS) assert.equal(counts.get(level.id), 2);
});
