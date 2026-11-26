// Pattern matcher with typed slots. "Matching is by pattern, not exact text" (docs/design.md):
// spaces and punctuation are ignored, and a pattern may appear anywhere in what the customer said.

import type { SlotType, Word } from './types.ts';
import { SLOT_TYPES } from './types.ts';
import { NUMERAL_CHARS, parseChineseNumber } from './numbers.ts';

export type Segment = { kind: 'text'; text: string } | { kind: 'slot'; slot: SlotType };

export interface Binding {
  text: string;
  /** Numeric value for 数量 and 价钱. */
  value?: number;
}
export type Bindings = Partial<Record<SlotType, Binding>>;

export interface Match {
  start: number;
  end: number;
  bindings: Bindings;
}

/** Words that can fill each slot, longest first so 牛肉面 wins over a shorter word. */
export type Lexicon = Record<SlotType, string[]>;

const PUNCTUATION = /[\s，,。.？?！!、：:；;"“”'‘’…~～]/g;

export function normalize(text: string): string {
  return text.replace(PUNCTUATION, '');
}

export function buildLexicon(words: readonly Word[]): Lexicon {
  const lexicon: Lexicon = { 数量: [], 量词: [], 东西: [], 价钱: [], 地方: [] };
  for (const w of words) if (w.slot) lexicon[w.slot].push(w.hanzi);
  for (const slot of SLOT_TYPES) lexicon[slot].sort((a, b) => b.length - a.length);
  return lexicon;
}

export function isSlotType(name: string): name is SlotType {
  return (SLOT_TYPES as readonly string[]).includes(name);
}

export function parseTemplate(template: string): Segment[] {
  const segments: Segment[] = [];
  const slotRe = /\[([^\]]*)\]/g;
  let last = 0;
  const pushText = (raw: string) => {
    const text = normalize(raw);
    if (text) segments.push({ kind: 'text', text });
  };
  for (let m = slotRe.exec(template); m; m = slotRe.exec(template)) {
    pushText(template.slice(last, m.index));
    const name = m[1].trim();
    if (!isSlotType(name)) throw new Error(`unknown slot [${name}] (known: ${SLOT_TYPES.join(', ')})`);
    segments.push({ kind: 'slot', slot: name });
    last = slotRe.lastIndex;
  }
  pushText(template.slice(last));
  if (segments.length === 0) throw new Error('empty pattern');
  return segments;
}

interface Candidate {
  length: number;
  binding: Binding;
}

function slotCandidates(slot: SlotType, text: string, pos: number, lexicon: Lexicon): Candidate[] {
  if (slot === '数量' || slot === '价钱') {
    let run = 0;
    while (pos + run < text.length && NUMERAL_CHARS.includes(text[pos + run])) run++;
    const out: Candidate[] = [];
    for (let len = run; len >= 1; len--) {
      const numeral = text.slice(pos, pos + len);
      const value = parseChineseNumber(numeral);
      if (value === null) continue;
      if (slot === '数量') {
        out.push({ length: len, binding: { text: numeral, value } });
      } else {
        const unit = text[pos + len];
        if (unit === '块' || unit === '元') out.push({ length: len + 1, binding: { text: numeral + unit, value } });
      }
    }
    return out;
  }
  return lexicon[slot]
    .filter((w) => text.startsWith(w, pos))
    .map((w) => ({ length: w.length, binding: { text: w } }));
}

// Backtracking: if a slot's first choice makes the rest fail, try its next candidate.
function matchFrom(
  segments: Segment[],
  i: number,
  text: string,
  pos: number,
  lexicon: Lexicon,
  bindings: Bindings,
  mustReachEnd: boolean,
): { end: number; bindings: Bindings } | null {
  if (i === segments.length) {
    return mustReachEnd && pos !== text.length ? null : { end: pos, bindings };
  }
  const seg = segments[i];
  if (seg.kind === 'text') {
    return text.startsWith(seg.text, pos)
      ? matchFrom(segments, i + 1, text, pos + seg.text.length, lexicon, bindings, mustReachEnd)
      : null;
  }
  for (const c of slotCandidates(seg.slot, text, pos, lexicon)) {
    const r = matchFrom(segments, i + 1, text, pos + c.length, lexicon, { ...bindings, [seg.slot]: c.binding }, mustReachEnd);
    if (r) return r;
  }
  return null;
}

/**
 * Finds the leftmost place where the pattern occurs in the utterance and fills its slots.
 * With `whole`, the pattern must cover the entire utterance.
 */
export function findMatch(
  pattern: string | Segment[],
  utterance: string,
  lexicon: Lexicon,
  options: { whole?: boolean } = {},
): Match | null {
  const segments = typeof pattern === 'string' ? parseTemplate(pattern) : pattern;
  const text = normalize(utterance);
  const lastStart = options.whole ? 0 : text.length;
  for (let start = 0; start <= lastStart; start++) {
    const r = matchFrom(segments, 0, text, start, lexicon, {}, options.whole === true);
    if (r) return { start, end: r.end, bindings: r.bindings };
  }
  return null;
}
