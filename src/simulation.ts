// Text-only lunch rush: generates customers from the day's patterns, runs the bot script against
// each one and judges the result. Every failure is described so it can show up in the night review.

import { inStock, newBotState, runTurn } from './interpreter.ts';
import type { BotState, Kitchen, MadeItem } from './interpreter.ts';
import { kitchenFor, openPatterns, toPinyin } from './content.ts';
import { findMatch, normalize } from './matcher.ts';
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
  /** False for customers who only talk (a taxi passenger orders nothing). */
  orders: boolean;
  queue: Utterance[];
  /** Said only after the bot says 没有了 (their first choice is sold out). */
  afterSoldOut: Utterance[] | null;
}

export interface Turn {
  who: '客人' | '机器人';
  text: string;
}

/** What went wrong, so the scene can play the matching reaction. */
export type FailureKind =
  | 'ignored' | 'confused' | 'stuck' | 'false-sold-out' | 'made-sold-out' | 'nothing' | 'wrong-dish'
  | 'too-much' | 'too-little' | 'spice' | 'takeaway' | 'price' | 'pay' | 'no-answer';

export interface Failure {
  kind: FailureKind;
  reason: string;
  utterance?: Utterance;
}

/** One customer turn and what the counter looked like right after it. */
export interface Step {
  utterance: Utterance;
  said: string[];
  heard: boolean;
  made: MadeItem[];
  packed: boolean;
  paid: BotState['paid'];
}

export interface CustomerResult {
  customer: Customer;
  steps: Step[];
  transcript: Turn[];
  state: BotState;
  failures: Failure[];
}

export interface ReviewItem {
  text: string;
  pinyin: string;
  en: string;
  count: number;
  patternIds: string[];
  /** Why each customer who said this was unhappy, for the replay. */
  misses: { customerId: number; reason: string }[];
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
  private allowed: Set<string>;

  constructor(content: Content, day: Day, kitchen: Kitchen, rng: Rng) {
    this.content = content;
    this.day = day;
    this.kitchen = kitchen;
    this.rng = rng;
    this.patterns = new Map(content.patterns.map((p) => [p.id, p]));
    this.allowed = new Set(day.allowed ?? openPatterns(content, day));
  }

  /** Customers only say what the level has opened (src/levels.ts). */
  private has(...ids: string[]): boolean {
    return ids.every((id) => this.allowed.has(id));
  }

  /** Low heat = slow, plain customers; heat 1 = their full dials. */
  private heated(type: CustomerType): CustomerType {
    const k = 0.3 + 0.7 * (this.day.heat ?? 1);
    const d = type.dials;
    return { ...type, dials: { ...d, variation: d.variation * k, politeness: d.politeness * k, speed: d.speed * k } };
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
    return { text: hanzi, en: (w?.en ?? hanzi).replace(/\s*\(.*?\)/g, '') }; // "boss (how you call…)" → "boss"
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

  /** A question or remark that needs an answer (pattern.reply), with any [东西]/[地方] slot filled. */
  private exchange(id: string, politeness: number): Utterance {
    const p = this.patterns.get(id)!;
    const fills: Partial<Record<SlotType, string>> = {};
    const text = p.template.replace(/\[([^\]]*)\]/g, (_, slot: SlotType) => {
      const options = slot === '东西' ? this.goods() : this.day.menu.filter((m) => this.content.words.find((w) => w.hanzi === m)?.slot === slot);
      const pickd = options.length ? pick(this.rng, options) : slot;
      fills[slot] = this.content.words.find((w) => w.hanzi === pickd)?.en ?? pickd;
      return pickd;
    });
    const polite = text.endsWith('？') && chance(this.rng, politeness * 0.5);
    return this.say([this.part(id, (polite ? '请问，' : '') + text.replace(/\s+/g, ''), fills)]);
  }

  /** Goods on the menu that are in stock (a taxi has none). */
  private goods(): string[] {
    return this.day.menu.filter((dish) => this.kitchen.dishes.has(dish) && inStock(this.kitchen, dish));
  }

  create(id: number): Customer {
    const { rng, day, kitchen } = this;
    const type = this.heated(pick(rng, day.customerTypes.map((t) => this.content.customerTypes.find((c) => c.id === t)!)));
    const d = type.dials;
    const available = this.goods();
    const orders = available.length > 0 && this.has('p_order');
    // Questions and remarks open here; this day's new ones come up more often.
    const exchanges = [...this.allowed].filter((p) => this.patterns.get(p)?.reply);
    const fresh = exchanges.filter((p) => day.newPatterns.includes(p));
    const chats: Utterance[] = [];
    const chatCount = exchanges.length === 0 ? 0 : orders ? (chance(rng, 0.6) ? 1 : 0) : 1 + (chance(rng, 0.5) ? 1 : 0);
    for (let i = 0; i < chatCount; i++) {
      const id = fresh.length && chance(rng, 0.6) ? pick(rng, fresh) : pick(rng, exchanges);
      if (!chats.some((u) => u.patternIds.includes(id))) chats.push(this.exchange(id, d.politeness));
    }

    const soldOutFirst = orders && day.soldOut.length > 0 && this.has('p_sold_out') && chance(rng, 0.35);
    const firstChoice = !orders ? '' : soldOutFirst ? pick(rng, day.soldOut) : pick(rng, available);
    const dish = !orders ? '' : soldOutFirst ? pick(rng, available) : firstChoice;
    const qty = 1 + Math.floor(rng() * day.maxQty);

    let spice: Spice = '辣';
    if (this.has('p_no_spice', 'p_mild') && kitchen.dishes.get(dish)?.spicy) {
      const r = rng();
      spice = r < 0.3 ? '不辣' : r < 0.5 ? '微辣' : '辣';
    }
    let takeaway: boolean | null = null;
    const canTakeaway = orders && this.has('p_takeaway', 'p_eat_here');
    // Customers wait to be asked "here or to go?" only once the shop can ask it.
    const canAsk = canTakeaway && this.has('p_here_or_go');
    if (canTakeaway) {
      const r = rng();
      takeaway = r < 0.3 ? true : r < 0.6 || !canAsk ? false : null;
    }
    const asksStock = orders && this.has('p_have_q') && chance(rng, soldOutFirst ? 0.5 : 0.3);
    const asksPrice = orders && this.has('p_price_q') && chance(rng, 0.5);
    const pay: PayMethod | null = this.has('p_scan', 'p_cash') ? (chance(rng, 0.5) ? '扫码' : '现金') : null;
    const changedMind = orders && this.has('p_change') && available.length > 1 && chance(rng, d.mindChange * 0.5);
    const again = orders && this.has('p_again') && chance(rng, 0.3);
    const thanks = this.has('p_thanks') && chance(rng, 0.5);
    const verb = this.has('p_bring') && chance(rng, Math.max(d.variation, 0.3)) ? 'p_bring' : 'p_order';

    const polite = (options: string[]): Part[] => (chance(rng, d.politeness) ? [this.word(pick(rng, options))] : []);

    const orderParts = polite(['老板', '麻烦你']);
    if (!orders) {
      // nothing to order: they only talk (and maybe pay and say thanks)
    } else if (changedMind) {
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

    // A chat comes before the order (a greeting, a question) or after it, at random.
    const before = chats.filter(() => chance(rng, 0.5));
    const after = chats.filter((u) => !before.includes(u));
    const order = orders ? [this.say(orderParts)] : [];
    let queue: Utterance[];
    let afterSoldOut: Utterance[] | null = null;
    if (soldOutFirst) {
      queue = [...before, asksStock ? askStock(firstChoice) : this.say([...polite(['老板']), this.order(verb, qty, firstChoice)])];
      afterSoldOut = [...order, ...after, ...extras];
    } else {
      queue = [...before, ...(asksStock ? [askStock(firstChoice)] : []), ...order, ...after, ...extras];
    }

    let takeawayAnswer: Customer['takeawayAnswer'] = null;
    if (takeaway === null && canAsk) {
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
      orders,
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

/**
 * Questions and remarks (pattern.reply) the bot heard but answered wrongly. One it didn't hear at all is
 * already an 'ignored' failure.
 */
function unanswered(steps: readonly Step[], kitchen: Kitchen, patterns: ReadonlyMap<string, Pattern>): Failure[] {
  const out: Failure[] = [];
  for (const step of steps) {
    if (!step.heard) continue;
    const said = normalize(step.said.join(''));
    for (const id of step.utterance.patternIds) {
      const p = patterns.get(id);
      if (!p?.reply) continue;
      // The answer may echo a slot: 我去机场 → 好的，去机场.
      const bindings = findMatch(p.template, step.utterance.text, kitchen.lexicon)?.bindings ?? {};
      const answers = p.reply.map((r) =>
        normalize((patterns.get(r)?.template ?? '').replace(/\[([^\]]*)\]/g, (_, slot: SlotType) => bindings[slot]?.text ?? '')),
      );
      if (!answers.some((a) => a && said.includes(a))) {
        const model = (patterns.get(p.reply[0])?.template ?? '').replace(/\[([^\]]*)\]/g, (_, slot: SlotType) => bindings[slot]?.text ?? slot);
        out.push({
          kind: 'no-answer',
          reason: said ? `said “${step.utterance.text}” and got “${step.said.join('')}” instead of “${model}”` : `said “${step.utterance.text}” and got no answer (try “${model}”)`,
          utterance: step.utterance,
        });
      }
    }
  }
  return out;
}

export function serveCustomer(script: Script, customer: Customer, kitchen: Kitchen, patterns: ReadonlyMap<string, Pattern> = new Map()): CustomerResult {
  const state = newBotState();
  const transcript: Turn[] = [];
  const steps: Step[] = [];
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
    steps.push({
      utterance: u,
      said: r.said,
      heard: r.heard,
      made: state.made.map((m) => ({ ...m })),
      packed: state.packed,
      paid: state.paid,
    });

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
  failures.push(...unanswered(steps, kitchen, patterns));
  return { customer, steps, transcript, state, failures };
}

function judge(
  c: Customer,
  state: BotState,
  kitchen: Kitchen,
  seen: { ignored: Utterance[]; saidSoldOut: boolean; stuck: boolean; takeaway: boolean | null },
): Failure[] {
  const failures: Failure[] = [];
  const fail = (kind: FailureKind, reason: string, utterance?: Utterance) => failures.push({ kind, reason, utterance });
  const orderUtterance = c.afterSoldOut ? c.afterSoldOut[0] : c.queue.find((u) => u.patternIds.some((id) => id === 'p_order' || id === 'p_bring' || id === 'p_change'));
  const want = describe(kitchen, c.want);

  for (const u of seen.ignored) fail('ignored', `said “${u.text}” and the bot just stared (没反应)`, u);
  for (const msg of state.confused) fail('confused', `the bot got confused: ${msg}`);

  if (seen.stuck) {
    fail('stuck', `wanted ${c.firstChoice}, which is sold out, but never heard 没有了 and left confused`, c.queue[0]);
  } else if (seen.saidSoldOut && inStock(kitchen, c.firstChoice)) {
    fail('false-sold-out', `was told 没有了, but ${c.firstChoice} was in stock`, c.queue[0]);
  }
  for (const item of state.made) {
    if (item.soldOut) fail('made-sold-out', `got ${describe(kitchen, item)}, but ${item.dish} is sold out: the kitchen had none`, c.queue[0]);
  }
  if (seen.stuck) return failures;
  if (!c.orders) {
    if (state.made.length) fail('too-much', `didn't order anything but got ${state.made.map((m) => describe(kitchen, m)).join(' + ')}`);
    return payFailures(c, state, failures);
  }

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
    fail('nothing', `waited for ${want} and left hungry`, orderUtterance);
  } else if (items.some((it) => it.dish !== c.want.dish)) {
    fail(
      'wrong-dish',
      c.changedMind
        ? `said 算了 and changed to ${want}, but got ${got}`
        : `ordered ${want} but got ${got}`,
      c.changedMind ? findUtterance(c, 'p_change') : orderUtterance,
    );
  } else if (qtyOfWanted !== c.want.qty) {
    const againU = findUtterance(c, 'p_again');
    fail(
      qtyOfWanted > c.want.qty ? 'too-much' : 'too-little',
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
    fail('spice', reason, findUtterance(c, c.want.spice === '不辣' ? 'p_no_spice' : 'p_mild') ?? orderUtterance);
  }

  if (seen.takeaway === true && !state.packed) {
    fail('takeaway', 'wanted 打包, got a bowl to eat here', findUtterance(c, 'p_takeaway'));
  } else if (seen.takeaway === false && state.packed) {
    fail('takeaway', 'wanted to eat here (在这儿吃), got it packed in a bag', findUtterance(c, 'p_eat_here'));
  }

  if (c.asksPrice) {
    const expected = priceWord((kitchen.dishes.get(c.want.dish)?.price ?? 0) * c.want.qty);
    if (!state.said.some((s) => normalize(s).includes(expected))) {
      fail('price', `asked 多少钱 but didn't hear the right price (${expected})`, findUtterance(c, 'p_price_q'));
    }
  }

  return payFailures(c, state, failures);
}

function payFailures(c: Customer, state: BotState, failures: Failure[]): Failure[] {
  if (c.pay) {
    const u = findUtterance(c, c.pay === '扫码' ? 'p_scan' : 'p_cash');
    if (state.paid === null) failures.push({ kind: 'pay', reason: `wanted to pay by ${c.pay}, but nobody took the money`, utterance: u });
    else if (state.paid !== 'any' && state.paid !== c.pay) failures.push({ kind: 'pay', reason: `wanted to pay by ${c.pay}, but the bot charged ${state.paid}`, utterance: u });
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

/** The day's customers, decided before anyone is served (so a hot-fix can re-serve the rest). */
export function generateCustomers(content: Content, day: Day, count: number, seed: number): Customer[] {
  const factory = new CustomerFactory(content, day, kitchenFor(content, day), createRng(seed));
  return Array.from({ length: count }, (_, i) => factory.create(i + 1));
}

export function serveAll(content: Content, day: Day, script: Script, customers: readonly Customer[]): CustomerResult[] {
  const kitchen = kitchenFor(content, day);
  const patterns = new Map(content.patterns.map((p) => [p.id, p]));
  return customers.map((c) => serveCustomer(script, c, kitchen, patterns));
}

export function summarize(day: Day, script: Script, results: CustomerResult[]): DayResult {
  const happy = results.filter((r) => r.failures.length === 0).length;
  const satisfaction = results.length ? happy / results.length : 0;
  const rules = countRules(script.body);

  const review = new Map<string, ReviewItem>();
  for (const r of results) {
    for (const f of r.failures) {
      if (!f.utterance) continue;
      const u = f.utterance;
      const item = review.get(u.text) ?? { text: u.text, pinyin: u.pinyin, en: u.en, count: 0, patternIds: u.patternIds, misses: [] };
      item.count++;
      item.misses.push({ customerId: r.customer.id, reason: f.reason });
      review.set(item.text, item);
    }
  }

  return { day, results, satisfaction, rules, stars: starsFor(day, satisfaction, rules), review: [...review.values()] };
}

export function runDay(options: { content: Content; day: Day; script: Script; customers?: number; seed?: number }): DayResult {
  const { content, day, script } = options;
  const customers = generateCustomers(content, day, options.customers ?? 20, options.seed ?? 1);
  return summarize(day, script, serveAll(content, day, script, customers));
}
