// Lunch rush (text + audio for now; the 2D scene is M3) and the night review.
// Audio first: customer lines are spoken, their text stays hidden until asked for.

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Play, Square, Star, Volume2 } from 'lucide-react';
import type { CustomerResult, DayResult } from '../simulation.ts';
import { BOT_VOICE, rateForSpeed, speaker, TEACHER_VOICE, useChineseVoice } from './speech.ts';
import type { Voice } from './speech.ts';
import { Tokens } from './words.tsx';

function voiceFor(r: CustomerResult, who: '客人' | '机器人'): Voice {
  return who === '机器人' ? BOT_VOICE : { rate: rateForSpeed(r.customer.type.dials.speed), pitch: r.customer.type.pitch };
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="stars" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} size={20} className={i < n ? 'on' : 'off'} fill={i < n ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}

export function RushView({ result, onBackToScript }: { result: DayResult; onBackToScript: () => void }) {
  const [showText, setShowText] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState<string | null>(null);
  const stopRef = useRef(false);
  const canSpeak = useChineseVoice();

  useEffect(() => () => {
    stopRef.current = true;
    speaker.cancel();
  }, []);

  const playAll = async () => {
    stopRef.current = false;
    for (const r of result.results) {
      for (let i = 0; i < r.transcript.length; i++) {
        if (stopRef.current) return;
        const t = r.transcript[i];
        setPlaying(`${r.customer.id}.${i}`);
        await speaker.speak(t.text, voiceFor(r, t.who));
      }
    }
    setPlaying(null);
  };
  const stop = () => {
    stopRef.current = true;
    speaker.cancel();
    setPlaying(null);
  };

  const happy = result.results.filter((r) => r.failures.length === 0).length;

  return (
    <div className="rush">
      <div className="summary">
        <div>
          <div className="big">
            满意度 {happy}/{result.results.length}
          </div>
          <div className="muted">
            {result.rules} rules · target {result.day.targetRules} or fewer for ★3
          </div>
        </div>
        <Stars n={result.stars} />
      </div>

      <div className="toolbar">
        {playing ? (
          <button type="button" className="btn primary" onClick={stop}>
            <Square size={16} /> 停 Stop
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={() => void playAll()} disabled={!canSpeak}>
            <Play size={16} /> 听午饭 Play the rush
          </button>
        )}
        {canSpeak && (
          <button type="button" className="btn ghost" onClick={() => setShowText(!showText)}>
            {showText ? <EyeOff size={16} /> : <Eye size={16} />} {showText ? 'Hide text' : 'Show text'}
          </button>
        )}
      </div>
      {!canSpeak && (
        <p className="hint warn-text">
          No Chinese voice on this device, so customers can't speak and their text is shown instead. Open the game in
          Chrome or Edge (they include Chinese voices), or add one in Windows: Settings → Time &amp; language → Speech →
          Add voices → 中文 (简体).
        </p>
      )}

      {result.results.map((r) => (
        <article key={r.customer.id} className={`customer ${r.failures.length ? 'bad' : 'good'}`}>
          <header>
            <strong>
              #{r.customer.id} {r.customer.type.name}
            </strong>{' '}
            <span className="muted">{r.customer.type.en}</span>
            <span className="verdict">{r.failures.length ? '✗' : '✓'}</span>
          </header>
          {r.transcript.map((t, i) => {
            const key = `${r.customer.id}.${i}`;
            const hidden = t.who === '客人' && !showText && !revealed.has(key) && canSpeak;
            return (
              <div key={key} className={`turn ${t.who === '客人' ? 'them' : 'bot'} ${playing === key ? 'playing' : ''}`}>
                <span className="who">{t.who}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Play"
                  onClick={() => void speaker.speak(t.text, voiceFor(r, t.who))}
                >
                  <Volume2 size={16} />
                </button>
                {hidden ? (
                  <button type="button" className="hidden-text" onClick={() => setRevealed(new Set(revealed).add(key))}>
                    字 show
                  </button>
                ) : (
                  <span className="said">
                    <Tokens text={t.text} />
                  </span>
                )}
              </div>
            );
          })}
          {r.failures.map((f, i) => (
            <p key={i} className="failure">
              {f.reason}
            </p>
          ))}
        </article>
      ))}

      <button type="button" className="btn ghost wide" onClick={onBackToScript}>
        Fix the script 改规则
      </button>
    </div>
  );
}

export function ReviewView({ result }: { result: DayResult | null }) {
  if (!result) return <p className="hint">Run a lunch rush first. Every sentence the bot got wrong ends up here.</p>;
  if (result.review.length === 0) {
    return <p className="hint">没有错 Nothing went wrong today. Every customer left happy.</p>;
  }
  return (
    <div className="review">
      <p className="hint">Listen, then say each sentence aloud once.</p>
      {result.review.map((item) => (
        <div key={item.text} className="review-item">
          <button type="button" className="icon-btn" aria-label="Play" onClick={() => void speaker.speak(item.text, TEACHER_VOICE)}>
            <Volume2 size={20} />
          </button>
          <div>
            <div className="review-text">
              <Tokens text={item.text} />
              {item.count > 1 && <span className="muted"> ×{item.count}</span>}
            </div>
            <div className="muted">{item.pinyin}</div>
            <div className="muted">{item.en}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
