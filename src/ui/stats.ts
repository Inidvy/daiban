// Playtest measures (docs/design.md, M6 and "Success criteria"): session time vs. speaking time per day,
// and the 7-day recall check. Everything stays on the device until the player exports it.

import { load, save } from './storage.ts';

export interface DayStats {
  /** Time the app was visible and in use. */
  activeMs: number;
  /** Measured by the recognizer or the tone mirror. */
  speakingMs: number;
  /** Lines the player said aloud without a mic ("I said it"); counted, not timed. */
  saidAloud: number;
}

export interface RecallAnswer {
  patternId: string;
  ok: boolean;
  heard: string;
  ms: number;
}

export interface RecallRun {
  at: string;
  /** Days since the player first met Day 1 patterns. */
  daysSinceFirst: number | null;
  answers: RecallAnswer[];
}

const today = () => new Date().toISOString().slice(0, 10);

function update(fn: (d: DayStats) => void) {
  const all = load<Record<string, DayStats>>('stats', {});
  const d = (all[today()] ??= { activeMs: 0, speakingMs: 0, saidAloud: 0 });
  fn(d);
  save('stats', all);
}

export const addActive = (ms: number) => update((d) => (d.activeMs += ms));
export const addSpeaking = (ms: number) => ms > 0 && update((d) => (d.speakingMs += Math.round(ms)));
export const addSaidAloud = () => update((d) => d.saidAloud++);
export const allStats = () => load<Record<string, DayStats>>('stats', {});

/** Date the player first played Day 1, for the 7-day recall check. */
export function firstPlayed(): string | null {
  return load<string | null>('firstPlayed', null);
}
export function markFirstPlayed() {
  if (!firstPlayed()) save('firstPlayed', new Date().toISOString());
}

export const recallRuns = () => load<RecallRun[]>('recall', []);
export function saveRecallRun(run: RecallRun) {
  save('recall', [...recallRuns(), run]);
}

/** Everything a playtest needs, as one JSON object. */
export function exportData(extra: Record<string, unknown>) {
  return {
    app: 'daiban',
    exportedAt: new Date().toISOString(),
    firstPlayed: firstPlayed(),
    stats: allStats(),
    recall: recallRuns(),
    ...extra,
  };
}
