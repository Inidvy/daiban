// The evening 代班 shift (docs/design.md, "Speaking"): checks a spoken answer for meaning, not exact words,
// gives a clarification on a near miss, and builds the hint ladder.

import { segment, toPinyin } from './content.ts';
import { findMatch, normalize, parseTemplate } from './matcher.ts';
import type { Lexicon } from './matcher.ts';
import { digitsToChinese, NUMERAL_CHARS, parseChineseNumber, priceWord } from './numbers.ts';
import { looksLikePinyin, matchesPinyin } from './pinyin.ts';
import type { Pattern, ShiftTurn, Word } from './types.ts';

export type Verdict =
  | { kind: 'ok'; patternId: string; heard: string }
  /** The right kind of answer with a wrong detail: the customer asks back instead of failing you. */
  | { kind: 'near'; patternId: string; heard: string; clarify: { text: string; en: string } }
  | { kind: 'miss'; heard: string };

/** Time to answer: generous to begin with and longer after every miss. */
export function timeLimitMs(misses: number): number {
  return 10_000 + 5_000 * misses;
}

function numberIn(text: string): number | null {
  const run = [...text].filter((ch) => NUMERAL_CHARS.includes(ch)).join('');
  return run ? parseChineseNumber(run) : null;
}

export function checkAnswer(
  turn: ShiftTurn,
  alternatives: readonly string[],
  patterns: readonly Pattern[],
  lexicon: Lexicon,
  words: readonly Word[],
): Verdict {
  const expected = turn.expect.map((id) => patterns.find((p) => p.id === id)).filter((p): p is Pattern => !!p);
  let near: Verdict | null = null;
  for (const alt of alternatives) {
    if (looksLikePinyin(alt)) {
      // Typed pinyin: the price slot must be the right price, other slots accept anything.
      const fill = turn.price !== undefined ? { 价钱: priceWord(turn.price) } : {};
      const p = expected.find((e) => matchesPinyin(alt, e.template, words, fill));
      if (p) return { kind: 'ok', patternId: p.id, heard: alt };
      continue;
    }
    const text = digitsToChinese(alt);
    for (const p of expected) {
      const m = findMatch(p.template, text, lexicon);
      if (!m) continue;
      const price = m.bindings.价钱?.value;
      if (turn.price === undefined || price === turn.price) return { kind: 'ok', patternId: p.id, heard: alt };
      near ??= { kind: 'near', patternId: p.id, heard: alt, clarify: { text: `${m.bindings.价钱?.text}？不对吧。`, en: `${price}? That can't be right. Count again.` } };
    }
    // A bare number without 块 is nearly a price.
    if (turn.price !== undefined && !near) {
      const n = numberIn(normalize(text));
      if (n !== null) {
        near =
          n === turn.price
            ? { kind: 'near', patternId: expected[0].id, heard: alt, clarify: { text: `${normalize(text)}……什么？`, en: `${n} what? Prices end in 块.` } }
            : { kind: 'near', patternId: expected[0].id, heard: alt, clarify: { text: '多少？不对吧。', en: `${n}? That can't be right. Count again.` } };
      }
    }
  }
  return near ?? { kind: 'miss', heard: alternatives[0] ?? '' };
}

export interface Hint {
  level: 1 | 2 | 3;
  text: string;
  en: string;
}

/** The hint ladder: pinyin of the first word, then the pattern with blanks, then the model answer to repeat. */
export function hintLadder(turn: ShiftTurn, patterns: readonly Pattern[], words: readonly Word[]): [Hint, Hint, Hint] {
  const first = segment(normalize(turn.model), words)[0]?.text ?? turn.model[0];
  const p = patterns.find((x) => x.id === turn.expect[0]);
  const blanks = p ? parseTemplate(p.template).map((s) => (s.kind === 'text' ? s.text : '＿＿')).join('') : turn.model;
  return [
    { level: 1, text: `${toPinyin(first, words)} …`, en: 'It starts like this.' },
    { level: 2, text: blanks, en: p?.en ?? '' },
    { level: 3, text: turn.model, en: `${turn.modelEn} Listen, then say it.` },
  ];
}

/** For repair jobs and the recall check: returns what the player said if it contains the pattern, else null. */
export function saysPattern(pattern: Pattern, alternatives: readonly string[], lexicon: Lexicon, words: readonly Word[]): string | null {
  for (const alt of alternatives) {
    if (looksLikePinyin(alt) ? matchesPinyin(alt, pattern.template, words) : findMatch(pattern.template, digitsToChinese(alt), lexicon)) return alt;
  }
  return null;
}

/** Loose check for "say this exact sentence": most of its characters, in order. */
export function saidSentence(target: string, alternatives: readonly string[]): string | null {
  const want = normalize(target);
  for (const alt of alternatives) {
    const got = normalize(digitsToChinese(alt));
    // Longest common subsequence, so a dropped filler word (老板) doesn't fail the whole line.
    let prev = new Array<number>(got.length + 1).fill(0);
    for (const w of want) {
      const row = [0];
      for (let j = 0; j < got.length; j++) row.push(w === got[j] ? prev[j] + 1 : Math.max(prev[j + 1], row[j]));
      prev = row;
    }
    if (want.length && prev[got.length] / want.length >= 0.7) return alt;
  }
  return null;
}
