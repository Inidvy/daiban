// Block script editor: tap-to-place (docs/design.md, "Input modes"). Tap a row to select it and get
// its tools; tap a word to open its why card; tap a dashed button to add a block there.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, CornerDownRight, Plus, Trash2, Volume2 } from 'lucide-react';
import { moveBlock, removeBlock, setElse } from '../editor.ts';
import type { Block, Place } from '../editor.ts';
import { ELSE_DAY, spokenText } from '../palette.ts';
import { speaker, TEACHER_VOICE } from './speech.ts';
import { BlockLine, Tokens, Zh } from './words.tsx';

interface Props {
  blocks: Block[];
  day: number;
  onChange: (blocks: Block[]) => void;
  onAddAt: (place: Place) => void;
  readOnly?: boolean;
}

export function ScriptEditor(props: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const ctx = { ...props, selected, setSelected };
  return (
    <div className="script">
      <div className="script-header">
        <Tokens text="客人说" /> <span className="arrow">→</span> <Tokens text="听" />
      </div>
      <BlockList list={props.blocks} place={{ parentId: null, branch: 'then' }} ctx={ctx} />
      {!props.readOnly && (
        <AddButton onClick={() => props.onAddAt({ parentId: null, branch: 'then' })}>
          <Zh text="如果…" /> <small>add a rule</small>
        </AddButton>
      )}
      {props.blocks.length === 0 && !props.readOnly && (
        <p className="hint">Empty script: the bot ignores everyone. Add a rule for what customers say.</p>
      )}
    </div>
  );
}

type Ctx = Props & { selected: string | null; setSelected: (id: string | null) => void };

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="add-btn" onClick={onClick}>
      <Plus size={16} /> {children}
    </button>
  );
}

function BlockList({ list, place, ctx }: { list: Block[]; place: Place; ctx: Ctx }) {
  return (
    <>
      {list.map((b, i) => (
        <BlockView key={b.id} block={b} first={i === 0} last={i === list.length - 1} parentPlace={place} ctx={ctx} />
      ))}
    </>
  );
}

function BlockView({ block, first, last, ctx }: { block: Block; first: boolean; last: boolean; parentPlace: Place; ctx: Ctx }) {
  const isSelected = ctx.selected === block.id;
  const empty = block.kind === 'if' && block.then.length === 0;
  const change = (next: Block[]) => {
    ctx.onChange(next);
  };

  const row = (
    <div
      className={`row ${block.kind === 'if' ? 'rule' : 'action'} ${isSelected ? 'selected' : ''} ${empty ? 'warn' : ''}`}
      onClick={() => !ctx.readOnly && ctx.setSelected(isSelected ? null : block.id)}
    >
      {block.kind === 'do' && <span className="jiu"><Zh text="就" /></span>}
      <BlockLine block={block} />
      <button
        type="button"
        className="icon-btn speak"
        aria-label="Read aloud"
        onClick={(e) => {
          e.stopPropagation();
          void speaker.speak(spokenText(block), TEACHER_VOICE);
        }}
      >
        <Volume2 size={18} />
      </button>
    </div>
  );

  const tools = isSelected && !ctx.readOnly && (
    <div className="tools">
      <button type="button" className="tool" disabled={first} onClick={() => change(moveBlock(ctx.blocks, block.id, -1))}>
        <ArrowUp size={16} /> <Zh text="上" />
      </button>
      <button type="button" className="tool" disabled={last} onClick={() => change(moveBlock(ctx.blocks, block.id, 1))}>
        <ArrowDown size={16} /> <Zh text="下" />
      </button>
      {block.kind === 'if' && block.else === null && ctx.day >= ELSE_DAY && (
        <button type="button" className="tool" onClick={() => change(setElse(ctx.blocks, block.id, true))}>
          <CornerDownRight size={16} /> <Zh text="不然" />
        </button>
      )}
      <button
        type="button"
        className="tool danger"
        onClick={() => {
          ctx.setSelected(null);
          change(removeBlock(ctx.blocks, block.id));
        }}
      >
        <Trash2 size={16} /> <Zh text="删" />
      </button>
    </div>
  );

  if (block.kind === 'do') {
    return (
      <>
        {row}
        {tools}
      </>
    );
  }

  return (
    <div className="rule-group">
      {row}
      {tools}
      {empty && <p className="hint warn-text"><Zh text="This 如果 does nothing yet: add a 就 line." /></p>}
      <div className="body">
        <BlockList list={block.then} place={{ parentId: block.id, branch: 'then' }} ctx={ctx} />
        {!ctx.readOnly && (
          <AddButton onClick={() => ctx.onAddAt({ parentId: block.id, branch: 'then' })}>
            <Zh text="就…" /> <small>then</small>
          </AddButton>
        )}
      </div>
      {block.else && (
        <>
          <div className="row else-row">
            <span className="line">
              <Tokens text="不然" />
            </span>
            {!ctx.readOnly && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove 不然"
                onClick={() => change(setElse(ctx.blocks, block.id, false))}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <div className="body">
            <BlockList list={block.else} place={{ parentId: block.id, branch: 'else' }} ctx={ctx} />
            {!ctx.readOnly && (
              <AddButton onClick={() => ctx.onAddAt({ parentId: block.id, branch: 'else' })}>
                <Zh text="就…" /> <small>otherwise</small>
              </AddButton>
            )}
          </div>
        </>
      )}
    </div>
  );
}
