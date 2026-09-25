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

test('animal courses map body size from ant to blue whale onto difficulty', () => {
  assert.deepEqual(
    addition.COURSES.map(course => [course.name, course.levelId]),
    [
      ['蟻', 'one-one'],
      ['ネズミ', 'two-one'],
      ['犬', 'two-two'],
      ['ゾウ', 'three-one'],
      ['シロナガスクジラ', 'three-three']
    ]
  );
});

test('a selected course produces ten questions from only that level', () => {
  let seed = 0;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const round = addition.createCourseRound('blue-whale', 10, random);
  assert.equal(round.length, 10);
  for (const question of round) {
    assert.equal(question.levelId, 'three-three');
    assert.equal(question.courseId, 'blue-whale');
    assert.equal(question.answer, question.a + question.b);
  }
});
