// Audio out. Behind an interface so browser TTS can later be swapped for recorded native audio
// (docs/design.md, "Suggested stack"). Uses the Web Speech API:
// https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis

import { useEffect, useState } from 'react';

export interface Voice {
  /** 0.5 = slow and clear, 1 = normal. */
  rate?: number;
  pitch?: number;
}

export interface Speaker {
  readonly available: boolean;
  /** False when the device has no Chinese voice: then nothing is spoken and text should be shown. */
  hasChineseVoice(): boolean;
  /** Called when the list of voices changes (it loads asynchronously). Returns an unsubscribe function. */
  onVoicesChanged(cb: () => void): () => void;
  speak(text: string, voice?: Voice): Promise<void>;
  cancel(): void;
}

function pickChineseVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  const byLang = (re: RegExp) => voices.filter((v) => re.test(v.lang.replace('_', '-')));
  const mainland = byLang(/^zh-CN/i);
  // Prefer natural/online voices when the browser offers them.
  return mainland.find((v) => /natural|online|xiaoxiao|yunxi/i.test(v.name)) ?? mainland[0] ?? byLang(/^zh/i)[0] ?? null;
}

export function createBrowserSpeaker(): Speaker {
  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  let voice: SpeechSynthesisVoice | null = null;
  if (available) {
    voice = pickChineseVoice();
    speechSynthesis.addEventListener('voiceschanged', () => {
      voice = pickChineseVoice();
    });
  }
  return {
    available,
    hasChineseVoice: () => voice !== null,
    onVoicesChanged(cb) {
      if (!available) return () => {};
      speechSynthesis.addEventListener('voiceschanged', cb);
      return () => speechSynthesis.removeEventListener('voiceschanged', cb);
    },
    speak(text, opts = {}) {
      // An English voice reading hanzi is silent or garbled, so say nothing instead.
      if (!available || !voice) return Promise.resolve();
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        if (voice) u.voice = voice;
        u.rate = opts.rate ?? 0.9;
        u.pitch = opts.pitch ?? 1;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        speechSynthesis.speak(u);
      });
    },
    cancel() {
      if (available) speechSynthesis.cancel();
    },
  };
}

export const speaker = createBrowserSpeaker();

/** Re-renders when voices finish loading. */
export function useChineseVoice(): boolean {
  const [has, setHas] = useState(() => speaker.hasChineseVoice());
  useEffect(() => speaker.onVoicesChanged(() => setHas(speaker.hasChineseVoice())), []);
  return has;
}

/** Customer speed dial (0 slow … 1 natural) to a speech rate. */
export function rateForSpeed(speed: number): number {
  return 0.6 + 0.45 * speed;
}

export const BOT_VOICE: Voice = { rate: 0.95, pitch: 1 };
export const TEACHER_VOICE: Voice = { rate: 0.75, pitch: 1 };
