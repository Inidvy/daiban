// Rule interpreter: runs a script once per customer utterance ("客人说 → 听").
// Rules run top to bottom; a 如果 whose 听到 pattern matches fills slots for its body.

import { findMatch, normalize } from './matcher.ts';
import type { Bindings, Lexicon } from './matcher.ts';
import { priceWord } from './numbers.ts';
import type { Action, Condition, Script, Stmt } from './script.ts';
import type { PayMethod, Spice, Word } from './types.ts';

export interface MadeItem {
  dish: string;
  qty: number;
  spice: Spice;
  /** The bot cooked a dish the kitchen had run out of. */
  soldOut: boolean;
}

export interface BotState {
  made: MadeItem[];
  said: string[];
  packed: boolean;
  served: boolean;
  paid: PayMethod | 'any' | null;
  /** Things the bot couldn't do, e.g. an empty slot. Each one is a visible failure. */
  confused: string[];
}

export interface Kitchen {
  lexicon: Lexicon;
  dishes: Map<string, Word>;
  menu: Set<string>;
  soldOut: Set<string>;
}

export interface TurnResult {
  /** Some 听到 pattern matched this utterance. If not, the customer was ignored. */
  heard: boolean;
  said: string[];
}

export function newBotState(): BotState {
  return { made: [], said: [], packed: false, served: false, paid: null, confused: [] };
}

export function inStock(kitchen: Kitchen, dish: string): boolean {
  return kitchen.menu.has(dish) && !kitchen.soldOut.has(dish);
}

export function orderTotal(items: readonly { dish: string; qty: number }[], kitchen: Kitchen): number {
  return items.reduce((sum, it) => sum + (kitchen.dishes.get(it.dish)?.price ?? 0) * it.qty, 0);
}

class Confused extends Error {}

function fill(text: string, bindings: Bindings, state: BotState, kitchen: Kitchen): string {
  return text.replace(/\[([^\]]*)\]/g, (_, raw: string) => {
    const slot = raw.trim() as keyof Bindings;
    const bound = bindings[slot];
    if (bound) return bound.text;
    if (slot === '价钱') {
      if (state.made.length === 0) throw new Confused('[价钱]: nothing has been given yet, so there is no total');
      return priceWord(orderTotal(state.made, kitchen));
    }
    throw new Confused(`[${slot}] is empty here: no 听到 pattern above filled it`);
  });
}

const SPICE_WORDS: Record<string, Spice> = { 不辣的: '不辣', 不辣: '不辣', 微辣的: '微辣', 微辣: '微辣', 辣的: '辣' };

function cook(what: string, again: boolean, state: BotState, kitchen: Kitchen): void {
  const last = state.made.at(-1);
  const spice = SPICE_WORDS[what];
  if (spice) {
    if (!last) throw new Confused(`做 ${what}: nothing has been made yet`);
    last.spice = spice;
    return;
  }
  if (again) {
    if (!last) throw new Confused(`再 做 ${what}: nothing to repeat yet`);
    const m = findMatch('[数量][量词]', what, kitchen.lexicon, { whole: true })
      ?? findMatch('[数量]', what, kitchen.lexicon, { whole: true });
    if (!m) throw new Confused(`再 做 ${what}: how many? e.g. 再 做 一个`);
    last.qty += m.bindings.数量?.value ?? 1;
    return;
  }
  const m = findMatch('[数量][量词][东西]', what, kitchen.lexicon, { whole: true })
    ?? findMatch('[东西]', what, kitchen.lexicon, { whole: true });
  const dish = m?.bindings.东西?.text;
  if (!m || !dish) throw new Confused(`can't make "${what}"`);
  state.made.push({ dish, qty: m.bindings.数量?.value ?? 1, spice: '辣', soldOut: !inStock(kitchen, dish) });
}

function perform(action: Action, bindings: Bindings, state: BotState, kitchen: Kitchen, said: string[]): void {
  switch (action.kind) {
    case '做':
      cook(normalize(fill(action.what, bindings, state, kitchen)), action.again, state, kitchen);
      break;
    case '说': {
      const text = fill(action.text, bindings, state, kitchen).replace(/\s+/g, ''); // Chinese has no spaces
      state.said.push(text);
      said.push(text);
      break;
    }
    case '收钱':
      state.paid = action.method ?? 'any';
      break;
    case '上菜':
      state.served = true;
      break;
    case '打包':
      state.packed = true;
      break;
  }
}

export function runTurn(script: Script, utterance: string, kitchen: Kitchen, state: BotState): TurnResult {
  let heard = false;
  const said: string[] = [];

  const test = (cond: Condition, bindings: Bindings): Bindings | null => {
    switch (cond.kind) {
      case '听到':
      case '没听到': {
        const m = findMatch(cond.template, utterance, kitchen.lexicon);
        if (cond.kind === '没听到') return m ? null : bindings;
        if (!m) return null;
        heard = true;
        return { ...bindings, ...m.bindings };
      }
      case '有':
      case '没有': {
        const dish = normalize(fill(cond.item, bindings, state, kitchen));
        return inStock(kitchen, dish) === (cond.kind === '有') ? bindings : null;
      }
    }
  };

  const exec = (stmts: readonly Stmt[], bindings: Bindings): void => {
    for (const stmt of stmts) {
      try {
        if (stmt.kind === 'do') {
          for (const a of stmt.actions) perform(a, bindings, state, kitchen, said);
          continue;
        }
        const inner = test(stmt.cond, bindings);
        if (inner) exec(stmt.then, inner);
        else if (stmt.else) exec(stmt.else, bindings);
      } catch (e) {
        if (!(e instanceof Confused)) throw e;
        state.confused.push(`第${stmt.line}行 (line ${stmt.line}): ${e.message}`);
      }
    }
  };

  exec(script.body, {});
  return { heard, said };
}
