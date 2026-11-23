// One way to answer by voice, everywhere: a mic button, and a text box for 汉字 or pinyin when there is
// no mic or the recognizer isn't available.

import { useEffect, useRef, useState } from 'react';
import { Mic, Send, Square } from 'lucide-react';
import { listener } from './listener.ts';

export function SpeakInput({ onAnswer, disabled, label = '说 Speak' }: {
  onAnswer: (alternatives: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const listen = async () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setNote(null);
    setListening(true);
    const { result, stop } = listener.listen();
    stopRef.current = stop;
    const heard = await result;
    stopRef.current = null;
    setListening(false);
    if (heard.alternatives.length) onAnswer(heard.alternatives);
    else if (heard.error === 'not-allowed') setNote('Microphone blocked. Allow it in the browser, or type below.');
    else if (heard.error && heard.error !== 'no-speech' && heard.error !== 'aborted') setNote(`Speech recognition isn't working here (${heard.error}). Type instead.`);
    else setNote('Nothing heard. Try again, a bit louder.');
  };

  const submit = () => {
    const t = typed.trim();
    if (!t) return;
    setTyped('');
    onAnswer([t]);
  };

  return (
    <div className="speak-input">
      {listener.available && (
        <button type="button" className={`btn mic ${listening ? 'listening' : ''}`} onClick={listen} disabled={disabled} aria-pressed={listening}>
          {listening ? <Square size={20} /> : <Mic size={20} />} {listening ? '听着… Listening' : label}
        </button>
      )}
      <form
        className="type-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={listener.available ? 'or type 汉字 / pinyin' : 'Type 汉字 or pinyin'}
          disabled={disabled}
          lang="zh-CN"
          autoComplete="off"
          aria-label="Type your answer in hanzi or pinyin"
        />
        <button type="submit" className="icon-btn" disabled={disabled || !typed.trim()} aria-label="Send">
          <Send size={18} />
        </button>
      </form>
      {note && <p className="hint warn-text">{note}</p>}
    </div>
  );
}
