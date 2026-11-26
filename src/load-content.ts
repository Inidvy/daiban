// Loads the content/ folder from disk (Node only: CLI and tests).

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateContent } from './content.ts';
import type { Content, CustomerType, Day, Pattern, Place, Word } from './types.ts';

const CONTENT_DIR = new URL('../content/', import.meta.url);

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, CONTENT_DIR), 'utf8')) as T;
}

export function contentPath(relative: string): string {
  return fileURLToPath(new URL(relative, CONTENT_DIR));
}

export function loadContent(): Content {
  const content: Content = {
    words: readJson<Word[]>('words.json'),
    patterns: readJson<Pattern[]>('patterns.json'),
    customerTypes: readJson<CustomerType[]>('customers.json'),
    days: readJson<Day[]>('days.json'),
    places: readJson<Place[]>('places.json'),
  };
  const errors = validateContent(content);
  for (const d of content.days) {
    if (!existsSync(contentPath(d.sampleScript))) errors.push(`Day ${d.day}: missing sample script ${d.sampleScript}`);
  }
  if (errors.length) throw new Error(`content/ has problems:\n- ${errors.join('\n- ')}`);
  return content;
}

export function readSampleScript(day: Day): string {
  return readFileSync(contentPath(day.sampleScript), 'utf8');
}
