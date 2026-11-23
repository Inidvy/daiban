// Audio in. Behind an interface like speech.ts, so the browser recognizer can be swapped later.
// Uses the Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
// (Chrome and Edge send audio to their speech service; other browsers may not have it, so typing is always offered.)

import { addSpeaking } from './stats.ts';

export interface Heard {
  /** Best guess first; several alternatives help the matcher. */
  alternatives: string[];
  /** Time the learner was actually speaking, measured by the recognizer. */
  speakingMs: number;
  error?: string;
}

export interface Listener {
  readonly available: boolean;
  /** Listens for one utterance. `stop` ends it early. */
  listen(): { result: Promise<Heard>; stop: () => void };
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
}

export function createBrowserListener(): Listener {
  const Rec = recognitionClass();
  return {
    available: Rec !== null,
    listen() {
      if (!Rec) return { result: Promise.resolve({ alternatives: [], speakingMs: 0, error: 'unsupported' }), stop: () => {} };
      const rec = new Rec();
      rec.lang = 'zh-CN';
      rec.interimResults = false;
      rec.maxAlternatives = 5;
      rec.continuous = false;
      const opened = performance.now();
      let speechStart = 0;
      let speakingMs = 0;
      let alternatives: string[] = [];
      let error: string | undefined;
      const result = new Promise<Heard>((resolve) => {
        rec.onspeechstart = () => (speechStart = performance.now());
        rec.onspeechend = () => {
          if (speechStart) speakingMs += performance.now() - speechStart;
          speechStart = 0;
        };
        rec.onresult = (e) => {
          const first = e.results[0];
          alternatives = Array.from({ length: first.length }, (_, i) => first[i].transcript);
        };
        rec.onerror = (e) => (error = e.error);
        rec.onend = () => {
          if (speechStart) speakingMs += performance.now() - speechStart;
          // Some recognizers never fire speech events: fall back to the time the mic was open.
          if (!speakingMs && alternatives.length) speakingMs = performance.now() - opened;
          addSpeaking(speakingMs);
          resolve({ alternatives, speakingMs, error });
        };
      });
      try {
        rec.start();
      } catch {
        return { result: Promise.resolve({ alternatives: [], speakingMs: 0, error: 'start-failed' }), stop: () => {} };
      }
      return { result, stop: () => rec.stop() };
    },
  };
}

export const listener = createBrowserListener();
