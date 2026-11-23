// Content helpers shared by Node (CLI, tests) and the browser. No file access here:
// Node loads the JSON with load-content.ts, the browser with ui/content.ts.

import { buildLexicon, parseTemplate } from './matcher.ts';
import type { Kitchen } from './interpreter.ts';
import type { Content, Day, Word } from './types.ts';

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
  }
  for (const p of c.patterns) {
    if (!c.days.some((d) => d.newPatterns.includes(p.id))) errors.push(`pattern ${p.id} is not introduced on any day`);
  }
  return errors;
}

export interface Token {
  text: string;
  /** The word this token is, if it's in the word list. */
  word?: Word;
}

/** Splits text into known words by longest match: 我要两碗牛肉面 → 我 | 要 | 两 | 碗 | 牛肉面. */
export function segment(text: string, words: readonly Word[]): Token[] {
  const byHanzi = new Map(words.map((w) => [w.hanzi, w]));
  const maxLen = Math.max(...words.map((w) => w.hanzi.length));
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    let found: Word | undefined;
    for (let len = Math.min(maxLen, text.length - i); len >= 1 && !found; len--) {
      found = byHanzi.get(text.slice(i, i + len));
    }
    if (found) {
      tokens.push({ text: found.hanzi, word: found });
      i += found.hanzi.length;
    } else {
      const last = tokens.at(-1);
      if (last && !last.word) last.text += text[i]; // glue unknown characters together
      else tokens.push({ text: text[i] });
      i++;
    }
  }
  return tokens;
}

const PUNCTUATION_PINYIN: Record<string, string> = { '，': ',', '。': '.', '？': '?', '！': '!', ',': ',', '.': '.', '?': '?', '!': '!' };

/** Pinyin by longest match against the word list, e.g. 我要两碗牛肉面 → wǒ yào liǎng wǎn niúròumiàn. */
export function toPinyin(text: string, words: readonly Word[]): string {
  const out: string[] = [];
  for (const t of segment(text, words)) {
    if (t.word) {
      out.push(t.word.pinyin);
      continue;
    }
    for (const ch of t.text) {
      const p = PUNCTUATION_PINYIN[ch];
      if (p && out.length) out[out.length - 1] += p;
      else if (!p && !/\s/.test(ch)) out.push(ch);
    }
  }
  return out.join(' ');
}
