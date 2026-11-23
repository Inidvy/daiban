// Tone mirror helpers (docs/design.md, "Tone mirror"): a target pitch contour from pinyin tone marks,
// and the learner's pitch track mapped onto the same 1–5 scale (Chao tone letters).

export type Tone = 1 | 2 | 3 | 4 | 5;

const VOWELS = 'aeiouüvāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
const MARKS: Record<string, Tone> = {};
for (const [tone, chars] of [[1, 'āēīōūǖ'], [2, 'áéíóúǘ'], [3, 'ǎěǐǒǔǚ'], [4, 'àèìòùǜ']] as const) {
  for (const ch of chars) MARKS[ch] = tone;
}
const isVowel = (ch: string | undefined) => !!ch && VOWELS.includes(ch);

/**
 * Splits pinyin into syllables: niúròumiàn → niú ròu miàn. A new syllable starts at an initial consonant
 * (zh/ch/sh count as one) that is followed by a vowel, so fàng|guǎn and gěi|nín split right.
 * Spaces, apostrophes and punctuation also split.
 */
export function splitSyllables(pinyin: string): string[] {
  const out: string[] = [];
  const parts = pinyin.toLowerCase().split(/[^a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+/u).filter(Boolean);
  for (const word of parts) {
    let start = 0;
    for (let i = 1; i < word.length; i++) {
      const two = word.slice(i, i + 2);
      const initialLen = two === 'zh' || two === 'ch' || two === 'sh' ? 2 : 'bpmfdtnlgkhjqxrzcsyw'.includes(word[i]) ? 1 : 0;
      const insideZhChSh = word[i] === 'h' && 'zcs'.includes(word[i - 1]);
      if (initialLen && !insideZhChSh && isVowel(word[i + initialLen]) && i > start) {
        out.push(word.slice(start, i));
        start = i;
        i += initialLen - 1;
      }
    }
    out.push(word.slice(start));
  }
  return out;
}

export function toneOf(syllable: string): Tone {
  for (const ch of syllable) if (MARKS[ch]) return MARKS[ch];
  return 5;
}

/** Chao tone letters: 1 = low, 5 = high. */
const CONTOURS: Record<Tone, number[]> = { 1: [5, 5], 2: [3, 5], 3: [2, 1, 4], 4: [5, 1], 5: [3, 3] };

export interface TargetSyllable {
  syllable: string;
  tone: Tone;
  /** Pitch points (1–5) spread evenly over the syllable. */
  points: number[];
}

/** The native contour for a sentence, with 3rd-tone sandhi (3+3 → 2+3) and half-thirds before other tones. */
export function targetContour(pinyin: string): TargetSyllable[] {
  const syllables = splitSyllables(pinyin.replace(/\[[^\]]*\]/g, ' '));
  const tones = syllables.map(toneOf);
  return syllables.map((syllable, i) => {
    const sandhi = tones[i] === 3 && tones[i + 1] === 3;
    const last = i === syllables.length - 1;
    const points = sandhi ? CONTOURS[2] : tones[i] === 3 && !last ? [2, 1, 1] : CONTOURS[tones[i]];
    return { syllable, tone: tones[i], points };
  });
}

/**
 * The learner's pitch track (Hz per frame, null when unvoiced) on the 1–5 scale, relative to their own median,
 * so a deep and a high voice draw the same shape. About 3 semitones per step. Leading and trailing silence is cut.
 */
export function learnerContour(hz: readonly (number | null)[]): (number | null)[] {
  const first = hz.findIndex((h) => h !== null);
  if (first < 0) return [];
  let last = hz.length - 1;
  while (hz[last] === null) last--;
  const track = hz.slice(first, last + 1);
  const voiced = track.filter((h): h is number => h !== null).sort((a, b) => a - b);
  const median = voiced[Math.floor(voiced.length / 2)];
  return track.map((h) => (h === null ? null : Math.min(5, Math.max(1, 3 + (12 * Math.log2(h / median)) / 3))));
}
