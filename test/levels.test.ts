import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segment } from '../src/content.ts';
import { buildLexicon, findMatch, normalize } from '../src/matcher.ts';
import { allLevels, isLevelOpen, levelDay, migrateDayStars, nextLevel } from '../src/levels.ts';
import { loadContent, readSampleScript } from '../src/load-content.ts';
import { paletteFor } from '../src/palette.ts';
import { parseScript } from '../src/script.ts';
import { generateCustomers, serveAll, summarize } from '../src/simulation.ts';

const content = loadContent();
const levels = allLevels(content);
const customerPattern = new Set(content.patterns.filter((p) => p.speaker === 'customer').map((p) => p.id));

test('levels run 1-1, 1-2, … through the last day', () => {
  assert.equal(levels[0].id, '1-1');
  assert.equal(nextLevel(content, '1-4')?.id, '2-1');
  assert.equal(nextLevel(content, levels.at(-1)!.id), undefined);
});

test('levels get harder within a day', () => {
  for (const d of content.days) {
    const ls = levels.filter((l) => l.day === d.day);
    for (let i = 1; i < ls.length; i++) {
      assert.ok(ls[i].heat >= ls[i - 1].heat, `${ls[i].id} heat`);
      assert.ok(ls[i].customers >= ls[i - 1].customers, `${ls[i].id} customers`);
    }
  }
});

test('customers only say what the level has opened, and every new customer line shows up', () => {
  for (const level of levels) {
    const day = levelDay(content, level);
    const allowed = new Set(day.allowed);
    const used = new Set<string>();
    for (const c of generateCustomers(content, day, 60, 7)) {
      for (const u of [...c.queue, ...(c.afterSoldOut ?? []), ...(c.takeawayAnswer ? [c.takeawayAnswer.utterance] : [])]) {
        for (const id of u.patternIds) {
          assert.ok(allowed.has(id), `${level.id}: customer said ${id}`);
          used.add(id);
        }
      }
    }
    for (const id of level.newPatterns) if (customerPattern.has(id)) assert.ok(used.has(id), `${level.id}: nobody said ${id}`);
  }
});

test('the palette offers only the level’s sentences', () => {
  const day = levelDay(content, levels[0]);
  const keys = paletteFor(content, 1, day.allowed).map((i) => i.key);
  assert.ok(keys.includes('hear:p_order'));
  assert.ok(!keys.includes('hear:p_price_q'));
});

test('each day’s sample script clears every level of that day', () => {
  for (const level of levels) {
    const day = levelDay(content, level);
    const script = parseScript(readSampleScript(day));
    const results = serveAll(content, day, script, generateCustomers(content, day, level.customers * 3, 11));
    assert.ok(summarize(day, script, results).stars >= 1, `${level.id}`);
  }
});

test('a level opens once the one before it has a star', () => {
  assert.ok(isLevelOpen(content, '1-1', {}));
  assert.ok(!isLevelOpen(content, '1-2', {}));
  assert.ok(isLevelOpen(content, '1-2', { '1-1': 1 }));
  assert.ok(isLevelOpen(content, '2-1', { '1-4': 2 }));
});

test('old per-day stars carry over to that day’s levels', () => {
  const stars = migrateDayStars(content, { 1: 2 });
  assert.equal(stars['1-1'], 2);
  assert.equal(stars['1-4'], 2);
  assert.equal(stars['2-1'], undefined);
});

test('every Chinese word in sentences, shifts and day titles has pinyin', () => {
  const texts = [
    ...content.patterns.map((p) => p.template),
    ...content.days.flatMap((d) => [d.title, ...d.vip.turns.flatMap((t) => [t.says, t.model])]),
    ...content.places.map((p) => p.sign),
  ];
  for (const text of texts) {
    for (const t of segment(text.replace(/\[[^\]]*\]/g, ' '), content.words)) {
      if (/\p{Script=Han}/u.test(t.text)) assert.ok(t.word, `no pinyin for ${t.text} in ${text}`);
    }
  }
});

test('a question at one place never sets off another question’s rule there', () => {
  for (const place of content.places) {
    const asked = content.patterns.filter((p) => p.reply && content.days.find((d) => d.day === p.day)?.place === place.id);
    for (const a of asked) {
      for (const b of asked) {
        if (a !== b) assert.ok(!findMatch(a.template, normalize(b.template), buildLexicon(content.words)), `${a.id} matches ${b.id}`);
      }
    }
  }
});

test('every word in a course sentence is introduced on some day (none hide among the day-0 UI words)', () => {
  const hidden = new Set<string>();
  for (const d of content.days) {
    const texts = [
      ...d.newPatterns.map((id) => content.patterns.find((p) => p.id === id)!.template),
      ...(d.vip?.turns ?? []).flatMap((t) => [t.says, t.model]),
    ];
    for (const t of texts)
      for (const tok of segment(t.replace(/\[[^\]]*\]/g, ''), content.words))
        if (tok.word && tok.word.day === 0) hidden.add(tok.word.hanzi);
  }
  assert.deepEqual([...hidden], []);
});
