// The lunch-rush scene (docs/design.md, M3): customers walk up to the counter and speak, the bot answers
// and cooks, and a wrong reaction plays out visibly. Plain DOM + CSS transitions, no game engine.

import { useEffect, useRef, useState } from 'react';
import { FastForward, Pause, Play, SkipForward, Wrench } from 'lucide-react';
import type { MadeItem } from '../interpreter.ts';
import type { CustomerResult, Failure } from '../simulation.ts';
import { content } from './content.ts';
import { BOT_VOICE, rateForSpeed, speaker, useChineseVoice } from './speech.ts';
import { Zh } from './words.tsx';

const AVATAR: Record<string, string> = { student: '🧑‍🎓', office: '🧑‍💼', grandma: '👵', tourist: '🧑‍🦰' };
const FOOD: Record<string, string> = {
  牛肉面: '🍜', 鸡蛋面: '🍜', 炸酱面: '🍝', 酸辣粉: '🍲', 饺子: '🥟', 包子: '🍙', 可乐: '🥤', 茶: '🍵',
  苹果: '🍎', 香蕉: '🍌', 西瓜: '🍉', 葡萄: '🍇', 橙子: '🍊', 草莓: '🍓',
  咖啡: '☕', 奶茶: '🧋', 果汁: '🧃', 蛋糕: '🍰', 水: '💧',
  单人间: '🛏️', 双人间: '🛏️', 早饭: '🥐', 感冒药: '💊', 创可贴: '🩹', 口罩: '😷',
};
/** Places where a happy customer says the food was good. */
const EATS = new Set(['noodles', 'cafe']);

interface Reaction {
  face: string;
  says: string;
  en: string;
  anim?: 'fan' | 'shake' | 'bury';
}

export function reactionFor(failures: readonly Failure[], place = 'noodles'): Reaction {
  const f = failures[0];
  if (!f) return EATS.has(place) ? { face: '😋', says: '好吃！', en: 'Delicious! (leaves a tip)' } : { face: '😄', says: '太好了！', en: 'Great! (leaves a tip)' };
  switch (f.kind) {
    case 'ignored':
      return { face: '😶', says: '喂？', en: 'Hello? Anyone?', anim: 'shake' };
    case 'confused':
      return { face: '🤨', says: '啊？', en: 'Huh?' };
    case 'stuck':
    case 'false-sold-out':
    case 'made-sold-out':
      return { face: '😕', says: '到底有没有？', en: 'Do you have it or not?' };
    case 'nothing':
      return { face: '😢', says: '我好饿…', en: "I'm so hungry…" };
    case 'wrong-dish':
      return { face: '😠', says: '这不是我要的！', en: "That's not what I ordered!", anim: 'shake' };
    case 'too-much':
      return { face: '😱', says: '太多了！', en: 'Way too much!', anim: 'bury' };
    case 'too-little':
      return { face: '😟', says: '不够！', en: 'Not enough!' };
    case 'spice':
      return f.reason.includes('fanning')
        ? { face: '🥵', says: '好辣！', en: 'So spicy!', anim: 'fan' }
        : { face: '😐', says: '味道不对。', en: "That doesn't taste right." };
    case 'takeaway':
      return f.reason.includes('wanted 打包')
        ? { face: '🙄', says: '我要打包！', en: 'I wanted it to go!' }
        : { face: '🙄', says: '我在这儿吃！', en: "I'm eating here!" };
    case 'price':
      return { face: '🤔', says: '多少钱啊？', en: 'So how much is it?' };
    case 'pay':
      return { face: '💸', says: '怎么付钱？', en: 'How do I pay?' };
    case 'no-answer':
      return { face: '🤨', says: '什么？', en: 'What? (that was no answer)', anim: 'shake' };
  }
}

function CounterFood({ made, packed }: { made: MadeItem[]; packed: boolean }) {
  return (
    <div className="counter-food">
      {made.map((m, i) => {
        const icon = FOOD[m.dish] ?? '🍽️';
        const shown = Math.min(m.qty, 6);
        const chili = m.spice === '辣' ? '🌶️🌶️' : m.spice === '微辣' ? '🌶️' : '';
        return (
          <span key={i} className={`food ${m.qty >= 10 ? 'pile' : ''} ${m.soldOut ? 'ghost' : ''}`} title={`${m.qty} ${m.dish} ${m.spice}`}>
            {packed ? '🛍️' : icon.repeat(shown)}
            {m.qty > shown && <b>×{m.qty}</b>}
            {!packed && FOOD[m.dish] && ['🍜', '🍝', '🍲'].includes(icon) && <small>{chili}</small>}
          </span>
        );
      })}
    </div>
  );
}

type Bubble = { who: 'them' | 'bot'; text: string; en?: string } | null;

interface View {
  index: number;
  stepIndex: number;
  phase: 'enter' | 'talk' | 'react' | 'leave' | 'done';
  bubble: Bubble;
  made: MadeItem[];
  packed: boolean;
  reaction: Reaction | null;
  tips: number;
}

const START: View = { index: 0, stepIndex: -1, phase: 'enter', bubble: null, made: [], packed: false, reaction: null, tips: 0 };

export function ShopScene({ results, startAt = 0, showText, onDone, onHotFix, autoPlay = true, place = 'noodles' }: {
  /** Place id: sets the shop sign and how happy customers react. */
  place?: string;
  results: CustomerResult[];
  startAt?: number;
  showText: boolean;
  onDone?: () => void;
  /** Pause and fix a rule; the scene resumes from the current customer with the new results. */
  onHotFix?: (fromIndex: number) => void;
  autoPlay?: boolean;
}) {
  const [view, setView] = useState<View>({ ...START, index: startAt });
  const [playing, setPlaying] = useState(autoPlay);
  const [fast, setFast] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const canSpeak = useChineseVoice();

  const live = useRef({ playing, fast, results, cancelled: false });
  live.current.playing = playing;
  live.current.fast = fast;
  live.current.results = results;

  useEffect(() => {
    live.current.cancelled = false;
    if (autoPlay) setPlaying(true); // also resumes after a hot-fix hands in new results
    let stopped = false;
    const alive = () => !stopped && !live.current.cancelled;
    const pauseGate = async () => {
      while (alive() && !live.current.playing) await new Promise((r) => setTimeout(r, 120));
    };
    const wait = async (ms: number) => {
      await pauseGate();
      await new Promise((r) => setTimeout(r, live.current.fast ? ms / 3 : ms));
      await pauseGate();
    };
    const say = async (text: string, r: CustomerResult, who: 'them' | 'bot', en?: string) => {
      await pauseGate();
      if (!alive()) return;
      setRevealed(false);
      setView((v) => ({ ...v, bubble: { who, text, en } }));
      if (canSpeak && !live.current.fast) {
        const voice = who === 'bot' ? BOT_VOICE : { rate: rateForSpeed(r.customer.type.dials.speed), pitch: r.customer.type.pitch };
        await speaker.speak(text, voice);
        await wait(250);
      } else {
        await wait(700 + 110 * text.length);
      }
    };

    (async () => {
      let tips = view.tips;
      for (let i = view.index; i < live.current.results.length && alive(); i++) {
        const r = live.current.results[i];
        setView((v) => ({ ...v, index: i, stepIndex: -1, phase: 'enter', bubble: null, made: [], packed: false, reaction: null }));
        await wait(700);
        setView((v) => ({ ...v, phase: 'talk' }));
        for (let s = 0; s < r.steps.length && alive(); s++) {
          // Re-read in case a hot-fix replaced this customer's result.
          const step = live.current.results[i].steps[s] ?? r.steps[s];
          setView((v) => ({ ...v, stepIndex: s }));
          await say(step.utterance.text, r, 'them', step.utterance.en);
          for (const line of step.said) await say(line, r, 'bot');
          if (!step.said.length && !step.heard) {
            setView((v) => ({ ...v, bubble: { who: 'bot', text: '……' } }));
            await wait(900);
          }
          setView((v) => ({ ...v, made: step.made, packed: step.packed }));
          await wait(400);
        }
        if (!alive()) return;
        const reaction = reactionFor(live.current.results[i].failures, place);
        if (live.current.results[i].failures.length === 0) tips++;
        setView((v) => ({ ...v, phase: 'react', bubble: { who: 'them', text: reaction.says }, reaction, tips }));
        if (canSpeak && !live.current.fast) await speaker.speak(reaction.says, { rate: rateForSpeed(r.customer.type.dials.speed), pitch: r.customer.type.pitch });
        await wait(1300);
        setView((v) => ({ ...v, phase: 'leave', bubble: null }));
        await wait(600);
      }
      if (alive()) {
        setView((v) => ({ ...v, phase: 'done', bubble: null }));
        onDone?.();
      }
    })();

    return () => {
      stopped = true;
      speaker.cancel();
    };
    // Restart only when a new run or a hot-fix starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, startAt]);

  const togglePlay = () => {
    if (playing) speaker.cancel();
    setPlaying(!playing);
  };

  const r = results[view.index];
  const hideThem = view.bubble?.who === 'them' && view.phase === 'talk' && !showText && !revealed && canSpeak;

  return (
    <div className="scene-wrap">
      <div className="scene" aria-live="polite">
        <div className="wall">
          <span className="sign"><Zh text={content.places.find((p) => p.id === place)?.sign ?? '面馆'} /></span>
          <span className="tips">🪙 {view.tips}</span>
        </div>
        <div className="robot">🤖</div>
        {r && view.phase !== 'done' && (
          <div className={`guest ${view.phase} ${view.reaction?.anim ?? ''}`}>
            <span className="guest-face">{view.phase === 'react' && view.reaction ? view.reaction.face : AVATAR[r.customer.type.id] ?? '🙂'}</span>
            {view.reaction?.anim === 'fan' && view.phase === 'react' && <span className="fan">🪭</span>}
            <span className="guest-name"><Zh text={r.customer.type.name} /></span>
          </div>
        )}
        {view.bubble && (
          <button
            type="button"
            className={`bubble ${view.bubble.who}`}
            onClick={() => setRevealed(true)}
            aria-label={hideThem ? 'Show what they said' : undefined}
          >
            {hideThem ? (
              '🔊 ～～～'
            ) : (
              <>
                <Zh text={view.bubble.text} />
                {view.bubble.en && <small className="bubble-en">{view.bubble.en}</small>}
              </>
            )}
          </button>
        )}
        <div className="counter">
          <CounterFood made={view.made} packed={view.packed} />
        </div>
        {view.phase === 'react' && view.reaction && <div className="reaction-en">{view.reaction.en}</div>}
        {view.phase === 'done' && <div className="closed"><Zh text="打烊了 · Closed for lunch" /></div>}
      </div>

      <div className="scene-controls">
        <button type="button" className="btn small" onClick={togglePlay} disabled={view.phase === 'done'}>
          {playing ? <Pause size={16} /> : <Play size={16} />} <Zh text={playing ? '暂停' : '继续'} />
        </button>
        <button type="button" className={`btn small ${fast ? 'on' : ''}`} onClick={() => setFast(!fast)} aria-pressed={fast}>
          <FastForward size={16} /> <Zh text="快" />
        </button>
        {onHotFix && view.phase !== 'done' && (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setPlaying(false);
              speaker.cancel();
              onHotFix(view.index);
            }}
          >
            <Wrench size={16} /> <Zh text="改规则 Fix" />
          </button>
        )}
        {view.phase !== 'done' && (
          <button
            type="button"
            className="btn small ghost"
            onClick={() => {
              live.current.cancelled = true;
              speaker.cancel();
              setView((v) => ({ ...v, phase: 'done', bubble: null }));
              onDone?.();
            }}
          >
            <SkipForward size={16} /> Skip
          </button>
        )}
        <span className="muted scene-count">
          {Math.min(view.index + 1, results.length)}/{results.length}
        </span>
      </div>
    </div>
  );
}
