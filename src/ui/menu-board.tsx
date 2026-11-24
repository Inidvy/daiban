// Night review pieces (docs/design.md, "Memory" and "Menu board"): the whole menu of sentences at once with
// new/shaky/known marks, repair jobs for patterns that are due, and the speak-from-English prompt they share
// with the 7-day recall check.

import { useMemo, useState } from 'react';
import { Check, Volume2, Wrench, X } from 'lucide-react';
import { getDay, kitchenFor } from '../content.ts';
import { SLOT_INFO } from '../palette.ts';
import { progressSummary, strengthOf } from '../progress.ts';
import type { Cards, Strength } from '../progress.ts';
import { saysPattern } from '../shift.ts';
import type { Pattern, SlotType } from '../types.ts';
import { content } from './content.ts';
import { Sheet } from './sheet.tsx';
import { SpeakInput } from './speak-input.tsx';
import { speaker, TEACHER_VOICE } from './speech.ts';
import { Tokens, Zh } from './words.tsx';

const STRENGTH_LABEL: Record<Strength, string> = { new: '新 new', shaky: '还不稳 shaky', known: '会了 known' };
const lexicon = kitchenFor(content, getDay(content, content.days.length)).lexicon;

/** A pattern as a full example sentence: 我要 [数量][量词][东西] → 我要两碗牛肉面. */
export function example(p: Pattern): string {
  return p.template.replace(/\[([^\]]*)\]/g, (_, s: SlotType) => SLOT_INFO[s]?.example ?? s).replace(/\s+/g, '');
}

export function ProgressLine({ day, cards }: { day: number; cards: Cards }) {
  const s = progressSummary(content, day, cards, new Date());
  return (
    <p className="progress-line">
      <Zh text="能听懂" /> You can handle <b>{s.handled}</b> of {s.total} sentences · <b>{s.known}</b> known for good
    </p>
  );
}

export function MenuBoard({ day, cards, highlight }: { day: number; cards: Cards; highlight: ReadonlySet<string> }) {
  const now = new Date();
  const patterns = content.patterns.filter((p) => p.day <= day);
  const groups = [...new Set(patterns.map((p) => p.group))];
  return (
    <section className="menu-board">
      <h3 className="section-title"><Zh text="菜单 Menu board" /></h3>
      <ProgressLine day={day} cards={cards} />
      <div className="board-groups">
        {groups.map((g) => (
          <div key={g} className="board-group">
            <h4>{g}</h4>
            {patterns
              .filter((p) => p.group === g)
              .map((p) => {
                const st = strengthOf(cards[p.id], now);
                return (
                  <div key={p.id} className={`board-row ${highlight.has(p.id) ? 'missed' : ''}`}>
                    <button type="button" className="icon-btn" aria-label="Play" onClick={() => void speaker.speak(example(p), TEACHER_VOICE)}>
                      <Volume2 size={16} />
                    </button>
                    <span className="board-text">
                      <span className="board-hanzi">
                        <Tokens text={p.template.replace(/\s+/g, '')} />
                      </span>
                      <small className="muted">{p.en}</small>
                    </span>
                    <span className={`strength ${st}`}><Zh text={STRENGTH_LABEL[st]} /></span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      {highlight.size > 0 && <p className="hint">Highlighted: sentences the bot misunderstood today.</p>}
    </section>
  );
}

export interface PromptResult {
  ok: boolean;
  heard: string;
  ms: number;
  /** Listened to the answer before saying it. */
  helped: boolean;
}

/** English in, Chinese out: "say this in Chinese". Used by repair jobs and the recall check. */
export function SpeakPrompt({ pattern, allowHelp, onResult }: { pattern: Pattern; allowHelp: boolean; onResult: (r: PromptResult) => void }) {
  const [started] = useState(() => Date.now());
  const [helped, setHelped] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const answer = (alts: string[]) => {
    const heard = saysPattern(pattern, alts, lexicon, content.words);
    if (heard) onResult({ ok: true, heard, ms: Date.now() - started, helped });
    else setWrong(alts[0]);
  };
  return (
    <div className="speak-prompt">
      <p className="prompt-en">“{pattern.en.replace(/\[([^\]]*)\]/g, (_, s: SlotType) => SLOT_INFO[s]?.en ?? s)}”</p>
      <p className="muted">Say it in Chinese.</p>
      {helped && (
        <p className="prompt-answer">
          <Tokens text={example(pattern)} />
        </p>
      )}
      <SpeakInput onAnswer={answer} />
      {wrong !== null && <p className="hint warn-text">Heard “{wrong}”. Not quite, try again.</p>}
      <div className="row-end">
        {allowHelp && !helped && (
          <button
            type="button"
            className="btn small ghost"
            onClick={() => {
              setHelped(true);
              void speaker.speak(example(pattern), TEACHER_VOICE);
            }}
          >
            <Volume2 size={16} /> <Zh text="听答案 Show me" />
          </button>
        )}
        <button type="button" className="btn small ghost" onClick={() => onResult({ ok: false, heard: wrong ?? '', ms: Date.now() - started, helped })}>
          <X size={16} /> <Zh text="不会 Don't know" />
        </button>
      </div>
    </div>
  );
}

/** Patterns that are due come back as small repair jobs: under a minute, a tip each. */
export function RepairJobs({ due, onDone }: { due: string[]; onDone: (patternId: string, r: PromptResult) => void }) {
  const [active, setActive] = useState<string | null>(null);
  const jobs = useMemo(() => due.map((id) => content.patterns.find((p) => p.id === id)).filter((p): p is Pattern => !!p).slice(0, 5), [due]);
  if (jobs.length === 0) return null;
  const pattern = jobs.find((p) => p.id === active);
  return (
    <section className="repairs">
      <h3 className="section-title"><Zh text="修理 Repair jobs" /></h3>
      <p className="hint">These sentences are starting to slip. Fix each one by saying it: under a minute, 🪙 1 each.</p>
      {jobs.map((p) => (
        <button key={p.id} type="button" className="repair-job" onClick={() => setActive(p.id)}>
          <Wrench size={16} /> {p.en}
        </button>
      ))}
      {pattern && (
        <Sheet title="修理 Repair" onClose={() => setActive(null)}>
          <SpeakPrompt
            key={pattern.id}
            pattern={pattern}
            allowHelp
            onResult={(r) => {
              onDone(pattern.id, r);
              setActive(null);
            }}
          />
        </Sheet>
      )}
    </section>
  );
}

export function ResultMark({ ok }: { ok: boolean }) {
  return ok ? <Check size={16} className="ok-mark" /> : <X size={16} className="bad-mark" />;
}
