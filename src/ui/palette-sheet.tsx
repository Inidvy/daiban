// Block palette: everything the player can place today, grouped. Tapping an item places it.

import { Volume2 } from 'lucide-react';
import type { PaletteGroup, PaletteItem } from '../palette.ts';
import { GROUP_LABELS, spokenText } from '../palette.ts';
import { Sheet } from './sheet.tsx';
import { speaker, TEACHER_VOICE } from './speech.ts';
import { BlockLine } from './words.tsx';

const ORDER: PaletteGroup[] = ['听', '查', '做', '说'];

export function PaletteSheet({ items, day, onPick, onClose }: {
  items: PaletteItem[];
  day: number;
  onPick: (item: PaletteItem) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="放一块 Place a block" onClose={onClose}>
      {ORDER.map((group) => {
        const inGroup = items.filter((i) => i.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} className="palette-group">
            <h3>
              {GROUP_LABELS[group].hanzi} <small>{GROUP_LABELS[group].en}</small>
            </h3>
            {inGroup.map((item) => (
              <div key={item.key} className="palette-item" onClick={() => onPick(item)} role="button" tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(item)}>
                <div className="palette-main">
                  <BlockLine block={item.template} />
                  <span className="gloss">
                    {item.day === day && day > 1 && <span className="badge">新 new</span>}
                    {item.en}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Read aloud"
                  onClick={(e) => {
                    e.stopPropagation();
                    void speaker.speak(spokenText(item.template), TEACHER_VOICE);
                  }}
                >
                  <Volume2 size={18} />
                </button>
              </div>
            ))}
          </section>
        );
      })}
    </Sheet>
  );
}
