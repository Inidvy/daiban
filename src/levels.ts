// Levels: each day's lunch is split into short levels (1-1, 1-2, …) that get harder. A level adds at most
// a couple of new sentences, brings more customers with bigger orders and faster, more varied speech, and
// ends the day with a busy peak. Clearing a level (one star) opens the next one.

import { openPatterns } from './content.ts';
import type { Content, Day, LevelSpec } from './types.ts';

export interface Level extends LevelSpec {
  /** "1-2": day and position. */
  id: string;
  day: number;
  /** 0-based position in its day. */
  index: number;
}

export function levelsOf(day: Day): Level[] {
  return day.levels.map((l, index) => ({ ...l, id: `${day.day}-${index + 1}`, day: day.day, index }));
}

/** Every level of the game, in play order. */
export function allLevels(content: Content): Level[] {
  return [...content.days].sort((a, b) => a.day - b.day).flatMap(levelsOf);
}

export function findLevel(content: Content, id: string): Level | undefined {
  return allLevels(content).find((l) => l.id === id);
}

/** Patterns open by the end of `level`: what earlier days opened at this place, plus this day's levels so far. */
export function allowedPatterns(content: Content, level: Level): string[] {
  const day = content.days.find((d) => d.day === level.day)!;
  const earlier = openPatterns(content, day).filter((id) => !day.newPatterns.includes(id));
  return [...earlier, ...day.levels.slice(0, level.index + 1).flatMap((l) => l.newPatterns)];
}

/** The day as this level plays it: only its open patterns, its order sizes and its heat. */
export function levelDay(content: Content, level: Level): Day {
  const day = content.days.find((d) => d.day === level.day)!;
  return { ...day, maxQty: level.maxQty, allowed: allowedPatterns(content, level), heat: level.heat };
}

/** Level 1-1 is open; every later level opens once the one before it has a star. */
export function isLevelOpen(content: Content, id: string, stars: Readonly<Record<string, number>>): boolean {
  const order = allLevels(content);
  const i = order.findIndex((l) => l.id === id);
  return i === 0 || (i > 0 && (stars[order[i - 1].id] ?? 0) >= 1);
}

/** The level after `id`, if any. */
export function nextLevel(content: Content, id: string): Level | undefined {
  const order = allLevels(content);
  return order[order.findIndex((l) => l.id === id) + 1];
}

/** Stars saved per day before levels existed count for every level of that day. */
export function migrateDayStars(content: Content, dayStars: Readonly<Record<number, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const level of allLevels(content)) {
    const n = dayStars[level.day];
    if (n) out[level.id] = n;
  }
  return out;
}
