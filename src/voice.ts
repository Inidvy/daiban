// Speaking a script line instead of tapping it (docs/design.md, "Input modes"): once a block has been
// placed often enough, the player says it aloud (or types pinyin) and the line is matched here.

import type { BlockTemplate } from './editor.ts';
import { findMatch, normalize, parseTemplate } from './matcher.ts';
import type { Lexicon } from './matcher.ts';
import { digitsToChinese } from './numbers.ts';
import type { PaletteItem } from './palette.ts';
import { SLOT_INFO } from './palette.ts';
import { looksLikePinyin, matchesPinyin } from './pinyin.ts';
import type { SlotType, Word } from './types.ts';

/** After this many taps a block must be spoken to be placed. */
export const SPEAK_AFTER = 3;

/** The line as a sayable template with slots: 如果听到我要[数量][量词][东西], 做[数量][量词][东西], 说请慢用. */
export function voiceTemplate(t: BlockTemplate): string {
  if (t.kind === 'if') {
    const c = t.cond;
    return c.kind === '听到' || c.kind === '没听到' ? `如果${c.kind}${c.template}` : `如果${c.kind}${c.item}`;
  }
  const a = t.action;
  switch (a.kind) {
    case '说':
      return `说${a.text}`;
    case '做':
      return `${a.again ? '再' : ''}做${a.what}`;
    case '收钱':
      return `收钱${a.method ?? ''}`;
    default:
      return a.kind;
  }
}

function literalLength(template: string): number {
  return parseTemplate(template).reduce((n, s) => n + (s.kind === 'text' ? s.text.length : 0), 0);
}

/** Cleans a recognizer transcript: digits → hanzi numerals, a leading 就 dropped, slot names said literally → examples. */
export function prepareTranscript(text: string): string {
  let t = normalize(digitsToChinese(text)).replace(/^就/, '');
  for (const slot of Object.keys(SLOT_INFO) as SlotType[]) t = t.split(slot).join(SLOT_INFO[slot].example);
  return t;
}

export interface SpokenLine {
  item: PaletteItem;
  heard: string;
}

/**
 * Finds the palette item the player said. Tries every recognizer alternative; a whole-sentence match wins,
 * and among those the one with the most fixed text (so 如果听到打包 beats 打包).
 */
export function matchSpokenLine(alternatives: readonly string[], items: readonly PaletteItem[], lexicon: Lexicon, words: readonly Word[]): SpokenLine | null {
  let best: { line: SpokenLine; score: number } | null = null;
  const consider = (item: PaletteItem, heard: string, score: number) => {
    if (!best || score > best.score) best = { line: { item, heard }, score };
  };
  for (const alt of alternatives) {
    if (looksLikePinyin(alt)) {
      for (const item of items) {
        if (matchesPinyin(alt, voiceTemplate(item.template), words)) consider(item, alt, 1000 + literalLength(voiceTemplate(item.template)));
      }
      continue;
    }
    const text = prepareTranscript(alt);
    if (!text) continue;
    for (const item of items) {
      const template = voiceTemplate(item.template);
      const whole = findMatch(template, text, lexicon, { whole: true });
      if (whole) {
        consider(item, alt, 1000 + literalLength(template));
        continue;
      }
      // Recognizers add small words (吧, 了, 啊): accept a match that covers most of what was heard.
      const part = findMatch(template, text, lexicon);
      if (part && (part.end - part.start) / text.length >= 0.75) consider(item, alt, literalLength(template));
    }
  }
  return (best as { line: SpokenLine } | null)?.line ?? null;
}
