import { useCallback, useMemo, useState } from 'react';
import { BookOpen, FileText, Languages, Play } from 'lucide-react';
import { getDay } from '../content.ts';
import { emptyRules, fromScript, fromTemplate, insertBlock, toScript } from '../editor.ts';
import type { Block, Place } from '../editor.ts';
import { blockText, paletteFor } from '../palette.ts';
import type { PaletteItem } from '../palette.ts';
import { printScript } from '../print.ts';
import { countRules, parseScript } from '../script.ts';
import { runDay } from '../simulation.ts';
import type { DayResult } from '../simulation.ts';
import { content, sampleScript } from './content.ts';
import { ScriptEditor } from './editor-view.tsx';
import { PaletteSheet } from './palette-sheet.tsx';
import { ReviewView, RushView, Stars } from './rush-view.tsx';
import { Sheet } from './sheet.tsx';
import { load, save } from './storage.ts';
import { WhyCard } from './why-card.tsx';
import { Tokens, WordContext, whyKey, whyTargets } from './words.tsx';
import type { WhyTarget } from './words.tsx';

type Tab = 'program' | 'rush' | 'review';
const TABS: { id: Tab; hanzi: string; en: string }[] = [
  { id: 'program', hanzi: '早上', en: 'Program' },
  { id: 'rush', hanzi: '中午', en: 'Lunch rush' },
  { id: 'review', hanzi: '晚上', en: 'Review' },
];
const CUSTOMERS_PER_RUSH = 8;

/** The script belongs to the business, not the day: yesterday's rules meet today's customers. */
const SCRIPT_KEY = 'noodle.blocks';

export function App() {
  const [dayNumber, setDayNumber] = useState(() => load('day', 1));
  const [blocks, setBlocksState] = useState<Block[]>(() => load(SCRIPT_KEY, []));
  const [tab, setTab] = useState<Tab>('program');
  const [paletteAt, setPaletteAt] = useState<Place | null>(null);
  const [whyQueue, setWhyQueue] = useState<WhyTarget[]>([]);
  const [seen, setSeen] = useState<string[]>(() => load('seenWords', []));
  const [showPinyin, setShowPinyin] = useState(() => load('pinyin', false));
  const [result, setResult] = useState<DayResult | null>(null);
  const [sheet, setSheet] = useState<'sample' | 'text' | null>(null);

  const day = getDay(content, dayNumber);
  const palette = useMemo(() => paletteFor(content, dayNumber), [dayNumber]);

  const setBlocks = (next: Block[]) => {
    setBlocksState(next);
    save(SCRIPT_KEY, next);
  };
  const chooseDay = (n: number) => {
    setDayNumber(n);
    save('day', n);
    setResult(null);
    setTab('program');
  };
  const togglePinyin = () => {
    setShowPinyin(!showPinyin);
    save('pinyin', !showPinyin);
  };

  const openWhy = useCallback((t: WhyTarget) => setWhyQueue([t]), []);

  // Why cards appear the first time a word is used (docs/design.md).
  const place = (item: PaletteItem) => {
    if (!paletteAt) return;
    setBlocks(insertBlock(blocks, paletteAt, fromTemplate(item.template)));
    setPaletteAt(null);
    const fresh = whyTargets(blockText(item.template)).filter((t) => !seen.includes(whyKey(t)) && (t.kind === 'slot' || t.word.why));
    if (fresh.length) {
      const nextSeen = [...seen, ...fresh.map(whyKey)];
      setSeen(nextSeen);
      save('seenWords', nextSeen);
      setWhyQueue(fresh);
    }
  };

  const run = () => {
    const script = toScript(blocks);
    setResult(runDay({ content, day, script, customers: CUSTOMERS_PER_RUSH, seed: Math.floor(Math.random() * 1e6) }));
    setTab('rush');
    window.scrollTo({ top: 0 });
  };

  const sample = useMemo(() => parseScript(sampleScript(day)), [day]);
  const empties = emptyRules(blocks).length;

  return (
    <WordContext.Provider value={{ openWhy, showPinyin }}>
      <div className="app">
        <header className="top">
          <div className="brand">
            <span className="logo">代班</span>
            <span className="muted">面馆 Noodle shop</span>
          </div>
          <button type="button" className={`btn ghost small ${showPinyin ? 'on' : ''}`} onClick={togglePinyin} aria-pressed={showPinyin}>
            <Languages size={16} /> 拼音
          </button>
        </header>

        <nav className="days" aria-label="Day">
          {content.days.map((d) => (
            <button key={d.day} type="button" className={d.day === dayNumber ? 'active' : ''} onClick={() => chooseDay(d.day)}>
              第{d.day}天
            </button>
          ))}
        </nav>

        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}>
              {t.hanzi} <small>{t.en}</small>
            </button>
          ))}
        </nav>

        <main>
          {tab === 'program' && (
            <>
              <section className="day-card">
                <h1>{day.title}</h1>
                <p>{day.twist}</p>
                <div className="menu">
                  {day.menu.map((dish) => (
                    <span key={dish} className={`dish ${day.soldOut.includes(dish) ? 'sold-out' : ''}`}>
                      <Tokens text={dish} />
                      {day.soldOut.includes(dish) && <small>没有了</small>}
                    </span>
                  ))}
                </div>
              </section>

              <ScriptEditor blocks={blocks} day={dayNumber} onChange={setBlocks} onAddAt={setPaletteAt} />

              <div className="actions">
                <button type="button" className="btn ghost" onClick={() => setSheet('sample')}>
                  <BookOpen size={16} /> 看例子 Sample
                </button>
                <button type="button" className="btn ghost" onClick={() => setSheet('text')}>
                  <FileText size={16} /> 文本 Text
                </button>
                <button type="button" className="btn primary" onClick={run}>
                  <Play size={16} /> 开门 Run lunch
                </button>
              </div>
              {empties > 0 && <p className="hint warn-text">{empties} empty 如果 will be skipped when the shop opens.</p>}
            </>
          )}

          {tab === 'rush' &&
            (result ? (
              <RushView result={result} onBackToScript={() => setTab('program')} />
            ) : (
              <p className="hint">The shop hasn't opened yet. Build a script, then press 开门 Run lunch.</p>
            ))}

          {tab === 'review' && <ReviewView result={result} />}
        </main>

        {paletteAt && <PaletteSheet items={palette} day={dayNumber} onPick={place} onClose={() => setPaletteAt(null)} />}

        {sheet === 'sample' && (
          <Sheet title={`例子 Sample script · 第${day.day}天`} onClose={() => setSheet(null)}>
            <p className="hint">
              A working script for today ({countRules(sample.body)} rules). Study it, then try to write your own, shorter one.
            </p>
            <ScriptEditor blocks={fromScript(sample)} day={dayNumber} onChange={() => {}} onAddAt={() => {}} readOnly />
            <div className="row-end">
              <span className="muted">
                <Stars n={3} /> with this script
              </span>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  if (blocks.length === 0 || window.confirm('Replace your script with the sample?')) {
                    setBlocks(fromScript(sample));
                    setSheet(null);
                  }
                }}
              >
                用这个 Use it
              </button>
            </div>
          </Sheet>
        )}

        {sheet === 'text' && (
          <Sheet title="文本 Script as text" onClose={() => setSheet(null)}>
            <p className="hint">Every line is also a sentence you could say.</p>
            <pre className="script-text">{printScript(toScript(blocks))}</pre>
          </Sheet>
        )}

        {whyQueue.length > 0 && (
          <WhyCard
            key={whyKey(whyQueue[0])}
            target={whyQueue[0]}
            remaining={whyQueue.length - 1}
            onNext={() => setWhyQueue(whyQueue.slice(1))}
            onClose={() => setWhyQueue([])}
          />
        )}
      </div>
    </WordContext.Provider>
  );
}
