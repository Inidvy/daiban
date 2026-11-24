// Evening 代班 shift (docs/design.md, "Speaking"): an unusual customer the bot can't handle. The player
// answers by voice; meaning counts, a near miss gets a question back, and a hint ladder helps when stuck.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Lightbulb, RotateCcw, SkipForward, Volume2 } from 'lucide-react';
import { kitchenFor, toPinyin } from '../content.ts';
import { speakingGrade } from '../progress.ts';
import type { Grade } from '../progress.ts';
import { checkAnswer, hintLadder, timeLimitMs } from '../shift.ts';
import type { Day } from '../types.ts';
import { content } from './content.ts';
import { SpeakInput } from './speak-input.tsx';
import { speaker, TEACHER_VOICE, useChineseVoice } from './speech.ts';
import { ToneMirror } from './tone-mirror.tsx';
import { Tokens, Zh } from './words.tsx';

const VIP_VOICE = { rate: 0.75, pitch: 1.05 };

interface LoggedTurn {
  says: string;
  heard: string;
  model: string;
  grade: Grade;
}

export interface ShiftOutcome {
  passed: boolean;
  tips: number;
}

export function ShiftView({ day, passedBefore, onAnswered, onFinish }: {
  day: Day;
  passedBefore: boolean;
  onAnswered: (patternId: string, grade: Grade) => void;
  onFinish: (outcome: ShiftOutcome) => void;
}) {
  const turns = day.vip.turns;
  const lexicon = useMemo(() => kitchenFor(content, day).lexicon, [day]);
  const canSpeak = useChineseVoice();
  const [phase, setPhase] = useState<'intro' | 'turn' | 'done'>('intro');
  const [index, setIndex] = useState(0);
  const [misses, setMisses] = useState(0);
  const [hints, setHints] = useState(0);
  const [bubble, setBubble] = useState<{ text: string; en: string; who: 'them' | 'you' } | null>(null);
  const [showText, setShowText] = useState(true);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [log, setLog] = useState<LoggedTurn[]>([]);
  const [tips, setTips] = useState(0);
  const [busy, setBusy] = useState(false);
  const gaveUp = useRef(false);

  const turn = turns[index];
  const ladder = useMemo(() => (turn ? hintLadder(turn, content.patterns, content.words) : null), [turn]);

  const customerSays = async (text: string, en: string, missesNow: number) => {
    setBusy(true);
    setDeadline(null);
    setBubble({ text, en, who: 'them' });
    await speaker.speak(text, VIP_VOICE);
    setBusy(false);
    setDeadline(Date.now() + timeLimitMs(missesNow));
  };

  const startTurn = (i: number) => {
    setIndex(i);
    setMisses(0);
    setHints(0);
    setPhase('turn');
    void customerSays(turns[i].says, turns[i].en, 0);
  };

  // The timer: running out is not a failure screen, it just brings the next hint.
  useEffect(() => {
    if (phase !== 'turn' || deadline === null) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [phase, deadline]);
  useEffect(() => {
    if (deadline !== null && now >= deadline && phase === 'turn' && !busy) {
      const m = misses + 1;
      setMisses(m);
      setHints((h) => Math.min(3, h + 1));
      setDeadline(Date.now() + timeLimitMs(m));
    }
  }, [now, deadline, phase, busy, misses]);

  const finishTurn = (heard: string, grade: Grade, patternId: string, earned: number) => {
    onAnswered(patternId, grade);
    const total = tips + earned;
    setTips(total);
    setLog((l) => [...l, { says: turn.says, heard, model: turn.model, grade }]);
    setDeadline(null);
    if (index + 1 < turns.length) setTimeout(() => startTurn(index + 1), 1100);
    else {
      setPhase('done');
      setBubble(null);
      onFinish({ passed: !gaveUp.current, tips: total });
    }
  };

  const answer = (alternatives: string[]) => {
    if (!turn || busy) return;
    const v = checkAnswer(turn, alternatives, content.patterns, lexicon, content.words);
    if (v.kind === 'ok') {
      const grade = speakingGrade({ misses, hints, gaveUp: false });
      setBubble({ text: v.heard, en: '✓ 好！ They understood you.', who: 'you' });
      finishTurn(v.heard, grade, v.patternId, grade >= 3 ? 3 : 1);
    } else if (v.kind === 'near') {
      // Close, but not first try: counts for the rating, without pushing a hint.
      const m = misses + 1;
      setMisses(m);
      void customerSays(v.clarify.text, v.clarify.en, m);
    } else {
      const m = misses + 1;
      setMisses(m);
      if (m >= 2) setHints((h) => Math.max(h, 1));
      void customerSays('啊？', `Huh? (heard: ${v.heard || '…'})`, m);
    }
  };

  const giveUp = () => {
    gaveUp.current = true;
    setBubble({ text: turn.model, en: turn.modelEn, who: 'you' });
    finishTurn('', speakingGrade({ misses, hints, gaveUp: true }), turn.expect[0], 0);
  };

  if (phase === 'intro') {
    return (
      <section className="shift">
        <div className="day-card">
          <h1><Zh text={`代班 · ${day.vip.name}`} /></h1>
          <p><Zh text={day.vip.situation} /></p>
          <p className="hint">
            The bot can't handle this one. You serve them yourself, by speaking. Say what the shop would say; the exact words don't matter, the meaning does.
            {passedBefore && ' (Passed before: ★3 is open for today.)'}
          </p>
        </div>
        <button type="button" className="btn primary wide" onClick={() => startTurn(0)}>
          <Zh text={`开始 Start (${turns.length} lines)`} />
        </button>
      </section>
    );
  }

  if (phase === 'done') {
    return (
      <section className="shift">
        <div className="summary">
          <div>
            <div className="big"><Zh text={gaveUp.current ? '还行 Not quite' : '代班成功 Shift done!'} /></div>
            <div className="muted">
              🪙 {tips} tips · {gaveUp.current ? 'Skip a line and ★3 stays locked. Try again any time.' : '★3 is open for today.'}
            </div>
          </div>
        </div>
        <h3 className="section-title"><Zh text="你说的 What you said" /></h3>
        {log.map((l, i) => (
          <div key={i} className="review-item">
            <button type="button" className="icon-btn" aria-label="Play" onClick={() => void speaker.speak(l.model, TEACHER_VOICE)}>
              <Volume2 size={20} />
            </button>
            <div className="review-main">
              <div className="muted">
                <Zh text="客人" />: <Tokens text={l.says} />
              </div>
              <div className="review-text">
                <Tokens text={l.model} />
              </div>
              <div className="muted">
                {l.heard ? `You: ${l.heard}` : 'Skipped'} · {['', 'again', 'with hints', 'good', 'first try'][l.grade]}
              </div>
              <div className="review-actions">
                <ToneMirror text={l.model} pinyin={toPinyin(l.model, content.words)} />
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn ghost wide"
          onClick={() => {
            gaveUp.current = false;
            setLog([]);
            setTips(0);
            setPhase('intro');
          }}
        >
          <RotateCcw size={16} /> <Zh text="再来 Again" />
        </button>
      </section>
    );
  }

  const left = deadline === null ? 1 : Math.max(0, (deadline - now) / timeLimitMs(misses));
  const textVisible = showText || !canSpeak;

  return (
    <section className="shift">
      <div className="scene shift-scene">
        <div className="wall">
          <span className="sign"><Zh text="代班" /></span>
          <span className="tips">🪙 {tips}</span>
        </div>
        <div className="guest talk">
          <span className="guest-face">{bubble?.text === '啊？' ? '🤨' : '🧑‍🏫'}</span>
          <span className="guest-name"><Zh text={day.vip.name.split(' ')[0]} /></span>
        </div>
        <div className="robot you">🙋</div>
        {bubble && (
          <button type="button" className={`bubble ${bubble.who === 'them' ? 'them' : 'bot'}`} onClick={() => setShowText(true)}>
            {bubble.who === 'them' && !textVisible ? '🔊 ～～～' : <Zh text={bubble.text} />}
          </button>
        )}
        <div className="counter" />
        {bubble && (textVisible || bubble.who === 'you') && <div className="reaction-en">{bubble.en}</div>}
      </div>

      <div className="timer" aria-hidden="true">
        <div style={{ width: `${left * 100}%` }} />
      </div>
      <div className="muted turn-count">
        {index + 1}/{turns.length}
      </div>

      <div className="toolbar">
        <button type="button" className="btn small ghost" onClick={() => void speaker.speak(turn.says, VIP_VOICE)}>
          <Volume2 size={16} /> <Zh text="再听 Again" />
        </button>
        {canSpeak && !showText && (
          <button type="button" className="btn small ghost" onClick={() => setShowText(true)}>
            <Eye size={16} /> <Zh text="字 Text" />
          </button>
        )}
        <button type="button" className="btn small ghost" onClick={() => setHints((h) => Math.min(3, h + 1))} disabled={hints >= 3}>
          <Lightbulb size={16} /> <Zh text="提示 Hint" />
        </button>
      </div>

      {ladder && hints > 0 && (
        <div className="hints">
          {ladder.slice(0, hints).map((h) => (
            <div key={h.level} className={`hint-step level${h.level}`}>
              {h.level === 3 && (
                <button type="button" className="icon-btn" aria-label="Play the model answer" onClick={() => void speaker.speak(h.text, TEACHER_VOICE)}>
                  <Volume2 size={18} />
                </button>
              )}
              <span className="hint-text">{h.level === 1 ? h.text : <Tokens text={h.text} />}</span>
              <span className="muted">{h.en}</span>
            </div>
          ))}
        </div>
      )}

      <SpeakInput onAnswer={answer} disabled={busy} label="说 Answer" />

      {hints >= 3 && (
        <button type="button" className="btn small ghost" onClick={giveUp}>
          <SkipForward size={16} /> <Zh text="跳过 Skip this line (★3 stays locked)" />
        </button>
      )}
    </section>
  );
}
