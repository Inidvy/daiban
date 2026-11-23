import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDay } from '../src/content.ts';
import { loadContent, readSampleScript } from '../src/load-content.ts';
import { dueIds, GRADE, isUnlocked, progressSummary, rate, rushGrades, speakingGrade, starsWithShift, strengthOf } from '../src/progress.ts';
import { parseScript } from '../src/script.ts';
import { generateCustomers, serveAll } from '../src/simulation.ts';

const content = loadContent();
const day = (n: number) => new Date(Date.UTC(2026, 0, n, 10));

test('cards go from new to shaky to known, and come back when due', async () => {
  let cards = await rate({}, new Map([['p_order', GRADE.good]]), day(1));
  assert.equal(strengthOf(undefined, day(1)), 'new');
  assert.equal(strengthOf(cards.p_order, day(1)), 'shaky');
  // JSON round trip, as in localStorage.
  cards = JSON.parse(JSON.stringify(cards));
  cards = await rate(cards, new Map([['p_order', GRADE.good]]), day(2));
  assert.equal(strengthOf(cards.p_order, day(3)), 'known');
  assert.deepEqual(dueIds(cards, day(3)), []);
  assert.deepEqual(dueIds(cards, day(60)), ['p_order']);
  assert.equal(progressSummary(content, 1, cards, day(3)).handled, 1);
});

test('a forgotten pattern drops back to shaky', async () => {
  let cards = await rate({}, new Map([['p_thanks', GRADE.easy]]), day(1));
  cards = await rate(cards, new Map([['p_thanks', GRADE.again]]), day(5));
  assert.equal(strengthOf(cards.p_thanks, day(5)), 'shaky');
  assert.equal(cards.p_thanks.lapses, 1);
});

test('rush grades: good when served, hard when the bot misunderstood', () => {
  const d = getDay(content, 3);
  const customers = generateCustomers(content, d, 12, 7);
  const good = rushGrades(serveAll(content, d, parseScript(readSampleScript(d)), customers));
  assert.ok([...good.values()].every((g) => g === GRADE.good));
  const bad = rushGrades(serveAll(content, d, parseScript(readSampleScript(getDay(content, 1))), customers));
  assert.ok([...bad.values()].includes(GRADE.hard));
});

test('speaking grades, stars and unlocks', () => {
  assert.equal(speakingGrade({ misses: 0, hints: 0, gaveUp: false }), GRADE.easy);
  assert.equal(speakingGrade({ misses: 2, hints: 0, gaveUp: false }), GRADE.good);
  assert.equal(speakingGrade({ misses: 0, hints: 1, gaveUp: false }), GRADE.hard);
  assert.equal(speakingGrade({ misses: 0, hints: 3, gaveUp: true }), GRADE.again);
  assert.equal(starsWithShift(3, false), 2);
  assert.equal(starsWithShift(3, true), 3);
  assert.equal(starsWithShift(1, false), 1);
  assert.ok(isUnlocked(1, {}));
  assert.ok(!isUnlocked(2, {}));
  assert.ok(isUnlocked(2, { 1: 1 }));
});
