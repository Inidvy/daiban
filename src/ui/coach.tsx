// Beginner support: the guided first lesson's coach card, word-by-word line breakdowns, and the
// "today's words" overview on the day card (everything new today, at once, with pinyin and meaning).

import { useState } from 'react';
import { ArrowRight, GraduationCap, Volume2 } from 'lucide-react';
import { segment } from '../content.ts';
import type { LessonLine, LessonStep } from '../lesson.ts';
import type { Word } from '../types.ts';
import { content, wordByHanzi } from './content.ts';
import { speaker, TEACHER_VOICE } from './speech.ts';
import { load, save } from './storage.ts';
import { Zh } from './words.tsx';

function WordTile({ word }: { word: Word }) {
  return (
    <button type="button" className="word-tile" onClick={() => void speaker.speak(word.hanzi, TEACHER_VOICE)}>
      <span className="tile-pinyin">{word.pinyin}</span>
      <span className="tile-hanzi">{word.hanzi}</span>
      <span className="tile-en">{word.en}</span>
    </button>
  );
}

/** A sentence, then each of its words with pinyin and meaning. */
export function LineBreakdown({ line }: { line: LessonLine }) {
  const words = segment(line.text, content.words).flatMap((t) => (t.word ? [t.word] : []));
  return (
    <div className="line-breakdown">
      <div className="line-head">
        <button type="button" className="icon-btn" aria-label="Play" onClick={() => void speaker.speak(line.text, TEACHER_VOICE)}>
          <Volume2 size={20} />
        </button>
        <span className="line-text">
          <Zh text={line.text} />
        </span>
      </div>
      <div className="line-en">{line.en}</div>
      <div className="tiles">
        {words.map((w, i) => (
          <WordTile key={i} word={w} />
        ))}
      </div>
    </div>
  );
}

export function CoachCard({ step, index, total, onNext, onSkip, onGoToScript }: {
  step: LessonStep;
  index: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
  /** Shown on the lunch tab when the next step is building rules. */
  onGoToScript?: () => void;
}) {
  const last = index === total - 1;
  return (
    <section className="coach" aria-live="polite">
      <header className="coach-head">
        <GraduationCap size={18} />
        <span>
          <Zh text="跟我学" /> Guided start · {index + 1}/{total}
        </span>
        <button type="button" className="link-btn" onClick={onSkip}>
          Skip
        </button>
      </header>
      <h2><Zh text={step.title} /></h2>
      <p><Zh text={step.body} /></p>
      {step.lines?.map((l) => (
        <LineBreakdown key={l.text} line={l} />
      ))}
      {step.tiles && (
        <div className="tiles">
          {step.tiles.map((h) => {
            const w = wordByHanzi.get(h);
            return w ? <WordTile key={h} word={w} /> : null;
          })}
        </div>
      )}
      {step.kind === 'read' && (
        <button type="button" className="btn primary" onClick={onNext}>
          {last ? 'Finish' : 'Next'} <ArrowRight size={16} />
        </button>
      )}
      {step.kind === 'place' && onGoToScript && (
        <button type="button" className="btn primary" onClick={onGoToScript}>
          <Zh text="改规则" /> Go to the script <ArrowRight size={16} />
        </button>
      )}
      {step.kind === 'place' && !onGoToScript && <p className="coach-status">Waiting for the block…</p>}
      {step.kind === 'run' && <p className="coach-status">Waiting for the lunch rush to finish…</p>}
    </section>
  );
}

const LOGIC = new Set(['如果', '就', '不然', '听到', '听', '做', '说', '上菜', '先', '然后', '收钱', '打包', '再']);

/** Everything new today, grouped, at once (the learner's preferred overview). */
export function TodaysWords({ day }: { day: number }) {
  const [open, setOpen] = useState(() => load('todaysWordsOpen', true));
  const words = content.words.filter((w) => w.day === day);
  if (words.length === 0) return null;
  const groups: [string, Word[]][] = [
    ['数字 Numbers', words.filter((w) => w.slot === '数量')],
    ['菜 Food', words.filter((w) => w.slot === '东西' || w.slot === '量词')],
    ['客人和你 Customers and you', words.filter((w) => !w.slot && !LOGIC.has(w.hanzi))],
    ['机器人 Robot words', words.filter((w) => !w.slot && LOGIC.has(w.hanzi))],
  ];
  return (
    <details
      className="todays-words"
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(now);
        save('todaysWordsOpen', now);
      }}
    >
      <summary>
        <Zh text="今天的词" /> Today's words ({words.length}) · tap to hear
      </summary>
      {groups
        .filter(([, list]) => list.length)
        .map(([label, list]) => (
          <div key={label} className="word-group">
            <h4>
              <Zh text={label} />
            </h4>
            <div className="tiles">
              {list.map((w) => (
                <WordTile key={w.hanzi} word={w} />
              ))}
            </div>
          </div>
        ))}
    </details>
  );
}
