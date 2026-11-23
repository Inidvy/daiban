import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChineseNumber, priceWord, quantityWord, toChineseNumber } from '../src/numbers.ts';

test('parses Chinese numerals', () => {
  const cases: [string, number][] = [
    ['一', 1], ['两', 2], ['二', 2], ['十', 10], ['十五', 15], ['二十', 20], ['三十六', 36],
    ['一百', 100], ['一百零五', 105], ['一百二十五', 125], ['两千零五', 2005], ['零', 0],
  ];
  for (const [text, value] of cases) assert.equal(parseChineseNumber(text), value, text);
});

test('rejects malformed numerals', () => {
  for (const bad of ['', '一二', '十百', '五五', '碗']) assert.equal(parseChineseNumber(bad), null, bad);
});

test('writes numbers and reads them back', () => {
  assert.equal(toChineseNumber(10), '十');
  assert.equal(toChineseNumber(110), '一百一十');
  assert.equal(toChineseNumber(1005), '一千零五');
  for (let n = 0; n <= 2000; n++) assert.equal(parseChineseNumber(toChineseNumber(n)), n, String(n));
});

test('uses 两 before measure words and prices', () => {
  assert.equal(quantityWord(2), '两');
  assert.equal(quantityWord(3), '三');
  assert.equal(priceWord(2), '两块');
  assert.equal(priceWord(36), '三十六块');
});
