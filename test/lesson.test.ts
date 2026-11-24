import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDay } from '../src/content.ts';
import { fromScript } from '../src/editor.ts';
import { FIRST_LESSON, ruleFor } from '../src/lesson.ts';
import { loadContent, readSampleScript } from '../src/load-content.ts';
import { paletteFor } from '../src/palette.ts';
import { parseScript } from '../src/script.ts';

const content = loadContent();

test('every block the lesson asks for exists on Day 1', () => {
  const keys = new Set(paletteFor(content, 1).map((i) => i.key));
  for (const step of FIRST_LESSON) {
    if (step.kind === 'place') for (const k of step.paletteKeys) assert.ok(keys.has(k), `${step.id}: ${k}`);
  }
});

test('place steps are not done on an empty script and are done by the Day 1 sample', () => {
  const sample = fromScript(parseScript(readSampleScript(getDay(content, 1))));
  for (const step of FIRST_LESSON) {
    if (step.kind !== 'place') continue;
    assert.equal(step.done([]), false, step.id);
    assert.equal(step.done(sample), true, step.id);
  }
  assert.ok(ruleFor(sample, '我要[数量][量词][东西]'));
});
