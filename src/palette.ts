// Which blocks the player can place on a given day, and how a block reads as a sentence.

import type { Block, BlockTemplate } from './editor.ts';
import { printAction, printCondition } from './print.ts';
import type { Content, SlotType } from './types.ts';

export type PaletteGroup = '听' | '查' | '做' | '说';

export interface PaletteItem {
  key: string;
  group: PaletteGroup;
  template: BlockTemplate;
  /** English gloss for the whole block. */
  en: string;
  /** First day the block is available. */
  day: number;
}

export const GROUP_LABELS: Record<PaletteGroup, { hanzi: string; en: string }> = {
  听: { hanzi: '听到', en: 'When the customer says…' },
  查: { hanzi: '查', en: 'Check the kitchen' },
  做: { hanzi: '做', en: 'Do' },
  说: { hanzi: '说', en: 'Say' },
};

/** Slots explained on their why card, with an example used when a line is read aloud. */
export const SLOT_INFO: Record<SlotType, { pinyin: string; en: string; example: string; why: string }> = {
  数量: { pinyin: 'shùliàng', en: 'amount', example: '两', why: '数 count + 量 amount. Any number goes here: 一, 两, 十五…' },
  量词: { pinyin: 'liàngcí', en: 'measure word', example: '碗', why: '量 measure + 词 word. Chinese needs one between a number and a thing: 两碗面.' },
  东西: { pinyin: 'dōngxi', en: 'thing', example: '牛肉面', why: '东 east + 西 west: "everything from east to west" = things. Any dish goes here.' },
  价钱: { pinyin: 'jiàqián', en: 'price', example: '三十六块', why: '价 value + 钱 money. The bot fills in the total of everything it made.' },
  地方: { pinyin: 'dìfang', en: 'place', example: '机场', why: '地 ground + 方 side, direction: a spot on the ground. Any destination goes here.' },
};

/** Blocks open on `day`. With `allowed` (one level's patterns, see src/levels.ts), 听到 and 说 blocks are limited to those. */
export function paletteFor(content: Content, day: number, allowed?: readonly string[]): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const p of content.patterns) {
    if (p.speaker !== 'customer') continue;
    items.push({ key: `hear:${p.id}`, group: '听', template: { kind: 'if', cond: { kind: '听到', template: p.template } }, en: `If you hear: ${p.en}`, day: p.day });
  }
  items.push(
    { key: 'check:有', group: '查', template: { kind: 'if', cond: { kind: '有', item: '[东西]' } }, en: 'If we have the dish', day: 2 },
    { key: 'check:没有', group: '查', template: { kind: 'if', cond: { kind: '没有', item: '[东西]' } }, en: "If we don't have the dish", day: 2 },
  );
  const doItems: [string, BlockTemplate, string, number][] = [
    ['做:order', { kind: 'do', action: { kind: '做', what: '[数量][量词][东西]', again: false } }, 'Make what they ordered', 1],
    ['给:order', { kind: 'do', action: { kind: '做', what: '[数量][量词][东西]', again: false, verb: '给' } }, 'Give them what they asked for', 6],
    ['上菜', { kind: 'do', action: { kind: '上菜' } }, 'Serve the food', 1],
    ['做:不辣', { kind: 'do', action: { kind: '做', what: '不辣的', again: false } }, 'Make it not spicy', 3],
    ['做:微辣', { kind: 'do', action: { kind: '做', what: '微辣的', again: false } }, 'Make it mildly spicy', 3],
    ['打包', { kind: 'do', action: { kind: '打包' } }, 'Pack it to take away', 3],
    ['收钱:扫码', { kind: 'do', action: { kind: '收钱', method: '扫码' } }, 'Take payment by QR code', 4],
    ['收钱:现金', { kind: 'do', action: { kind: '收钱', method: '现金' } }, 'Take payment in cash', 4],
    ['再做', { kind: 'do', action: { kind: '做', what: '一个', again: true } }, 'Make one more of the last dish', 5],
  ];
  for (const [key, template, en, d] of doItems) items.push({ key, group: '做', template, en, day: d });
  for (const p of content.patterns) {
    if (p.speaker !== 'bot') continue;
    items.push({ key: `say:${p.id}`, group: '说', template: { kind: 'do', action: { kind: '说', text: p.template } }, en: `Say: ${p.en}`, day: p.day });
  }
  // Noodle-shop actions need the noodle sentences they answer; 给 is for the other shops.
  const NEEDS: Record<string, string> = { '做:order': 'p_enjoy', 上菜: 'p_enjoy', '做:不辣': 'p_no_spice', '做:微辣': 'p_mild', 打包: 'p_takeaway', 再做: 'p_again' };
  const open = (it: PaletteItem) => {
    if (!allowed) return true;
    if (/^(hear|say):/.test(it.key)) return allowed.includes(it.key.slice(it.key.indexOf(':') + 1));
    if (it.key === '给:order') return !allowed.includes('p_enjoy');
    return !NEEDS[it.key] || allowed.includes(NEEDS[it.key]);
  };
  return items.filter((it) => it.day <= day && open(it));
}

/** 不然 unlocks on Day 3 (design doc, MVP days). */
export const ELSE_DAY = 3;

/** The block as one line of script, e.g. 如果 听到 "我要 [数量][量词][东西]". */
export function blockText(b: Block | BlockTemplate): string {
  return b.kind === 'if' ? `如果 ${printCondition(b.cond)}` : printAction(b.action);
}

/** The line as a sentence to read aloud, with slots filled by examples: 如果听到：我要两碗牛肉面. */
export function spokenText(b: Block | BlockTemplate): string {
  const fill = (s: string) =>
    s.replace(/\[([^\]]*)\]/g, (_, slot: SlotType) => SLOT_INFO[slot]?.example ?? slot).replace(/\s+/g, '');
  if (b.kind === 'if') {
    const c = b.cond;
    return c.kind === '听到' || c.kind === '没听到' ? `如果${c.kind}：${fill(c.template)}` : `如果${c.kind}${fill(c.item)}`;
  }
  const a = b.action;
  switch (a.kind) {
    case '说':
      return `说：${fill(a.text)}`;
    case '做':
      return `${a.again ? '再' : ''}${a.verb ?? '做'}${fill(a.what)}`;
    case '收钱':
      return `收钱${a.method ?? ''}`;
    default:
      return a.kind;
  }
}
