// Placing a block by voice (docs/design.md, "Input modes"): after a block has been tapped a few times,
// the player says the line aloud (or types its pinyin) to place it.

import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { getDay, kitchenFor } from '../content.ts';
import type { PaletteItem } from '../palette.ts';
import { spokenText } from '../palette.ts';
import { matchSpokenLine } from '../voice.ts';
import { content } from './content.ts';
import { Sheet } from './sheet.tsx';
import { SpeakInput } from './speak-input.tsx';
import { speaker, TEACHER_VOICE } from './speech.ts';
import { BlockLine } from './words.tsx';

const lexicon = kitchenFor(content, getDay(content, content.days.length)).lexicon;

export function SpeakLineSheet({ item, onPlaced, onSkip, onClose }: {
  item: PaletteItem;
  onPlaced: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [wrong, setWrong] = useState<string | null>(null);
  return (
    <Sheet title="说出来 Say it to place it" onClose={onClose}>
      <p className="hint">You've placed this block a few times. Now say the line aloud (or type its pinyin) to place it.</p>
      <div className="palette-item static">
        <div className="palette-main">
          <BlockLine block={item.template} />
          <span className="gloss">{item.en}</span>
        </div>
        <button type="button" className="icon-btn" aria-label="Read aloud" onClick={() => void speaker.speak(spokenText(item.template), TEACHER_VOICE)}>
          <Volume2 size={18} />
        </button>
      </div>
      <SpeakInput
        onAnswer={(alts) => {
          if (matchSpokenLine(alts, [item], lexicon, content.words)) onPlaced();
          else setWrong(alts[0]);
        }}
      />
      {wrong !== null && <p className="hint warn-text">Heard “{wrong}”. Say the whole line, e.g. “{spokenText(item.template)}”.</p>}
      <div className="row-end">
        <button type="button" className="btn small ghost" onClick={onSkip}>
          Place without speaking
        </button>
      </div>
    </Sheet>
  );
}

/** "Say any line": the palette's mic, which finds the block the player said. */
export function SayAnyLine({ items, onPlaced }: { items: PaletteItem[]; onPlaced: (item: PaletteItem) => void }) {
  const [wrong, setWrong] = useState<string | null>(null);
  return (
    <div className="say-any">
      <p className="hint">Say (or type) one of the blocks below, and it is placed for you.</p>
      <SpeakInput
        label="说一行 Say a line"
        onAnswer={(alts) => {
          const hit = matchSpokenLine(alts, items, lexicon, content.words);
          if (hit) onPlaced(hit.item);
          else setWrong(alts[0]);
        }}
      />
      {wrong !== null && (
        <p className="hint warn-text">
          No block below says “{wrong}”. Say a whole block, e.g. “{items[0] ? spokenText(items[0].template) : '如果听到多少钱'}”.
        </p>
      )}
    </div>
  );
}
