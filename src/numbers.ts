// Chinese numerals up to 9999, in both directions.

const DIGITS: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const DIGIT_CHARS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export const NUMERAL_CHARS = '零一二两三四五六七八九十百千';

/** Parses 一, 两, 十五, 一百零五, 两千三百 … Returns null for anything that is not a well-formed numeral. */
export function parseChineseNumber(s: string): number | null {
  if (s.length === 0) return null;
  if (s === '零') return 0;
  let total = 0;
  let current = 0;
  let prevWasDigit = false;
  let lastUnit = Infinity;
  for (const ch of s) {
    if (ch === '零') {
      prevWasDigit = false;
      continue;
    }
    const digit = DIGITS[ch];
    if (digit !== undefined) {
      if (prevWasDigit) return null; // 一二 is not a number
      current = digit;
      prevWasDigit = true;
      continue;
    }
    const unit = UNITS[ch];
    if (unit === undefined || unit >= lastUnit) return null;
    total += (prevWasDigit ? current : 1) * unit; // 十五: a bare 十 means 10
    current = 0;
    prevWasDigit = false;
    lastUnit = unit;
  }
  return total + (prevWasDigit ? current : 0);
}

/** 36 → 三十六, 105 → 一百零五, 10 → 十. */
export function toChineseNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) throw new RangeError(`out of range: ${n}`);
  if (n === 0) return '零';
  const units: [number, string][] = [[1000, '千'], [100, '百'], [10, '十']];
  let out = '';
  let rest = n;
  let started = false;
  let needZero = false;
  for (const [value, unit] of units) {
    const q = Math.floor(rest / value);
    rest %= value;
    if (q > 0) {
      if (needZero) out += '零';
      // 十五, not 一十五 (only when 十 is the leading unit)
      out += value === 10 && q === 1 && !started ? '' : DIGIT_CHARS[q];
      out += unit;
      started = true;
      needZero = false;
    } else if (started) {
      needZero = true;
    }
  }
  if (rest > 0) {
    if (needZero) out += '零';
    out += DIGIT_CHARS[rest];
  }
  return out;
}

/** Number before a measure word: 2 → 两 (两碗, not 二碗). */
export function quantityWord(n: number): string {
  return n === 2 ? '两' : toChineseNumber(n);
}

/** Spoken price: 36 → 三十六块, 2 → 两块. */
export function priceWord(n: number): string {
  return `${quantityWord(n)}块`;
}

/** Speech recognizers often write numbers as digits ("我要2碗", "90块"): turn them back into Chinese numerals. */
export function digitsToChinese(text: string): string {
  return text.replace(/\d+/g, (d) => toChineseNumber(Number(d)));
}
