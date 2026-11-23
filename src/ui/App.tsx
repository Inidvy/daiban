import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, BookOpen, FileText, Languages, Lock, Play } from 'lucide-react';
import { getDay } from '../content.ts';
import { emptyRules, fromScript, fromTemplate, insertBlock, toScript } from '../editor.ts';
import type { Block, Place } from '../editor.ts';
import { blockText, paletteFor } from '../palette.ts';
import type { PaletteItem } from '../palette.ts';
import { printScript } from '../print.ts';
import { dueIds, GRADE, isUnlocked, rate, rushGrades, speakingGrade, starsWithShift } from '../progress.ts';
import type { Cards, Grade } from '../progress.ts';
import { countRules, parseScript } from '../script.ts';
import { generateCustomers, serveAll, summarize } from '../simulation.ts';
import type { Customer, CustomerResult } from '../simulation.ts';
import { SPEAK_AFTER } from '../voice.ts';
import { content, sampleScript } from './content.ts';
import { ScriptEditor } from './editor-view.tsx';
import { MenuBoard, ProgressLine, RepairJobs } from './menu-board.tsx';
import { PaletteSheet } from './palette-sheet.tsx';
import { ReviewList, RushView, Stars } from './rush-view.tsx';
import { SayAloud } from './say-aloud.tsx';
import { Sheet } from './sheet.tsx';
import { ShiftView } from './shift-view.tsx';
import { SayAnyLine, SpeakLineSheet } from './speak-line-sheet.tsx';
import { addActive, markFirstPlayed } from './stats.ts';
import { StatsSheet } from './stats-sheet.tsx';
import { load, save } from './storage.ts';
import { ToneMirror } from './tone-mirror.tsx';
import { WhyCard } from './why-card.tsx';
import { Tokens, WordContext, whyKey, whyTargets } from './words.tsx';
import type { WhyTarget } from './words.tsx';

type Tab = 'program' | 'rush' | 'shift' | 'review';
const TABS: { id: Tab; hanzi: string; en: string }[] = [
  { id: 'program', hanzi: '早上', en: 'Program' },
  { id: 'rush', hanzi: '中午', en: 'Lunch' },
  { id: 'shift', hanzi: '傍晚', en: '代班 Shift' },
  { id: 'review', hanzi: '晚上', en: 'Review' },
];
const CUSTOMERS_PER_RUSH = 8;

interface Rush {
  customers: Customer[];
  results: CustomerResult[];
  /** Where the scene (re)starts: 0, or the customer that was waiting during a hot-fix. */
  startAt: number;
  done: boolean;
}

/** The script belongs to the business, not the day: yesterday's rules meet today's customers. */
const SCRIPT_KEY = 'noodle.blocks';

/** Counts active play time for the playtest stats: visible, and touched in the last minute. */
function useActiveTime() {
  useEffect(() => {
    let last = Date.now();
    const touch = () => (last = Date.now());
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    const t = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - last < 60_000) addActive(5000);
    }, 5000);
    return () => {
      clearInterval(t);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, []);
}

export function App() {
  useActiveTime();
  const [rushStars, setRushStars] = useState<Record<number, number>>(() => load('rushStars', {}));
  const [shiftPassed, setShiftPassed] = useState<Record<number, boolean>>(() => load('shiftPassed', {}));
  const bestStars = useMemo(() => {
    const out: Record<number, number> = {};
    for (const [d, n] of Object.entries(rushStars)) out[Number(d)] = starsWithShift(n, !!shiftPassed[Number(d)]);
    return out;
  }, [rushStars, shiftPassed]);

  const [dayNumber, setDayNumber] = useState(() => load('day', 1));
  const [blocks, setBlocksState] = useState<Block[]>(() => load(SCRIPT_KEY, []));
  const [tab, setTab] = useState<Tab>('program');
  const [paletteAt, setPaletteAt] = useState<Place | null>(null);
  const [speakItem, setSpeakItem] = useState<PaletteItem | null>(null);
  const [placed, setPlaced] = useState<Record<string, number>>(() => load('placed', {}));
  const [whyQueue, setWhyQueue] = useState<WhyTarget[]>([]);
  const [seen, setSeen] = useState<string[]>(() => load('seenWords', []));
  const [showPinyin, setShowPinyin] = useState(() => load('pinyin', false));
  const [rush, setRush] = useState<Rush | null>(null);
  const [sheet, setSheet] = useState<'sample' | 'text' | 'hotfix' | 'stats' | null>(null);
  const [hotFixFrom, setHotFixFrom] = useState(0);
  const [cards, setCards] = useState<Cards>(() => load('cards', {}));
  const [tips, setTips] = useState(() => load('tips', 0));

  const day = getDay(content, dayNumber);
  const palette = useMemo(() => paletteFor(content, dayNumber), [dayNumber]);

  // Ratings arrive from several places; chain them so none overwrites another.
  const cardsRef = useRef(cards);
  const ratingQueue = useRef(Promise.resolve());
  const applyGrades = useCallback((grades: Map<string, Grade>) => {
    if (grades.size === 0) return;
    ratingQueue.current = ratingQueue.current.then(async () => {
      const next = await rate(cardsRef.current, grades, new Date());
      cardsRef.current = next;
      setCards(next);
      save('cards', next);
    });
  }, []);
  const addTips = (n: number) =>
    setTips((t) => {
      save('tips', t + n);
      return t + n;
    });

  const setBlocks = (next: Block[]) => {
    setBlocksState(next);
    save(SCRIPT_KEY, next);
  };
  const chooseDay = (n: number) => {
    setDayNumber(n);
    save('day', n);
    setRush(null);
    setTab('program');
  };
  const togglePinyin = () => {
    setShowPinyin(!showPinyin);
    save('pinyin', !showPinyin);
  };

  const openWhy = useCallback((t: WhyTarget) => setWhyQueue([t]), []);

  const mustSpeak = (item: PaletteItem) => (placed[item.key] ?? 0) >= SPEAK_AFTER;

  // Why cards appear the first time a word is used (docs/design.md).
  const place = (item: PaletteItem, spoken = false) => {
    if (!paletteAt) return;
    if (!spoken && mustSpeak(item)) {
      setSpeakItem(item);
      return;
    }
    setBlocks(insertBlock(blocks, paletteAt, fromTemplate(item.template)));
    setPaletteAt(null);
    setSpeakItem(null);
    const nextPlaced = { ...placed, [item.key]: (placed[item.key] ?? 0) + 1 };
    setPlaced(nextPlaced);
    save('placed', nextPlaced);
    // Saying a 说 line is practice for that sentence.
    if (spoken && item.key.startsWith('say:')) applyGrades(new Map([[item.key.slice(4), GRADE.good]]));
    const fresh = whyTargets(blockText(item.template)).filter((t) => !seen.includes(whyKey(t)) && (t.kind === 'slot' || t.word.why));
    if (fresh.length) {
      const nextSeen = [...seen, ...fresh.map(whyKey)];
      setSeen(nextSeen);
      save('seenWords', nextSeen);
      setWhyQueue(fresh);
    }
  };

  const run = () => {
    if (dayNumber === 1) markFirstPlayed();
    const customers = generateCustomers(content, day, CUSTOMERS_PER_RUSH, Math.floor(Math.random() * 1e6));
    setRush({ customers, results: serveAll(content, day, toScript(blocks), customers), startAt: 0, done: false });
    setTab('rush');
    window.scrollTo({ top: 0 });
  };

  // Pause the rush, fix a rule, and serve the remaining customers with the new script.
  const finishHotFix = () => {
    setSheet(null);
    if (!rush) return;
    const rest = serveAll(content, day, toScript(blocks), rush.customers.slice(hotFixFrom));
    setRush({ ...rush, results: [...rush.results.slice(0, hotFixFrom), ...rest], startAt: hotFixFrom });
  };

  const result = useMemo(() => (rush ? summarize(day, toScript(blocks), rush.results) : null), [rush, day, blocks]);
  const shownResult = useMemo(() => (result ? { ...result, stars: starsWithShift(result.stars, !!shiftPassed[dayNumber]) } : null), [result, shiftPassed, dayNumber]);

  const rushDone = () => {
    setRush((r) => (r ? { ...r, done: true } : r));
    if (!result) return;
    applyGrades(rushGrades(result.results));
    addTips(result.results.filter((r) => r.failures.length === 0).length);
    if (result.stars > (rushStars[dayNumber] ?? 0)) {
      const next = { ...rushStars, [dayNumber]: result.stars };
      setRushStars(next);
      save('rushStars', next);
    }
  };

  const sample = useMemo(() => parseScript(sampleScript(day)), [day]);
  const empties = emptyRules(blocks).length;
  const missedToday = useMemo(() => new Set(rush?.done && result ? result.review.flatMap((r) => r.patternIds) : []), [rush, result]);
  const due = useMemo(() => dueIds(cards, new Date()).filter((id) => content.patterns.some((p) => p.id === id && p.day <= dayNumber)), [cards, dayNumber]);

  return (
    <WordContext.Provider value={{ openWhy, showPinyin }}>
      <div className="app">
        <header className="top">
          <div className="brand">
            <span className="logo">代班</span>
            <span className="muted">面馆 Noodle shop</span>
          </div>
          <div className="top-actions">
            <span className="tips-total" aria-label={`${tips} tips`}>
              🪙 {tips}
            </span>
            <button type="button" className="btn ghost small" onClick={() => setSheet('stats')} aria-label="Playtest stats">
              <BarChart3 size={16} />
            </button>
            <button type="button" className={`btn ghost small ${showPinyin ? 'on' : ''}`} onClick={togglePinyin} aria-pressed={showPinyin}>
              <Languages size={16} /> 拼音
            </button>
          </div>
        </header>

        <nav className="days" aria-label="Day">
          {content.days.map((d) => {
            const open = isUnlocked(d.day, bestStars);
            return (
              <button key={d.day} type="button" className={d.day === dayNumber ? 'active' : ''} onClick={() => chooseDay(d.day)} disabled={!open}
                title={open ? undefined : `Get a star on Day ${d.day - 1} first`}>
                {!open && <Lock size={12} />} 第{d.day}天
                {(bestStars[d.day] ?? 0) > 0 && <small className="pill-stars">{'★'.repeat(bestStars[d.day])}</small>}
              </button>
            );
          })}
        </nav>

        <nav className="tabs four" role="tablist">
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
                <ProgressLine day={dayNumber} cards={cards} />
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
            (rush && shownResult ? (
              <RushView
                result={shownResult}
                startAt={rush.startAt}
                done={rush.done}
                onDone={rushDone}
                onHotFix={(from) => {
                  setHotFixFrom(from);
                  setSheet('hotfix');
                }}
                onBackToScript={() => setTab('program')}
                summaryExtra={
                  result && result.stars === 3 && !shiftPassed[dayNumber] ? (
                    <button type="button" className="btn small primary star-gate" onClick={() => setTab('shift')}>
                      ★3 needs tonight's 代班 shift →
                    </button>
                  ) : null
                }
              />
            ) : (
              <p className="hint">The shop hasn't opened yet. Build a script, then press 开门 Run lunch.</p>
            ))}

          {tab === 'shift' && (
            <ShiftView
              key={dayNumber}
              day={day}
              passedBefore={!!shiftPassed[dayNumber]}
              onAnswered={(id, grade) => applyGrades(new Map([[id, grade]]))}
              onFinish={({ passed, tips: earned }) => {
                addTips(earned);
                if (passed && !shiftPassed[dayNumber]) {
                  const next = { ...shiftPassed, [dayNumber]: true };
                  setShiftPassed(next);
                  save('shiftPassed', next);
                }
              }}
            />
          )}

          {tab === 'review' && (
            <>
              <MenuBoard day={dayNumber} cards={cards} highlight={missedToday} />
              <RepairJobs
                due={due}
                onDone={(id, r) => {
                  applyGrades(new Map([[id, r.ok ? speakingGrade({ misses: 0, hints: r.helped ? 1 : 0, gaveUp: false }) : GRADE.again]]));
                  if (r.ok) addTips(1);
                }}
              />
              <h3 className="section-title">今天的错 Today's misunderstandings</h3>
              <ReviewList
                result={rush?.done ? result : null}
                renderExtra={(item) => (
                  <>
                    <SayAloud text={item.text} onSaid={() => applyGrades(new Map(item.patternIds.map((id) => [id, GRADE.good])))} />
                    <ToneMirror text={item.text} pinyin={item.pinyin} />
                  </>
                )}
              />
            </>
          )}
        </main>

        {paletteAt && !speakItem && (
          <PaletteSheet
            items={palette}
            day={dayNumber}
            onPick={(item) => place(item)}
            onClose={() => setPaletteAt(null)}
            mustSpeak={mustSpeak}
            header={<SayAnyLine items={palette} onPlaced={(item) => place(item, true)} />}
          />
        )}
        {paletteAt && speakItem && (
          <SpeakLineSheet
            item={speakItem}
            onPlaced={() => place(speakItem, true)}
            onSkip={() => {
              // Placing without speaking is allowed, it just doesn't count as practice.
              setBlocks(insertBlock(blocks, paletteAt, fromTemplate(speakItem.template)));
              setPaletteAt(null);
              setSpeakItem(null);
            }}
            onClose={() => setSpeakItem(null)}
          />
        )}

        {sheet === 'sample' && (
          <Sheet title={`例子 Sample script · 第${day.day}天`} onClose={() => setSheet(null)}>
            <p className="hint">
              A working script for today ({countRules(sample.body)} rules). Study it, then try to write your own, shorter one.
            </p>
            <ScriptEditor blocks={fromScript(sample)} day={dayNumber} onChange={() => {}} onAddAt={() => {}} readOnly />
            <div className="row-end">
              <span className="muted">
                <Stars n={3} /> with this script and the 代班 shift
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

        {sheet === 'hotfix' && (
          <Sheet title={`改规则 Fix a rule · customer ${hotFixFrom + 1} is waiting`} onClose={finishHotFix}>
            <ScriptEditor blocks={blocks} day={dayNumber} onChange={setBlocks} onAddAt={setPaletteAt} />
            <div className="row-end">
              <button type="button" className="btn primary" onClick={finishHotFix}>
                <Play size={16} /> 继续 Resume
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

        {sheet === 'stats' && <StatsSheet cards={cards} onClose={() => setSheet(null)} />}

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
