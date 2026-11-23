// Editor model for the block script editor: a tree of blocks with stable ids, one action per
// action block. Pure functions only, so the UI just swaps in the returned tree.

import type { Action, Condition, IfStmt, Script, Stmt } from './script.ts';

export type Block =
  | { id: string; kind: 'if'; cond: Condition; then: Block[]; else: Block[] | null }
  | { id: string; kind: 'do'; action: Action };

/** A block without ids, as it comes from the palette. */
export type BlockTemplate = { kind: 'if'; cond: Condition } | { kind: 'do'; action: Action };

/** Where to put a block: the top level (parentId null) or a 如果's then/else body. */
export interface Place {
  parentId: string | null;
  branch: 'then' | 'else';
}

// Random part keeps ids unique across page reloads (blocks are saved in the browser).
const session = Math.random().toString(36).slice(2, 8);
let nextId = 1;
export function newId(): string {
  return `b${session}${nextId++}`;
}

export function fromTemplate(t: BlockTemplate): Block {
  return t.kind === 'if'
    ? { id: newId(), kind: 'if', cond: t.cond, then: [], else: null }
    : { id: newId(), kind: 'do', action: t.action };
}

export function fromScript(script: Script): Block[] {
  const convert = (stmts: readonly Stmt[]): Block[] =>
    stmts.flatMap((s): Block[] =>
      s.kind === 'do'
        ? s.actions.map((action) => ({ id: newId(), kind: 'do', action }))
        : [{ id: newId(), kind: 'if', cond: s.cond, then: convert(s.then), else: s.else ? convert(s.else) : null }],
    );
  return convert(script.body);
}

/**
 * Builds a runnable script. Line numbers match printScript(toScript(blocks)), with the header on line 1.
 * A 如果 with nothing in it is left out (the parser would reject it).
 */
export function toScript(blocks: readonly Block[]): Script {
  let line = 1;
  const convert = (list: readonly Block[]): Stmt[] => {
    const out: Stmt[] = [];
    for (const b of list) {
      if (b.kind === 'do') {
        out.push({ kind: 'do', actions: [b.action], line: ++line });
        continue;
      }
      if (b.then.length === 0) continue;
      const stmt: IfStmt = { kind: 'if', cond: b.cond, then: [], line: ++line };
      stmt.then = convert(b.then);
      if (b.else && b.else.length) {
        line++; // the 不然 line
        stmt.else = convert(b.else);
      }
      out.push(stmt);
    }
    return out;
  };
  return { body: convert(blocks) };
}

/** 如果 blocks with an empty body, which toScript leaves out. */
export function emptyRules(blocks: readonly Block[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly Block[]) => {
    for (const b of list) {
      if (b.kind !== 'if') continue;
      if (b.then.length === 0) out.push(b.id);
      walk(b.then);
      if (b.else) walk(b.else);
    }
  };
  walk(blocks);
  return out;
}

/** Applies fn to every block list in the tree (top level, each then, each else), bottom-up safe. */
function mapLists(
  blocks: Block[],
  fn: (list: Block[], place: Place) => Block[],
  place: Place = { parentId: null, branch: 'then' },
): Block[] {
  return fn(blocks, place).map((b): Block =>
    b.kind !== 'if'
      ? b
      : {
          ...b,
          then: mapLists(b.then, fn, { parentId: b.id, branch: 'then' }),
          else: b.else ? mapLists(b.else, fn, { parentId: b.id, branch: 'else' }) : null,
        },
  );
}

const samePlace = (a: Place, b: Place) =>
  a.parentId === b.parentId && (a.parentId === null || a.branch === b.branch);

export function insertBlock(blocks: Block[], place: Place, block: Block, index?: number): Block[] {
  return mapLists(blocks, (list, p) => {
    if (!samePlace(p, place)) return list;
    const at = index ?? list.length;
    return [...list.slice(0, at), block, ...list.slice(at)];
  });
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return mapLists(blocks, (list) => list.filter((b) => b.id !== id));
}

export function moveBlock(blocks: Block[], id: string, delta: -1 | 1): Block[] {
  return mapLists(blocks, (list) => {
    const i = list.findIndex((b) => b.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const copy = [...list];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });
}

/** Adds an empty 不然 to a 如果 (on = true) or removes it with its contents. */
export function setElse(blocks: Block[], id: string, on: boolean): Block[] {
  return mapLists(blocks, (list) =>
    list.map((b) => (b.id === id && b.kind === 'if' ? { ...b, else: on ? (b.else ?? []) : null } : b)),
  );
}

export function findBlock(blocks: readonly Block[], id: string): Block | undefined {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.kind === 'if') {
      const hit = findBlock(b.then, id) ?? (b.else ? findBlock(b.else, id) : undefined);
      if (hit) return hit;
    }
  }
  return undefined;
}
