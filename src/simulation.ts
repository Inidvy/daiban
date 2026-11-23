// Text-only lunch rush: generates customers from the day's patterns, runs the bot script against
// each one and judges the result. Every failure is described so it can show up in the night review.

import { inStock, newBotState, runTurn } from './interpreter.ts';
import type { BotState, Kitchen } from './interpreter.ts';
import { kitchenFor, toPinyin } from './content.ts';
import { normalize } from './matcher.ts';
import { priceWord, quantityWord } from './numbers.ts';
import { chance, createRng, pick } from './rng.ts';
import type { Rng } from './rng.ts';
import { countRules } from './script.ts';
import type { Script } from './script.ts';
import type { Content, CustomerType, Day, Pattern, PayMethod, SlotType, Spice } from './types.ts';

export interface Utterance {
  text: string;
  pinyin: string;
  en: string;
  patternIds: string[];
  /** Small talk: no failure if the bot doesn't react. */
  optional: boolean;
}

export interface Want {
  dish: string;
  qty: number;
  spice: Spice;
}

export interface Customer {
  id: number;
  type: CustomerType;
  want: Want;
  /** The dish they first ask about or order. Differs from want.dish when it's sold out. */
  firstChoice: string;
  /** null = no preference stated; they answer if the bot asks "在这儿吃还是打包". */
  takeaway: boolean | null;
  takeawayAnswer: { takeaway: boolean; utterance: Utterance } | null;
  asksPrice: boolean;
  pay: PayMethod | null;
  changedMind: boolean;
  queue: Utterance[];
  /** Said only after the bot says 没有了 (their first choice is sold out). */
  afterSoldOut: Utterance[] | null;
}

export interface Turn {
  who: '客人' | '机器人';
  text: string;
}

export interface Failure {
  reason: string;
  utterance?: Utterance;
}

export interface CustomerResult {
  customer: Customer;
  transcript: Turn[];
  state: BotState;
  failures: Failure[];
}

export interface ReviewItem {
  text: string;
  pinyin: string;
  en: string;
  count: number;
}

export interface DayResult {
  day: Day;
  results: CustomerResult[];
  satisfaction: number;
  rules: number;
  stars: number;
  review: ReviewItem[];
}

// ---------- generating customers ----------

interface Part {
  text: string;
  en: string;
  patternId?: string;
}

class CustomerFactory {
  private patterns: Map<string, Pattern>;
  private content: Content;
  private day: Day;
  private kitchen: Kitchen;
  private rng: Rng;

  constructor(content: Content, day: Day, kitchen: Kitchen, rng: Rng) {
    this.content = content;
    this.day = day;
    this.kitchen = kitchen;
    this.rng = rng;
    this.patterns = new Map(content.patterns.map((p) => [p.id, p]));
  }

  private say(parts: Part[], optional = false): Utterance {
    const text = parts.map((p) => p.text).join('，');
    return {
      text,
      pinyin: toPinyin(text, this.content.words),
      en: parts.map((p) => p.en).join(', '),
      patternIds: parts.flatMap((p) => (p.patternId ? [p.patternId] : [])),
      optional,
    };
  }

  private part(id: string, text: string, slots: Partial<Record<SlotType, string>> = {}): Part {
    const p = this.patterns.get(id);
    if (!p) throw new Error(`unknown pattern ${id}`);
    const en = p.en.replace(/\[([^\]]*)\]/g, (_, s: SlotType) => slots[s] ?? s);
    return { text, en, patternId: id };
  }

  private word(hanzi: string): Part {
    const w = this.content.words.find((x) => x.hanzi === hanzi);
    return { text: hanzi, en: w?.en ?? hanzi };
  }

  private order(id: 'p_order' | 'p_bring' | 'p_change', qty: number, dish: string): Part {
    const d = this.kitchen.dishes.get(dish)!;
    const lead = { p_order: '我要', p_bring: '来', p_change: '算了，我要' }[id];
    const measure = this.content.words.find((w) => w.hanzi === d.measure);
    return this.part(id, `${lead}${quantityWord(qty)}${d.measure}${dish}`, {
      数量: String(qty),
      量词: measure?.en ?? '',
      东西: d.en,
    });
  }

  create(id: number): Customer {
    const { rng, day, kitchen } = this;
    const type = pick(rng, day.customerTypes.map((t) => this.content.customerTypes.find((c) => c.id === t)!));
    const d = type.dials;
    const available = day.menu.filter((dish) => inStock(kitchen, dish));

    const soldOutFirst = day.soldOut.length > 0 && chance(rng, 0.35);
    const firstChoice = soldOutFirst ? pick(rng, day.soldOut) : pick(rng, available);
    const dish = soldOutFirst ? pick(rng, available) : firstChoice;
    const qty = 1 + Math.floor(rng() * day.maxQty);

    let spice: Spice = '辣';
    if (day.day >= 3 && kitchen.dishes.get(dish)?.spicy) {
      const r = rng();
      spice = r < 0.3 ? '不辣' : r < 0.5 ? '微辣' : '辣';
    }
    let takeaway: boolean | null = null;
    if (day.day >= 3) {
      const r = rng();
      takeaway = r < 0.3 ? true : r < 0.6 ? false : null;
    }
    const asksStock = day.day >= 2 && chance(rng, soldOutFirst ? 0.5 : 0.3);
    const asksPrice = chance(rng, 0.5);
    const pay: PayMethod | null = day.day >= 4 ? (chance(rng, 0.5) ? '扫码' : '现金') : null;
    const changedMind = day.day >= 5 && available.length > 1 && chance(rng, d.mindChange * 0.5);
    const again = day.day >= 5 && chance(rng, 0.3);
    const thanks = chance(rng, 0.5);
    const verb = day.day >= 2 && chance(rng, d.variation) ? 'p_bring' : 'p_order';

    const polite = (options: string[]): Part[] => (chance(rng, d.politeness) ? [this.word(pick(rng, options))] : []);

    const orderParts = polite(['老板', '麻烦你']);
    if (changedMind) {
      const other = pick(rng, available.filter((x) => x !== dish));
      orderParts.push(this.order(verb, 1 + Math.floor(rng() * day.maxQty), other), this.order('p_change', qty, dish));
    } else {
      orderParts.push(this.order(verb, qty, dish));
    }

    const preferences: Part[] = [];
    if (spice === '不辣') preferences.push(this.part('p_no_spice', '不要辣'));
    if (spice === '微辣') preferences.push(this.part('p_mild', '微辣'));
    if (takeaway === true) preferences.push(this.part('p_takeaway', '打包'));
    if (takeaway === false) preferences.push(this.part('p_eat_here', '在这儿吃'));

    const extras: Utterance[] = [];
    if (preferences.length && chance(rng, 0.5)) orderParts.push(...preferences);
    else for (const p of preferences) extras.push(this.say([p]));
    if (again) extras.push(this.say([this.part('p_again', '再来一个')]));
    if (asksPrice) {
      extras.push(this.say([...polite(['请问']), this.part('p_price_q', chance(rng, d.variation) ? '一共多少钱' : '多少钱')]));
    }
    if (pay) {
      const id = pay === '扫码' ? 'p_scan' : 'p_cash';
      const options = pay === '扫码' ? ['扫码', '我扫码吧', '可以扫码吗'] : ['现金', '给你现金', '现金可以吗'];
      extras.push(this.say([this.part(id, pick(rng, options))]));
    }
    if (thanks) extras.push(this.say([this.part('p_thanks', '谢谢')], true));

    const askStock = (dishName: string) =>
      this.say([
        ...polite(['请问']),
        this.part('p_have_q', chance(rng, d.variation) ? `还有${dishName}吗` : `有${dishName}吗`, {
          东西: kitchen.dishes.get(dishName)!.en,
        }),
      ]);

    const order = this.say(orderParts);
    let queue: Utterance[];
    let afterSoldOut: Utterance[] | null = null;
    if (soldOutFirst) {
      queue = [asksStock ? askStock(firstChoice) : this.say([...polite(['老板']), this.order(verb, qty, firstChoice)])];
      afterSoldOut = [order, ...extras];
    } else {
      queue = [...(asksStock ? [askStock(firstChoice)] : []), order, ...extras];
    }

    let takeawayAnswer: Customer['takeawayAnswer'] = null;
    if (takeaway === null && day.day >= 3) {
      const answer = chance(rng, 0.5);
      takeawayAnswer = {
        takeaway: answer,
        utterance: this.say([answer ? this.part('p_takeaway', '打包') : this.part('p_eat_here', '在这儿吃')]),
      };
    }

    return {
      id,
      type,
      want: { dish, qty: again ? qty + 1 : qty, spice }, // 再来一个 = one more
      firstChoice,
      takeaway,
      takeawayAnswer,
      asksPrice,
      pay,
      changedMind,
      queue,
      afterSoldOut,
    };
  }
}

// ---------- serving and judging ----------

const MAX_TURNS = 12;

function describe(kitchen: Kitchen, item: { dish: string; qty: number; spice: Spice }): string {
  const d = kitchen.dishes.get(item.dish);
  const spice = d?.spicy && item.spice !== '辣' ? `（${item.spice}）` : '';
  return `${quantityWord(item.qty)}${d?.measure ?? '个'}${item.dish}${spice}`;
}

function allUtterances(c: Customer): Utterance[] {
  return [...c.queue, ...(c.afterSoldOut ?? []), ...(c.takeawayAnswer ? [c.takeawayAnswer.utterance] : [])];
}

function findUtterance(c: Customer, patternId: string): Utterance | undefined {
  return allUtterances(c).find((u) => u.patternIds.includes(patternId));
}

export function serveCustomer(script: Script, customer: Customer, kitchen: Kitchen): CustomerResult {
  const state = newBotState();
  const transcript: Turn[] = [];
  const ignored: Utterance[] = [];
  const queue = [...customer.queue];
  let held = customer.afterSoldOut;
  let takeaway = customer.takeaway;
  let saidSoldOut = false;

  for (let turn = 0; queue.length > 0 && turn < MAX_TURNS; turn++) {
    const u = queue.shift()!;
    transcript.push({ who: '客人', text: u.text });
    const r = runTurn(script, u.text, kitchen, state);
    for (const s of r.said) transcript.push({ who: '机器人', text: s });
    if (!r.heard && !u.optional) ignored.push(u);

    const said = r.said.map(normalize).join(' ');
    if (said.includes('没有')) {
      saidSoldOut = true;
      if (held) {
        queue.unshift(...held);
        held = null;
      }
    }
    if (takeaway === null && customer.takeawayAnswer && said.includes('在这儿吃')) {
      takeaway = customer.takeawayAnswer.takeaway;
      queue.unshift(customer.takeawayAnswer.utterance);
    }
  }

  const failures = judge(customer, state, kitchen, { ignored, saidSoldOut, stuck: held !== null, takeaway });
  return { customer, transcript, state, failures };
}

function judge(
  c: Customer,
  state: BotState,
  kitchen: Kitchen,
  seen: { ignored: Utterance[]; saidSoldOut: boolean; stuck: boolean; takeaway: boolean | null },
): Failure[] {
  const failures: Failure[] = [];
  const fail = (reason: string, utterance?: Utterance) => failures.push({ reason, utterance });
  const orderUtterance = c.afterSoldOut ? c.afterSoldOut[0] : c.queue.find((u) => u.patternIds.some((id) => id === 'p_order' || id === 'p_bring' || id === 'p_change'));
  const want = describe(kitchen, c.want);

  for (const u of seen.ignored) fail(`said “${u.text}” and the bot just stared (没反应)`, u);
  for (const msg of state.confused) fail(`the bot got confused: ${msg}`);

  if (seen.stuck) {
    fail(`wanted ${c.firstChoice}, which is sold out, but never heard 没有了 and left confused`, c.queue[0]);
  } else if (seen.saidSoldOut && inStock(kitchen, c.firstChoice)) {
    fail(`was told 没有了, but ${c.firstChoice} was in stock`, c.queue[0]);
  }
  for (const item of state.made) {
    if (item.soldOut) fail(`got ${describe(kitchen, item)}, but ${item.dish} is sold out: the kitchen had none`, c.queue[0]);
  }
  if (seen.stuck) return failures;

  // The order itself.
  const made = new Map<string, { dish: string; qty: number; spice: Spice }>();
  for (const item of state.made) {
    if (item.soldOut) continue;
    const spice = kitchen.dishes.get(item.dish)?.spicy ? item.spice : '辣';
    const key = `${item.dish}|${spice}`;
    const prev = made.get(key);
    made.set(key, { dish: item.dish, qty: (prev?.qty ?? 0) + item.qty, spice });
  }
  const items = [...made.values()];
  const got = items.map((it) => describe(kitchen, it)).join(' + ');
  const qtyOfWanted = items.filter((it) => it.dish === c.want.dish).reduce((s, it) => s + it.qty, 0);

  if (items.length === 0) {
    fail(`waited for ${want} and left hungry`, orderUtterance);
  } else if (items.some((it) => it.dish !== c.want.dish)) {
    fail(
      c.changedMind
        ? `said 算了 and changed to ${want}, but got ${got}`
        : `ordered ${want} but got ${got}`,
      c.changedMind ? findUtterance(c, 'p_change') : orderUtterance,
    );
  } else if (qtyOfWanted !== c.want.qty) {
    const againU = findUtterance(c, 'p_again');
    fail(
      qtyOfWanted > c.want.qty
        ? `ordered ${want} and got ${got}: the table is buried in food`
        : `ordered ${want} but got only ${got} and is still hungry`,
      againU ?? orderUtterance,
    );
  } else if (kitchen.dishes.get(c.want.dish)?.spicy && items.some((it) => it.spice !== c.want.spice)) {
    const gotSpice = items.find((it) => it.spice !== c.want.spice)?.spice ?? '辣';
    const reason =
      c.want.spice === '不辣'
        ? `said 不要辣, got it ${gotSpice} and is fanning their mouth`
        : c.want.spice === '微辣'
          ? `asked for 微辣, got it ${gotSpice}`
          : `wanted it spicy like normal, got it ${gotSpice}`;
    fail(reason, findUtterance(c, c.want.spice === '不辣' ? 'p_no_spice' : 'p_mild') ?? orderUtterance);
  }

  if (seen.takeaway === true && !state.packed) {
    fail('wanted 打包, got a bowl to eat here', findUtterance(c, 'p_takeaway'));
  } else if (seen.takeaway === false && state.packed) {
    fail('wanted to eat here (在这儿吃), got it packed in a bag', findUtterance(c, 'p_eat_here'));
  }

  if (c.asksPrice) {
    const expected = priceWord((kitchen.dishes.get(c.want.dish)?.price ?? 0) * c.want.qty);
    if (!state.said.some((s) => normalize(s).includes(expected))) {
      fail(`asked 多少钱 but didn't hear the right price (${expected})`, findUtterance(c, 'p_price_q'));
    }
  }

  if (c.pay) {
    const u = findUtterance(c, c.pay === '扫码' ? 'p_scan' : 'p_cash');
    if (state.paid === null) fail(`wanted to pay by ${c.pay}, but nobody took the money`, u);
    else if (state.paid !== 'any' && state.paid !== c.pay) fail(`wanted to pay by ${c.pay}, but the bot charged ${state.paid}`, u);
  }
  return failures;
}

// ---------- a whole day ----------

export function starsFor(day: Day, satisfaction: number, rules: number): number {
  const [one, two, three] = day.starThresholds;
  if (satisfaction >= three && rules <= day.targetRules) return 3;
  if (satisfaction >= two) return 2;
  if (satisfaction >= one) return 1;
  return 0;
}

export function runDay(options: { content: Content; day: Day; script: Script; customers?: number; seed?: number }): DayResult {
  const { content, day, script } = options;
  const kitchen = kitchenFor(content, day);
  const factory = new CustomerFactory(content, day, kitchen, createRng(options.seed ?? 1));
  const results: CustomerResult[] = [];
  for (let i = 1; i <= (options.customers ?? 20); i++) {
    results.push(serveCustomer(script, factory.create(i), kitchen));
  }

  const happy = results.filter((r) => r.failures.length === 0).length;
  const satisfaction = results.length ? happy / results.length : 0;
  const rules = countRules(script.body);

  const review = new Map<string, ReviewItem>();
  for (const r of results) {
    for (const f of r.failures) {
      if (!f.utterance) continue;
      const item = review.get(f.utterance.text) ?? { text: f.utterance.text, pinyin: f.utterance.pinyin, en: f.utterance.en, count: 0 };
      item.count++;
      review.set(item.text, item);
    }
  }

  return { day, results, satisfaction, rules, stars: starsFor(day, satisfaction, rules), review: [...review.values()] };
}
