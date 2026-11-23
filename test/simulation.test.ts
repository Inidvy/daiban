import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getDay, segment, toPinyin, validateContent } from '../src/content.ts';
import { contentPath, loadContent } from '../src/load-content.ts';
import { parseTemplate } from '../src/matcher.ts';
import { parseScript } from '../src/script.ts';
import { runDay } from '../src/simulation.ts';

const content = loadContent();
const scriptFor = (day: number) => parseScript(readFileSync(contentPath(getDay(content, day).sampleScript), 'utf8'));

test('content files are consistent', () => {
  assert.deepEqual(validateContent(content), []);
});

test('every pattern word has pinyin', () => {
  for (const p of content.patterns) {
    for (const seg of parseTemplate(p.template)) {
      if (seg.kind !== 'text') continue;
      assert.doesNotMatch(toPinyin(seg.text, content.words), /\p{Script=Han}/u, `${p.id}: ${seg.text}`);
    }
  }
});

test('pinyin follows the longest word', () => {
  assert.equal(toPinyin('我要两碗牛肉面，不要辣', content.words), 'wǒ yào liǎng wǎn niúròumiàn, bù yào là');
});

for (const day of content.days) {
  test(`Day ${day.day} sample script serves 20 customers and earns 3 stars`, () => {
    for (const seed of [1, 2, 3]) {
      const result = runDay({ content, day, script: scriptFor(day.day), customers: 20, seed });
      const failures = result.results.flatMap((r) => r.failures.map((f) => `#${r.customer.id}: ${f.reason}`));
      assert.deepEqual(failures, [], `seed ${seed}`);
      assert.equal(result.stars, 3);
    }
  });
}

test('old scripts break on later days, and failures land in the night review', () => {
  const result = runDay({ content, day: getDay(content, 5), script: scriptFor(1), customers: 20, seed: 1 });
  assert.ok(result.satisfaction < 0.5, `satisfaction ${result.satisfaction}`);
  assert.ok(result.review.length > 0);
  for (const item of result.review) assert.ok(item.pinyin && item.en, item.text);
});

test('the same seed gives the same day', () => {
  const run = () => runDay({ content, day: getDay(content, 4), script: scriptFor(3), customers: 20, seed: 9 });
  const a = run();
  const b = run();
  assert.deepEqual(
    a.results.map((r) => r.transcript),
    b.results.map((r) => r.transcript),
  );
  assert.equal(a.satisfaction, b.satisfaction);
});
