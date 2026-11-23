// Content for the browser: the same JSON files the CLI reads, bundled by Vite.

import wordsJson from '../../content/words.json';
import patternsJson from '../../content/patterns.json';
import customersJson from '../../content/customers.json';
import daysJson from '../../content/days.json';
import { validateContent } from '../content.ts';
import type { Content, CustomerType, Day, Pattern, Word } from '../types.ts';

// see https://vite.dev/guide/features#glob-import (?raw gives the file text)
const sampleFiles = import.meta.glob('../../content/scripts/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

export const content: Content = {
  words: wordsJson as Word[],
  patterns: patternsJson as Pattern[],
  customerTypes: customersJson as CustomerType[],
  days: daysJson as unknown as Day[],
};

const problems = validateContent(content);
if (problems.length) console.error('content/ has problems:\n' + problems.join('\n'));

export const wordByHanzi = new Map(content.words.map((w) => [w.hanzi, w]));

export function sampleScript(day: Day): string {
  const text = sampleFiles[`../../content/${day.sampleScript}`];
  if (text === undefined) throw new Error(`missing sample script ${day.sampleScript}`);
  return text;
}
