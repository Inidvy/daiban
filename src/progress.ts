// Hidden pattern strength (docs/design.md, "Memory"): one FSRS card per sentence pattern, scheduled by
// ts-fsrs (https://github.com/open-spaced-repetition/ts-fsrs, MIT). Play events become ratings; there are no flashcards.

import { DefaultScheduler, Rating } from 'ts-fsrs';
import type { CustomerResult } from './simulation.ts';
import type { Content } from './types.ts';

export type Grade = 1 | 2 | 3 | 4;
export const GRADE = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const satisfies Record<string, Grade>;

/** A ts-fsrs card as stored in JSON: its dates come back as strings. */
export interface StoredCard {
  stability: number;
  difficulty: number;
  state: number;
  dueAt: string | Date;
  lastReviewAt: string | Date | null;
  reps: number;
  lapses: number;
  [key: string]: unknown;
}
export type Cards = Record<string, StoredCard>;

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler>>;
let scheduler: Promise<Scheduler> | null = null;
// see ts-fsrs README: DefaultScheduler(options) → scheduler.newCard / scheduler.review
const getScheduler = () => (scheduler ??= Promise.resolve(DefaultScheduler({ enableFuzz: false })));

function revive(card: StoredCard) {
  return { ...card, dueAt: new Date(card.dueAt), lastReviewAt: card.lastReviewAt ? new Date(card.lastReviewAt) : null };
}

/** Rates each pattern once and returns the updated cards (the input is not changed). */
export async function rate(cards: Cards, grades: ReadonlyMap<string, Grade>, now: Date): Promise<Cards> {
  const s = await getScheduler();
  const out: Cards = { ...cards };
  for (const [id, grade] of grades) {
    const card = cards[id] ? revive(cards[id]) : await s.newCard({ now });
    // ts-fsrs's card type depends on its middleware; the stored shape above is the part we read back.
    const r = await s.review({ card: card as never, grade, now });
    out[id] = r.card as unknown as StoredCard;
  }
  return out;
}

export type Strength = 'new' | 'shaky' | 'known';

/** Known = reviewed at least twice, holding for at least 5 days and not due yet. */
export function strengthOf(card: StoredCard | undefined, now: Date): Strength {
  if (!card || card.reps === 0) return 'new';
  return card.reps >= 2 && card.stability >= 5 && new Date(card.dueAt) > now ? 'known' : 'shaky';
}

/** Patterns due for a repair job, most overdue first. */
export function dueIds(cards: Cards, now: Date): string[] {
  return Object.entries(cards)
    .filter(([, c]) => c.reps > 0 && new Date(c.dueAt) <= now)
    .sort(([, a], [, b]) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .map(([id]) => id);
}

/**
 * Ratings from one lunch rush, one per customer pattern: Good when every customer who used it was served well,
 * Hard when the bot (the player's script) misunderstood it at least once.
 */
export function rushGrades(results: readonly CustomerResult[]): Map<string, Grade> {
  const grades = new Map<string, Grade>();
  for (const r of results) {
    const missed = new Set(r.failures.flatMap((f) => f.utterance?.patternIds ?? []));
    for (const step of r.steps) {
      for (const id of step.utterance.patternIds) {
        const g: Grade = missed.has(id) ? GRADE.hard : GRADE.good;
        grades.set(id, Math.min(grades.get(id) ?? GRADE.good, g) as Grade);
      }
    }
  }
  return grades;
}

/** Rating for one 代班 answer or repair job. */
export function speakingGrade(o: { misses: number; hints: number; gaveUp: boolean }): Grade {
  if (o.gaveUp) return GRADE.again;
  if (o.hints > 0) return GRADE.hard;
  return o.misses === 0 ? GRADE.easy : GRADE.good;
}

/** Visible progress: "You can handle 9 of 21 sentences". */
export function progressSummary(content: Content, day: number, cards: Cards, now: Date) {
  const patterns = content.patterns.filter((p) => p.day <= day);
  const counts = { new: 0, shaky: 0, known: 0 };
  for (const p of patterns) counts[strengthOf(cards[p.id], now)]++;
  return { total: patterns.length, handled: counts.shaky + counts.known, ...counts };
}

/** The third star needs the 代班 shift passed on that day. */
export function starsWithShift(rushStars: number, shiftPassed: boolean): number {
  return shiftPassed ? rushStars : Math.min(rushStars, 2);
}

/** Day 1 is open; every later day opens once the day before has at least one star. */
export function isUnlocked(day: number, bestStars: Readonly<Record<number, number>>): boolean {
  return day === 1 || (bestStars[day - 1] ?? 0) >= 1;
}
