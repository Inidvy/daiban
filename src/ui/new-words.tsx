// New words and sentences, shown where they come up in play: the sentences a level adds (word by word,
// with pinyin and meaning) and the "today's words" overview on the day card.

import { useState } from 'react';
import { Sparkles, Volume2 } from 'lucide-react';
import { segment } from '../content.ts';
import type { Level } from '../levels.ts';
import { SLOT_INFO } from '../palette.ts';
import type { SlotType, Word } from '../types.ts';
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
export function LineBreakdown({ line }: { line: { text: string; en: string } }) {
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

const EXAMPLE_EN: Record<string, string> = { 数量: 'two', 量词: 'bowls', 东西: 'beef noodles', 价钱: '36 yuan', 地方: 'the airport' };

/** The sentences a level adds, with slots filled by examples, so a new line is never a surprise. */
export function NewLines({ level }: { level: Level }) {
  const patterns = level.newPatterns.flatMap((id) => content.patterns.filter((p) => p.id === id));
  if (patterns.length === 0) return null;
  return (
    <section className="new-lines">
      <h3>
        <Sparkles size={16} /> <Zh text="新句子" /> New in level {level.id}
      </h3>
      {patterns.map((p) => (
        <div key={p.id} className="new-line">
          <small className="muted">{p.speaker === 'customer' ? <Zh text="客人说 Customers say" /> : <Zh text="你的回答 Your answer" />}</small>
          <LineBreakdown
            line={{
              // follows the slot examples of spokenText in src/palette.ts
              text: p.template.replace(/\[([^\]]*)\]/g, (_, slot: SlotType) => SLOT_INFO[slot]?.example ?? slot).replace(/\s+/g, ''),
              en: p.en.replace(/\[([^\]]*)\]/g, (_, slot: string) => EXAMPLE_EN[slot] ?? slot),
            }}
          />
        </div>
      ))}
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
