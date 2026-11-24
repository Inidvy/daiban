// The guided first lesson for players who know almost no Chinese. Problem first: a customer speaks, the
// robot doesn't understand, the player teaches it one rule at a time and learns each sentence by teaching it.
// Pure data and checks; the coach card in src/ui/coach.tsx shows it.

import type { Action } from './script.ts';
import type { Block } from './editor.ts';
import { normalize } from './matcher.ts';

/** A line to hear, broken into words with their meanings. */
export interface LessonLine {
  text: string;
  en: string;
}

interface StepBase {
  id: string;
  title: string;
  body: string;
  /** Lines to hear, each shown word by word with pinyin and English. */
  lines?: LessonLine[];
  /** Single words to show as tiles (e.g. the numbers 1–5). */
  tiles?: string[];
}

export type LessonStep =
  | (StepBase & { kind: 'read' })
  /** Place blocks: the palette only offers `paletteKeys` until `done` is true. */
  | (StepBase & { kind: 'place'; paletteKeys: string[]; done: (blocks: Block[]) => boolean })
  /** Open the shop for a short lunch rush. */
  | (StepBase & { kind: 'run'; customers: number });

const same = (a: string, b: string) => normalize(a) === normalize(b);

/** The top-level rule that listens for `template`, if the player has placed one. */
export function ruleFor(blocks: readonly Block[], template: string): Extract<Block, { kind: 'if' }> | undefined {
  for (const b of blocks) {
    if (b.kind === 'if' && b.cond.kind === '听到' && same(b.cond.template, template)) return b;
  }
  return undefined;
}

/** True when the rule for `template` contains an action matching `test` (at any depth in its 就 branch). */
export function ruleDoes(blocks: readonly Block[], template: string, test: (a: Action) => boolean): boolean {
  const walk = (list: readonly Block[]): boolean =>
    list.some((b) => (b.kind === 'do' ? test(b.action) : walk(b.then)));
  const rule = ruleFor(blocks, template);
  return !!rule && walk(rule.then);
}

const ORDER = '我要 [数量][量词][东西]';

export const FIRST_LESSON: LessonStep[] = [
  {
    kind: 'read',
    id: 'welcome',
    title: 'Welcome to your noodle shop',
    body: "You run a small noodle shop in China, but you don't speak Chinese yet. That's fine. You'll teach a robot waiter, one sentence at a time, and you learn each sentence by teaching it. Pinyin (the sound spelling) is above every word. Tap any word to see what it means.",
  },
  {
    kind: 'read',
    id: 'first-customer',
    title: 'A customer walks in',
    body: 'Listen to what they say. Every word is spelled out below with its meaning. The robot just stands there: it has no rules yet.',
    lines: [{ text: '我要一碗牛肉面。', en: 'I want one bowl of beef noodles.' }],
  },
  {
    kind: 'read',
    id: 'numbers',
    title: 'Counting bowls',
    body: 'Customers order 1 to 5 bowls today. Tap a number to hear it. One catch: before 碗 (bowl), 2 is 两 liǎng, not 二.',
    tiles: ['一', '二', '两', '三', '四', '五', '碗'],
    lines: [{ text: '我要两碗牛肉面。', en: 'I want two bowls of beef noodles.' }],
  },
  {
    kind: 'place',
    id: 'rule-order',
    title: 'Rule 1: when someone orders',
    body: 'Tap “如果… add a rule” below and pick the 如果 听到 “我要 …” block. 如果 = if, 听到 = hear. The dotted boxes are slots: any amount, measure word and dish fit there, so one rule covers every order.',
    paletteKeys: ['hear:p_order'],
    done: (blocks) => !!ruleFor(blocks, ORDER),
  },
  {
    kind: 'place',
    id: 'make',
    title: 'Make what they ordered',
    body: 'Inside the rule, tap “就… then” and pick 做 [数量][量词][东西]. 就 = then, 做 = make. The robot copies the slots from what it heard: 两碗牛肉面 in, 两碗牛肉面 out.',
    paletteKeys: ['做:order'],
    done: (blocks) => ruleDoes(blocks, ORDER, (a) => a.kind === '做'),
  },
  {
    kind: 'place',
    id: 'serve',
    title: 'Serve it',
    body: 'Add one more line inside the same rule: 上菜 (shàngcài) = serve the food.',
    paletteKeys: ['上菜'],
    done: (blocks) => ruleDoes(blocks, ORDER, (a) => a.kind === '上菜'),
  },
  {
    kind: 'run',
    id: 'try',
    title: 'Open the shop',
    body: 'Press 开门 Run lunch. Three customers will come. Watch what happens. Something will go wrong, and that is the point.',
    customers: 3,
  },
  {
    kind: 'place',
    id: 'price',
    title: 'Rule 2: “how much?”',
    body: 'Customers asked 多少钱 (duōshao qián) = how much (money)? The robot froze. Add a rule: 如果 听到 “多少钱”, and inside it 说 [价钱]. 说 = say, 价钱 = price. The robot adds up the bill for you.',
    lines: [{ text: '多少钱？', en: 'How much is it?' }],
    paletteKeys: ['hear:p_price_q', 'say:p_price'],
    done: (blocks) => ruleDoes(blocks, '多少钱', (a) => a.kind === '说' && same(a.text, '[价钱]')),
  },
  {
    kind: 'place',
    id: 'thanks',
    title: 'Rule 3: “thank you”',
    body: 'When a customer says 谢谢 (xièxie) = thank you, the polite answer is 不客气 (búkèqi) = you’re welcome. Add 如果 听到 “谢谢” and inside it 说 “不客气”.',
    lines: [
      { text: '谢谢！', en: 'Thank you!' },
      { text: '不客气。', en: "You're welcome." },
    ],
    paletteKeys: ['hear:p_thanks', 'say:p_welcome'],
    done: (blocks) => ruleDoes(blocks, '谢谢', (a) => a.kind === '说' && same(a.text, '不客气')),
  },
  {
    kind: 'run',
    id: 'full',
    title: 'A full lunch',
    body: 'Three rules, three sentences. Press 开门 Run lunch again: eight customers this time.',
    customers: 8,
  },
  {
    kind: 'read',
    id: 'done',
    title: 'You did it',
    body: 'Your robot understands three customer sentences, and so do you. Next is the 傍晚 代班 tab: a special customer the robot can’t handle, so you answer them yourself by speaking (or typing pinyin). Hints are there if you get stuck. Then 晚上 Review shows every sentence on one board.',
  },
];
