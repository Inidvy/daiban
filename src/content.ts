// Loads and checks the JSON content files in content/.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLexicon, parseTemplate } from './matcher.ts';
import type { Kitchen } from './interpreter.ts';
import type { Content, CustomerType, Day, Pattern, Word } from './types.ts';

const CONTENT_DIR = new URL('../content/', import.meta.url);

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, CONTENT_DIR), 'utf8')) as T;
}

export function loadContent(): Content {
  const content: Content = {
    words: readJson<Word[]>('words.json'),
    patterns: readJson<Pattern[]>('patterns.json'),
    customerTypes: readJson<CustomerType[]>('customers.json'),
    days: readJson<Day[]>('days.json'),
  };
  const errors = validateContent(content);
  if (errors.length) throw new Error(`content/ has problems:\n- ${errors.join('\n- ')}`);
  return content;
}

export function contentPath(relative: string): string {
  return fileURLToPath(new URL(relative, CONTENT_DIR));
}

export function getDay(content: Content, n: number): Day {
  const day = content.days.find((d) => d.day === n);
  if (!day) throw new Error(`no Day ${n} (days: ${content.days.map((d) => d.day).join(', ')})`);
  return day;
}

export function kitchenFor(content: Content, day: Day): Kitchen {
  const dishes = new Map(content.words.filter((w) => w.slot === '东西').map((w) => [w.hanzi, w]));
  return { lexicon: buildLexicon(content.words), dishes, menu: new Set(day.menu), soldOut: new Set(day.soldOut) };
}

export function validateContent(c: Content): string[] {
  const errors: string[] = [];
  const dupes = <T>(items: T[], key: (x: T) => string, what: string) => {
    const seen = new Set<string>();
    for (const it of items) {
      const k = key(it);
      if (seen.has(k)) errors.push(`duplicate ${what}: ${k}`);
      seen.add(k);
    }
  };
  dupes(c.words, (w) => w.hanzi, 'word');
  dupes(c.patterns, (p) => p.id, 'pattern id');
  dupes(c.customerTypes, (t) => t.id, 'customer type');
  dupes(c.days, (d) => String(d.day), 'day');

  const words = new Map(c.words.map((w) => [w.hanzi, w]));
  for (const w of c.words) {
    if (w.slot === '东西' && (w.price === undefined || !w.measure)) errors.push(`dish ${w.hanzi} needs a price and a measure word`);
    if (w.measure && words.get(w.measure)?.slot !== '量词') errors.push(`dish ${w.hanzi}: measure ${w.measure} is not a 量词 word`);
  }
  for (const p of c.patterns) {
    try {
      parseTemplate(p.template);
    } catch (e) {
      errors.push(`pattern ${p.id}: ${(e as Error).message}`);
    }
  }

  const patterns = new Map(c.patterns.map((p) => [p.id, p]));
  const types = new Set(c.customerTypes.map((t) => t.id));
  for (const d of c.days) {
    for (const id of d.newPatterns) {
      const p = patterns.get(id);
      if (!p) errors.push(`Day ${d.day}: unknown pattern ${id}`);
      else if (p.day !== d.day) errors.push(`Day ${d.day}: pattern ${id} says day ${p.day}`);
    }
    for (const dish of d.menu) if (words.get(dish)?.slot !== '东西') errors.push(`Day ${d.day}: menu item ${dish} is not a dish word`);
    for (const dish of d.soldOut) if (!d.menu.includes(dish)) errors.push(`Day ${d.day}: sold-out ${dish} is not on the menu`);
    if (d.soldOut.length >= d.menu.length) errors.push(`Day ${d.day}: everything is sold out`);
    for (const t of d.customerTypes) if (!types.has(t)) errors.push(`Day ${d.day}: unknown customer type ${t}`);
    if (!existsSync(contentPath(d.sampleScript))) errors.push(`Day ${d.day}: missing sample script ${d.sampleScript}`);
  }
  for (const p of c.patterns) {
    if (!c.days.some((d) => d.newPatterns.includes(p.id))) errors.push(`pattern ${p.id} is not introduced on any day`);
  }
  return errors;
}

/** Pinyin by longest match against the word list, e.g. 我要两碗牛肉面 → wǒ yào liǎng wǎn niúròumiàn. */
export function toPinyin(text: string, words: readonly Word[]): string {
  const byHanzi = new Map(words.map((w) => [w.hanzi, w.pinyin]));
  const maxLen = Math.max(...words.map((w) => w.hanzi.length));
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let found = false;
    for (let len = Math.min(maxLen, text.length - i); len >= 1; len--) {
      const py = byHanzi.get(text.slice(i, i + len));
      if (py) {
        out.push(py);
        i += len;
        found = true;
        break;
      }
    }
    if (!found) {
      const ch = text[i];
      if (/[，。？！,.?!]/.test(ch) && out.length) out[out.length - 1] += ch === '，' ? ',' : ch === '。' ? '.' : ch === '？' ? '?' : ch === '！' ? '!' : ch;
      else if (!/\s/.test(ch)) out.push(ch);
      i++;
    }
  }
  return out.join(' ');
}
