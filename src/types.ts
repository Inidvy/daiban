// Shapes of the JSON content files in content/ (see docs/design.md, "Data model").

export type SlotType = '数量' | '量词' | '东西' | '价钱' | '地方';
export const SLOT_TYPES: readonly SlotType[] = ['数量', '量词', '东西', '价钱', '地方'];

export type Spice = '辣' | '微辣' | '不辣';
export type PayMethod = '扫码' | '现金';

export interface Word {
  hanzi: string;
  pinyin: string;
  en: string;
  /** First day the word appears. */
  day: number;
  slot?: SlotType;
  /** Why card: a picture story or one-line reason. */
  why?: string;
  /** Dishes only (slot 东西). */
  price?: number;
  measure?: string;
  spicy?: boolean;
}

export interface Pattern {
  id: string;
  /** Text with slots, e.g. "我要 [数量][量词][东西]". Spaces and punctuation are ignored when matching. */
  template: string;
  pinyin: string;
  en: string;
  day: number;
  /** Situation group for the menu board, e.g. 点菜, 付钱. */
  group: string;
  speaker: 'customer' | 'bot';
  why?: string;
  /** Usable at every place from its day on (ordering, prices, paying, thanks). Others stay at the place that taught them. */
  general?: boolean;
  /**
   * Customer questions and remarks that need an answer: the bot patterns that count as one. Customers
   * say these on their own, not as part of an order (e.g. 你叫什么名字？ → 我叫小代。).
   */
  reply?: string[];
}

/** A business in the city: each has its own script, goods and sentences. */
export interface Place {
  id: string;
  /** Shop sign, e.g. 面馆. */
  sign: string;
  name: string;
  /** Scene decoration. */
  emoji: string;
}

export interface Dials {
  /** Chance of using a synonym instead of the taught pattern (0–1). */
  variation: number;
  /** Chance of adding polite fillers like 老板 or 麻烦你 (0–1). */
  politeness: number;
  /** Chance of changing their mind mid-order, from Day 5 (0–1). */
  mindChange: number;
  /** Speaking speed: 0 = slow and clear, 1 = natural speed. */
  speed: number;
}

export interface CustomerType {
  id: string;
  name: string;
  en: string;
  personality: string;
  firstDay: number;
  dials: Dials;
  /** Text-to-speech pitch (0.5–1.5), so each personality sounds different. */
  pitch: number;
}

export interface Day {
  day: number;
  /** Place id (content/places.json). */
  place: string;
  title: string;
  twist: string;
  newPatterns: string[];
  menu: string[];
  soldOut: string[];
  maxQty: number;
  customerTypes: string[];
  /** Satisfaction needed for 1, 2 and 3 stars. */
  starThresholds: [number, number, number];
  /** Rule count at or below which the third star is possible. */
  targetRules: number;
  /** Path relative to content/. */
  sampleScript: string;
  /** The evening 代班 shift: an unusual customer the player serves by speaking. */
  vip: { name: string; situation: string; turns: ShiftTurn[] };
  /** The day's lunch, split into levels that get harder; together they introduce all of newPatterns. */
  levels: LevelSpec[];
  /**
   * Patterns customers may use and the palette may offer. Set for one level (see src/levels.ts);
   * when missing, every pattern up to this day.
   */
  allowed?: string[];
  /** 0 = slow, plain customers; 1 = their full difficulty dials. Set for one level. */
  heat?: number;
}

export interface LevelSpec {
  title: string;
  /** Patterns this level adds (customer lines and the answers that go with them). */
  newPatterns: string[];
  customers: number;
  maxQty: number;
  heat: number;
}

export interface Content {
  words: Word[];
  patterns: Pattern[];
  customerTypes: CustomerType[];
  days: Day[];
  places: Place[];
}

/** One exchange in the 代班 shift: the customer speaks, the player answers with one of the expected patterns. */
export interface ShiftTurn {
  says: string;
  en: string;
  /** Bot pattern ids that count as a right answer. */
  expect: string[];
  /** The right total, when the answer contains [价钱]. */
  price?: number;
  /** A model answer for the last hint. */
  model: string;
  modelEn: string;
}
