// "Say each sentence aloud once" in the night review: checked by the recognizer when there is one,
// otherwise the player taps "I said it".

import { useRef, useState } from 'react';
import { Check, Mic, Square } from 'lucide-react';
import { saidSentence } from '../shift.ts';
import { listener } from './listener.ts';
import { addSaidAloud } from './stats.ts';
import { Zh } from './words.tsx';

export function SayAloud({ text, onSaid }: { text: string; onSaid: () => void }) {
  const [state, setState] = useState<'idle' | 'listening' | 'done' | 'again'>('idle');
  const stopRef = useRef<(() => void) | null>(null);

  if (state === 'done') {
    return (
      <span className="said-ok">
        <Check size={16} /> <Zh text="说了" />
      </span>
    );
  }
  if (!listener.available) {
    return (
      <button
        type="button"
        className="btn small ghost"
        onClick={() => {
          addSaidAloud();
          setState('done');
          onSaid();
        }}
      >
        <Check size={16} /> <Zh text="我说了 I said it" />
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`btn small ghost ${state === 'listening' ? 'listening' : ''}`}
      onClick={async () => {
        if (state === 'listening') return stopRef.current?.();
        setState('listening');
        const { result, stop } = listener.listen();
        stopRef.current = stop;
        const heard = await result;
        if (saidSentence(text, heard.alternatives)) {
          setState('done');
          onSaid();
        } else setState('again');
      }}
    >
      {state === 'listening' ? <Square size={16} /> : <Mic size={16} />} <Zh text={state === 'again' ? '再说 Say it again' : '说 Say it'} />
    </button>
  );
}
