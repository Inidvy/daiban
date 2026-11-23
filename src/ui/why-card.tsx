// Why card: the reason or picture story behind a word or slot (docs/design.md, "Why cards").

import { useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { SLOT_INFO } from '../palette.ts';
import { Sheet } from './sheet.tsx';
import { speaker, TEACHER_VOICE } from './speech.ts';
import type { WhyTarget } from './words.tsx';

export function WhyCard({ target, remaining, onNext, onClose }: {
  target: WhyTarget;
  /** How many more new words are waiting after this one. */
  remaining: number;
  onNext: () => void;
  onClose: () => void;
}) {
  const card =
    target.kind === 'word'
      ? { hanzi: target.word.hanzi, pinyin: target.word.pinyin, en: target.word.en, why: target.word.why, say: target.word.hanzi }
      : {
          hanzi: target.slot,
          pinyin: SLOT_INFO[target.slot].pinyin,
          en: `slot: ${SLOT_INFO[target.slot].en}`,
          why: `${SLOT_INFO[target.slot].why} Example: ${SLOT_INFO[target.slot].example}`,
          say: target.slot,
        };

  useEffect(() => {
    void speaker.speak(card.say, TEACHER_VOICE);
    return () => speaker.cancel();
  }, [card.say]);

  return (
    <Sheet title={remaining > 0 ? `新词 New word · ${remaining} more` : '为什么 Why'} onClose={onClose}>
      <div className="why">
        <button type="button" className="why-hanzi" onClick={() => void speaker.speak(card.say, TEACHER_VOICE)}>
          {card.hanzi}
          <Volume2 size={22} aria-label="Play" />
        </button>
        <p className="why-pinyin">{card.pinyin}</p>
        <p className="why-en">{card.en}</p>
        {card.why && <p className="why-text">{card.why}</p>}
        <div className="row-end">
          {remaining > 0 ? (
            <>
              <button type="button" className="btn ghost" onClick={onClose}>
                Skip all
              </button>
              <button type="button" className="btn primary" onClick={onNext}>
                Next 下一个
              </button>
            </>
          ) : (
            <button type="button" className="btn primary" onClick={onClose}>
              好的 OK
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
