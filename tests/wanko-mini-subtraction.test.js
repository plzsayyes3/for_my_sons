const test = require('node:test');
const assert = require('node:assert/strict');
const subtraction = require('../shared/wanko-mini-subtraction.js');

test('subtraction scoring follows the same mistake rules as addition', () => {
  assert.equal(subtraction.scoreQuestion('one-one', 0), 1);
  assert.equal(subtraction.scoreQuestion('one-one', 1), 0);
  assert.equal(subtraction.scoreQuestion('two-one', 0), 1);
  assert.equal(subtraction.scoreQuestion('two-one', 5), 1);
  assert.equal(subtraction.scoreQuestion('two-two', 0), 2);
  assert.equal(subtraction.scoreQuestion('two-two', 1), 1);
  assert.equal(subtraction.scoreQuestion('three-one', 0), 3);
  assert.equal(subtraction.scoreQuestion('three-one', 1), 1);
  assert.equal(subtraction.scoreQuestion('three-three', 0), 5);
  assert.equal(subtraction.scoreQuestion('three-three', 1), 4);
  assert.equal(subtraction.scoreQuestion('three-three', 2), 3);
  assert.equal(subtraction.scoreQuestion('three-three', 3), 2);
  assert.equal(subtraction.scoreQuestion('three-three', 4), 1);
  assert.equal(subtraction.scoreQuestion('three-three', 9), 1);
});

test('subtraction courses use the same animal size difficulty ladder', () => {
  assert.deepEqual(
    subtraction.COURSES.map(course => [course.name, course.levelId]),
    [
      ['蟻', 'one-one'],
      ['ネズミ', 'two-one'],
      ['犬', 'two-two'],
      ['ゾウ', 'three-one'],
      ['シロナガスクジラ', 'three-three']
    ]
  );
});

test('subtraction questions never produce negative answers', () => {
  let seed = 1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const course of subtraction.COURSES) {
    const round = subtraction.createCourseRound(course.id, 30, random);
    assert.equal(round.length, 30);
    for (const question of round) {
      assert.equal(question.levelId, course.levelId);
      assert.equal(question.answer, question.a - question.b);
      assert.ok(question.a >= question.b);
      assert.ok(question.answer >= 0);
    }
  }
});
