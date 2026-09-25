const test = require('node:test');
const assert = require('node:assert/strict');
const multiplication = require('../shared/wanko-mini-multiplication.js');

test('multiplication streak scoring rises every eleven consecutive answers', () => {
  assert.equal(multiplication.pointsForStreak(1), 1);
  assert.equal(multiplication.pointsForStreak(11), 1);
  assert.equal(multiplication.pointsForStreak(12), 2);
  assert.equal(multiplication.pointsForStreak(22), 2);
  assert.equal(multiplication.pointsForStreak(23), 3);
  assert.equal(multiplication.pointsForStreak(88), 8);
  assert.equal(multiplication.pointsForStreak(89), 9);
  assert.equal(multiplication.pointsForStreak(99), 9);
});

test('a perfect ninety-nine answer run is about five hundred points', () => {
  assert.equal(multiplication.perfectRunTotal(99), 495);
});

test('multiplication round contains ninety-nine valid 1-to-9 facts', () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const round = multiplication.createRound(99, random);
  assert.equal(round.length, 99);
  for (const question of round) {
    assert.ok(question.a >= 1 && question.a <= 9);
    assert.ok(question.b >= 1 && question.b <= 9);
    assert.equal(question.answer, question.a * question.b);
  }
});
