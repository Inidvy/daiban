// Tappable Chinese text: every known word and slot opens its why card.

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { segment } from '../content.ts';
import type { Block, BlockTemplate } from '../editor.ts';
import { SLOT_INFO } from '../palette.ts';
import type { SlotType, Word } from '../types.ts';
import { content, wordByHanzi } from './content.ts';

export type WhyTarget = { kind: 'word'; word: Word } | { kind: 'slot'; slot: SlotType };

export interface WordUi {
  openWhy: (target: WhyTarget) => void;
  showPinyin: boolean;
}

export const WordContext = createContext<WordUi>({ openWhy: () => {}, showPinyin: false });

export function whyKey(t: WhyTarget): string {
  return t.kind === 'word' ? t.word.hanzi : `[${t.slot}]`;
}

/** Every word and slot in a piece of script text, in order, without repeats. */
export function whyTargets(text: string): WhyTarget[] {
  const out: WhyTarget[] = [];
  const seen = new Set<string>();
  const add = (t: WhyTarget) => {
    const k = whyKey(t);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  };
  for (const piece of text.split(/(\[[^\]]*\])/)) {
    const slot = piece.match(/^\[([^\]]*)\]$/)?.[1] as SlotType | undefined;
    if (slot && slot in SLOT_INFO) add({ kind: 'slot', slot });
    else for (const t of segment(piece, content.words)) if (t.word) add({ kind: 'word', word: t.word });
  }
  return out;
}

function WordButton({ word, className }: { word: Word; className?: string }) {
  const { openWhy, showPinyin } = useContext(WordContext);
  return (
    <button
      type="button"
      className={`word ${className ?? ''}`}
      onClick={(e) => {
        e.stopPropagation();
        openWhy({ kind: 'word', word });
      }}
    >
      {showPinyin ? (
        <ruby>
          {word.hanzi}
          <rt>{word.pinyin}</rt>
        </ruby>
      ) : (
        word.hanzi
      )}
    </button>
  );
}

function SlotButton({ slot }: { slot: SlotType }) {
  const { openWhy, showPinyin } = useContext(WordContext);
  return (
    <button
      type="button"
      className="slot"
      onClick={(e) => {
        e.stopPropagation();
        openWhy({ kind: 'slot', slot });
      }}
    >
      {showPinyin ? (
        <ruby>
          {slot}
          <rt>{SLOT_INFO[slot].pinyin}</rt>
        </ruby>
      ) : (
        slot
      )}
    </button>
  );
}

/** Text with slots, e.g. 我要 [数量][量词][东西]. */
export function Tokens({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  text.split(/(\[[^\]]*\])/).forEach((piece, i) => {
    const slot = piece.match(/^\[([^\]]*)\]$/)?.[1] as SlotType | undefined;
    if (slot && slot in SLOT_INFO) {
      nodes.push(<SlotButton key={i} slot={slot} />);
      return;
    }
    segment(piece.replace(/\s+/g, ''), content.words).forEach((t, j) => {
      nodes.push(t.word ? <WordButton key={`${i}.${j}`} word={t.word} /> : <span key={`${i}.${j}`}>{t.text}</span>);
    });
  });
  return <>{nodes}</>;
}

/** A keyword chip (如果, 听到, 做 …) that also opens its why card. */
function Keyword({ hanzi, kind }: { hanzi: string; kind: 'kw' | 'sense' | 'verb' }) {
  const word = wordByHanzi.get(hanzi);
  if (!word) return <span className={`chip ${kind}`}>{hanzi}</span>;
  return <WordButton word={word} className={`chip ${kind}`} />;
}

/** One block as a row of chips: [如果] [听到] [“我要 [数量][量词][东西]”]. */
export function BlockLine({ block }: { block: Block | BlockTemplate }) {
  if (block.kind === 'if') {
    const c = block.cond;
    const quoted = c.kind === '听到' || c.kind === '没听到';
    return (
      <span className="line">
        <Keyword hanzi="如果" kind="kw" />
        <Keyword hanzi={c.kind === '没听到' ? '听到' : c.kind} kind="sense" />
        <span className={quoted ? 'quote' : 'obj'}>
          <Tokens text={quoted ? c.template : c.item} />
        </span>
      </span>
    );
  }
  const a = block.action;
  switch (a.kind) {
    case '做':
      return (
        <span className="line">
          {a.again && <Keyword hanzi="再" kind="verb" />}
          <Keyword hanzi="做" kind="verb" />
          <span className="obj">
            <Tokens text={a.what} />
          </span>
        </span>
      );
    case '说':
      return (
        <span className="line">
          <Keyword hanzi="说" kind="verb" />
          <span className="quote">
            <Tokens text={a.text} />
          </span>
        </span>
      );
    case '收钱':
      return (
        <span className="line">
          <Keyword hanzi="收钱" kind="verb" />
          {a.method && (
            <span className="obj">
              <Tokens text={a.method} />
            </span>
          )}
        </span>
      );
    default:
      return (
        <span className="line">
          <Keyword hanzi={a.kind} kind="verb" />
        </span>
      );
  }
}
