// Lunch rush: the scene plays first; the summary and the full log appear when the shop closes.
// Night review: every misunderstood sentence with audio, pinyin, English and a replay of what went wrong.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Eye, EyeOff, RotateCcw, Star, Volume2 } from 'lucide-react';
import type { CustomerResult, DayResult, ReviewItem } from '../simulation.ts';
import { ShopScene } from './scene.tsx';
import { Sheet } from './sheet.tsx';
import { BOT_VOICE, rateForSpeed, speaker, TEACHER_VOICE, useChineseVoice } from './speech.ts';
import type { Voice } from './speech.ts';
import { Tokens, Zh } from './words.tsx';

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

export function RushView({ result, startAt, done, onDone, onHotFix, onBackToScript, summaryExtra }: {
  result: DayResult;
  startAt: number;
  done: boolean;
  onDone: () => void;
  onHotFix: (fromIndex: number) => void;
  onBackToScript: () => void;
  /** Extra lines under the summary (e.g. the 代班 bonus). */
  summaryExtra?: ReactNode;
}) {
  // Text and pinyin are shown from the start; hiding them is an optional challenge.
  const [showText, setShowText] = useState(true);
  const canSpeak = useChineseVoice();
  const happy = result.results.filter((r) => r.failures.length === 0).length;

  return (
    <div className="rush">
      <ShopScene results={result.results} startAt={startAt} showText={showText || !canSpeak} onDone={onDone} onHotFix={onHotFix} />

      <div className="toolbar">
        {canSpeak && (
          <button type="button" className="btn ghost small" onClick={() => setShowText(!showText)}>
            {showText ? <EyeOff size={16} /> : <Eye size={16} />} {showText ? 'Hide text' : 'Show text'}
          </button>
        )}
      </div>
      {!canSpeak && <NoVoiceHint />}

      {done && (
        <>
          <div className="summary">
            <div>
              <div className="big">
                <Zh text="满意度" /> {happy}/{result.results.length}
              </div>
              <div className="muted">
                {result.rules} rules · target {result.day.targetRules} or fewer for ★3
              </div>
              {summaryExtra}
            </div>
            <Stars n={result.stars} />
          </div>

          <h3 className="section-title"><Zh text="记录 Log" /></h3>
          {result.results.map((r) => (
            <CustomerLog key={r.customer.id} r={r} showText={showText || !canSpeak} />
          ))}
          <button type="button" className="btn ghost wide" onClick={onBackToScript}>
            <Zh text="Fix the script 改规则" />
          </button>
        </>
      )}
    </div>
  );
}

export function NoVoiceHint() {
  return (
    <p className="hint warn-text">
      No Chinese voice on this device, so customers can't speak and their text is shown instead. Open the game in Chrome
      or Edge (they include Chinese voices), or add one in Windows: Settings → Time &amp; language → Speech → Add voices →
      中文 (简体).
    </p>
  );
}

function CustomerLog({ r, showText }: { r: CustomerResult; showText: boolean }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  return (
    <article className={`customer ${r.failures.length ? 'bad' : 'good'}`}>
      <header>
        <strong>
          #{r.customer.id} {r.customer.type.name}
        </strong>{' '}
        <span className="muted">{r.customer.type.en}</span>
        <span className="verdict">{r.failures.length ? '✗' : '✓'}</span>
      </header>
      {r.transcript.map((t, i) => {
        const hidden = t.who === '客人' && !showText && !revealed.has(i);
        return (
          <div key={i} className={`turn ${t.who === '客人' ? 'them' : 'bot'}`}>
            <span className="who"><Zh text={t.who} /></span>
            <button type="button" className="icon-btn" aria-label="Play" onClick={() => void speaker.speak(t.text, voiceFor(r, t.who))}>
              <Volume2 size={16} />
            </button>
            {hidden ? (
              <button type="button" className="hidden-text" onClick={() => setRevealed(new Set(revealed).add(i))}>
                <Zh text="字 show" />
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
  );
}

/** One review sentence. `extra` is where speaking practice and the tone mirror plug in. */
export function ReviewCard({ item, result, extra }: { item: ReviewItem; result: DayResult; extra?: ReactNode }) {
  const [replay, setReplay] = useState<CustomerResult | null>(null);
  const first = result.results.find((r) => r.customer.id === item.misses[0]?.customerId);
  return (
    <div className="review-item">
      <button type="button" className="icon-btn" aria-label="Play" onClick={() => void speaker.speak(item.text, TEACHER_VOICE)}>
        <Volume2 size={20} />
      </button>
      <div className="review-main">
        <div className="review-text">
          <Tokens text={item.text} />
          {item.count > 1 && <span className="muted"> ×{item.count}</span>}
        </div>
        <div className="muted">{item.pinyin}</div>
        <div className="muted">{item.en}</div>
        <p className="failure">{item.misses[0]?.reason}</p>
        <div className="review-actions">
          {first && (
            <button type="button" className="btn small ghost" onClick={() => setReplay(first)}>
              <RotateCcw size={16} /> <Zh text="回放 Replay" />
            </button>
          )}
          {extra}
        </div>
      </div>
      {replay && (
        <Sheet title={`回放 Replay · #${replay.customer.id} ${replay.customer.type.name}`} onClose={() => setReplay(null)}>
          <ShopScene results={[replay]} showText />
        </Sheet>
      )}
    </div>
  );
}

export function ReviewList({ result, renderExtra }: { result: DayResult | null; renderExtra?: (item: ReviewItem) => ReactNode }) {
  if (!result) return <p className="hint">Run a lunch rush first. Every sentence the bot got wrong ends up here.</p>;
  if (result.review.length === 0) return <p className="hint"><Zh text="没有错 Nothing went wrong today. Every customer left happy." /></p>;
  return (
    <div className="review">
      <p className="hint">Listen, then say each sentence aloud once.</p>
      {result.review.map((item) => (
        <ReviewCard key={item.text} item={item} result={result} extra={renderExtra?.(item)} />
      ))}
    </div>
  );
}
