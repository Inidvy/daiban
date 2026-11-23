// Pinyin helpers for typed input and the tone mirror. Pure, so Node tests can use them.

import { toPinyin } from './content.ts';
import { parseTemplate } from './matcher.ts';
import type { Word } from './types.ts';

/** wǒ yào → woyao: tone marks, tone numbers, spaces and punctuation removed; ü becomes v. */
export function toneless(pinyin: string): string {
  return pinyin
    .toLowerCase()
    .normalize('NFD')
    .replace(/u\u0308|u:/g, 'v')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

/** True when the text is typed pinyin (latin letters), not hanzi. */
export function looksLikePinyin(text: string): boolean {
  return /[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/.test(text) && !/[\u4e00-\u9fff]/.test(text);
}

/**
 * A regex for a template typed in toneless pinyin; slots accept any syllables.
 * `fill` replaces a slot with a concrete text first (e.g. the expected price).
 */
export function templatePinyinRegex(template: string, words: readonly Word[], fill: Partial<Record<string, string>> = {}): RegExp {
  const parts = parseTemplate(template).map((seg) => {
    if (seg.kind === 'text') return toneless(toPinyin(seg.text, words));
    const filled = fill[seg.slot];
    return filled ? toneless(toPinyin(filled, words)) : '[a-z]+?';
  });
  return new RegExp(`^${parts.join('')}$`);
}

export function matchesPinyin(input: string, template: string, words: readonly Word[], fill: Partial<Record<string, string>> = {}): boolean {
  return templatePinyinRegex(template, words, fill).test(toneless(input));
}
