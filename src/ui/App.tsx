import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, BookOpen, FileText, Languages, Lock, Play } from 'lucide-react';
import { getDay } from '../content.ts';
import { emptyRules, fromScript, fromTemplate, insertBlock, toScript } from '../editor.ts';
import type { Block, Place } from '../editor.ts';
import { blockText, paletteFor } from '../palette.ts';
import type { PaletteItem } from '../palette.ts';
import { printScript } from '../print.ts';
import { dueIds, GRADE, rate, rushGrades, speakingGrade } from '../progress.ts';
import type { Cards, Grade } from '../progress.ts';
import { countRules, parseScript } from '../script.ts';
import { generateCustomers, serveAll, summarize } from '../simulation.ts';
import type { Customer, CustomerResult } from '../simulation.ts';
import { SPEAK_AFTER } from '../voice.ts';
import { findLevel, isLevelOpen, levelDay, levelsOf, migrateDayStars, nextLevel } from '../levels.ts';
import { NewLines, TodaysWords } from './new-words.tsx';
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
import { Tokens, WordContext, whyKey, whyTargets, Zh } from './words.tsx';
import type { WhyTarget } from './words.tsx';

type Tab = 'program' | 'rush' | 'shift' | 'review';
const TABS: { id: Tab; hanzi: string; en: string }[] = [
  { id: 'program', hanzi: '早上', en: 'Program' },
  { id: 'rush', hanzi: '中午', en: 'Lunch' },
  { id: 'shift', hanzi: '傍晚', en: '代班 Shift' },
  { id: 'review', hanzi: '晚上', en: 'Review' },
];

interface Rush {
  customers: Customer[];
  results: CustomerResult[];
  /** Where the scene (re)starts: 0, or the customer that was waiting during a hot-fix. */
  startAt: number;
  done: boolean;
}

/** The script belongs to the business, not the day: yesterday's rules meet today's customers. */
const scriptKey = (place: string) => (place === 'noodles' ? 'noodle.blocks' : `${place}.blocks`);

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
  const [shiftPassed, setShiftPassed] = useState<Record<number, boolean>>(() => load('shiftPassed', {}));
  // Stars per level ("1-2"). Saves from before levels kept stars per day.
  const [levelStars, setLevelStars] = useState<Record<string, number>>(
    () => load<Record<string, number> | null>('levelStars', null) ?? migrateDayStars(content, load('rushStars', {})),
  );
  const [levelId, setLevelId] = useState(() => {
    const saved = load<string | null>('level', null);
    return saved && findLevel(content, saved) ? saved : '1-1';
  });
  const level = findLevel(content, levelId)!;
  const dayNumber = level.day;
  // A day's pill shows its weakest level, once every level has a star.
  const dayStars = useMemo(() => {
    const out: Record<number, number> = {};
    for (const d of content.days) out[d.day] = Math.min(...levelsOf(d).map((l) => levelStars[l.id] ?? 0));
    return out;
  }, [levelStars]);

  const shop = content.places.find((p) => p.id === getDay(content, dayNumber).place) ?? content.places[0];
  const [blocks, setBlocksState] = useState<Block[]>(() => load(scriptKey(shop.id), []));
  // A new place starts from its own (empty) script.
  const shownPlace = useRef(shop.id);
  useEffect(() => {
    if (shownPlace.current === shop.id) return;
    shownPlace.current = shop.id;
    setBlocksState(load(scriptKey(shop.id), []));
  }, [shop.id]);
  const [tab, setTab] = useState<Tab>('program');
  const [paletteAt, setPaletteAt] = useState<Place | null>(null);
  const [speakItem, setSpeakItem] = useState<PaletteItem | null>(null);
  const [placed, setPlaced] = useState<Record<string, number>>(() => load('placed', {}));
  const [whyQueue, setWhyQueue] = useState<WhyTarget[]>([]);
  const [seen, setSeen] = useState<string[]>(() => load('seenWords', []));
  // Pinyin is on by default: the game starts from zero (it can be turned off later).
  const [showPinyin, setShowPinyin] = useState(() => load('pinyinOn', true));
  const [rush, setRush] = useState<Rush | null>(null);
  const [sheet, setSheet] = useState<'sample' | 'text' | 'hotfix' | 'stats' | null>(null);
  const [hotFixFrom, setHotFixFrom] = useState(0);
  const [cards, setCards] = useState<Cards>(() => load('cards', {}));
  const [tips, setTips] = useState(() => load('tips', 0));

  const day = useMemo(() => levelDay(content, level), [levelId]);
  const palette = useMemo(() => paletteFor(content, dayNumber, day.allowed), [day]);

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
    save(scriptKey(shop.id), next);
  };
  const chooseLevel = (id: string) => {
    setLevelId(id);
    save('level', id);
    setRush(null);
    setTab('program');
  };
  // A day opens at its first level without a star (or its last open level once all have one).
  const chooseDay = (n: number) => {
    const ls = levelsOf(getDay(content, n));
    const open = ls.filter((l) => isLevelOpen(content, l.id, levelStars));
    chooseLevel((open.find((l) => !levelStars[l.id]) ?? open.at(-1) ?? ls[0]).id);
  };
  const togglePinyin = () => {
    setShowPinyin(!showPinyin);
    save('pinyinOn', !showPinyin);
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
    const customers = generateCustomers(content, day, level.customers, Math.floor(Math.random() * 1e6));
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

  const rushDone = () => {
    setRush((r) => (r ? { ...r, done: true } : r));
    if (!result) return;
    applyGrades(rushGrades(result.results));
    addTips(result.results.filter((r) => r.failures.length === 0).length);
    if (result.stars > (levelStars[levelId] ?? 0)) {
      const next = { ...levelStars, [levelId]: result.stars };
      setLevelStars(next);
      save('levelStars', next);
    }
  };

  const next = nextLevel(content, levelId);
  const sample = useMemo(() => parseScript(sampleScript(day)), [day]);
  const empties = emptyRules(blocks).length;
  const missedToday = useMemo(() => new Set(rush?.done && result ? result.review.flatMap((r) => r.patternIds) : []), [rush, result]);
  const due = useMemo(() => dueIds(cards, new Date()).filter((id) => content.patterns.some((p) => p.id === id && p.day <= dayNumber)), [cards, dayNumber]);

  return (
    <WordContext.Provider value={{ openWhy, showPinyin }}>
      <div className="app">
        <header className="top">
          <div className="brand">
            <span className="logo"><Zh text="代班" /></span>
            <span className="muted">{shop.emoji} <Zh text={shop.name} /></span>
          </div>
          <div className="top-actions">
            <span className="tips-total" aria-label={`${tips} tips`}>
              🪙 {tips}
            </span>
            <button type="button" className="btn ghost small" onClick={() => setSheet('stats')} aria-label="Playtest stats">
              <BarChart3 size={16} />
            </button>
            <button type="button" className={`btn ghost small ${showPinyin ? 'on' : ''}`} onClick={togglePinyin} aria-pressed={showPinyin}>
              <Languages size={16} /> <Zh text="拼音" />
            </button>
          </div>
        </header>

        <nav className="days" aria-label="Day">
          {content.days.map((d) => {
            const open = isLevelOpen(content, `${d.day}-1`, levelStars);
            return (
              <button key={d.day} type="button" className={d.day === dayNumber ? 'active' : ''} onClick={() => chooseDay(d.day)} disabled={!open}
                title={open ? undefined : `Clear Day ${d.day - 1} first`}>
                {!open && <Lock size={12} />} {content.days.find((x) => x.day === d.day - 1)?.place !== d.place && <span aria-hidden>{content.places.find((p) => p.id === d.place)?.emoji}</span>} <Zh text={`第${d.day}天`} />
                {dayStars[d.day] > 0 && <small className="pill-stars">{'★'.repeat(dayStars[d.day])}</small>}
              </button>
            );
          })}
        </nav>

        <nav className="levels" aria-label="Level">
          {levelsOf(getDay(content, dayNumber)).map((l) => {
            const open = isLevelOpen(content, l.id, levelStars);
            const n = levelStars[l.id] ?? 0;
            return (
              <button key={l.id} type="button" className={l.id === levelId ? 'active' : ''} onClick={() => chooseLevel(l.id)} disabled={!open}
                title={open ? l.title : 'Get a star on the level before'}>
                {!open && <Lock size={12} />} {l.id}
                {n > 0 && <small className="pill-stars">{'★'.repeat(n)}</small>}
              </button>
            );
          })}
        </nav>

        <nav className="tabs four" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}>
              <Zh text={t.hanzi} /> <small><Zh text={t.en} /></small>
            </button>
          ))}
        </nav>

        <main>
          {tab === 'program' && (
            <>
              <section className="day-card">
                <p className="level-label">
                  <Zh text={`第${level.day}天 · ${day.title}`} />
                </p>
                <h1>
                  <Zh text={`第${level.index + 1}关 ${level.title}`} />
                </h1>
                <p>
                  <Zh text={day.twist} /> {level.customers} customers.
                </p>
                <div className="menu">
                  {day.menu.map((dish) => (
                    <span key={dish} className={`dish ${day.soldOut.includes(dish) ? 'sold-out' : ''}`}>
                      <Tokens text={dish} />
                      {day.soldOut.includes(dish) && <small><Zh text="没有了" /></small>}
                    </span>
                  ))}
                </div>
                <ProgressLine day={dayNumber} cards={cards} />
              </section>
              <NewLines level={level} />
              <section className="day-words">
                <TodaysWords day={dayNumber} />
              </section>

              <ScriptEditor blocks={blocks} day={dayNumber} onChange={setBlocks} onAddAt={setPaletteAt} />

              <div className="actions">
                <button type="button" className="btn ghost" onClick={() => setSheet('sample')}>
                  <BookOpen size={16} /> <Zh text="看例子 Sample" />
                </button>
                <button type="button" className="btn ghost" onClick={() => setSheet('text')}>
                  <FileText size={16} /> <Zh text="文本 Text" />
                </button>
                <button type="button" className="btn primary" onClick={run}>
                  <Play size={16} /> <Zh text="开门 Run lunch" />
                </button>
              </div>
              {empties > 0 && <p className="hint warn-text"><Zh text={`${empties} empty 如果 will be skipped when the shop opens.`} /></p>}
            </>
          )}

          {tab === 'rush' &&
            (rush && result ? (
              <RushView
                result={result}
                startAt={rush.startAt}
                done={rush.done}
                onDone={rushDone}
                onHotFix={(from) => {
                  setHotFixFrom(from);
                  setSheet('hotfix');
                }}
                onBackToScript={() => setTab('program')}
                summaryExtra={
                  !rush.done || !result ? null : result.stars >= 1 && next ? (
                    <button type="button" className="btn small primary" onClick={() => chooseLevel(next.id)}>
                      <Zh text="下一关" /> Next level {next.id} →
                    </button>
                  ) : result.stars === 0 ? (
                    <p className="hint">One ★ opens the next level. Fix a rule and run it again.</p>
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
              <h3 className="section-title"><Zh text="今天的错 Today's misunderstandings" /></h3>
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
                <Zh text="用这个 Use it" />
              </button>
            </div>
          </Sheet>
        )}

        {sheet === 'hotfix' && (
          <Sheet title={`改规则 Fix a rule · customer ${hotFixFrom + 1} is waiting`} onClose={finishHotFix}>
            <ScriptEditor blocks={blocks} day={dayNumber} onChange={setBlocks} onAddAt={setPaletteAt} />
            <div className="row-end">
              <button type="button" className="btn primary" onClick={finishHotFix}>
                <Play size={16} /> <Zh text="继续 Resume" />
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
