// Turns a parsed script back into text, in the same format parseScript reads.

import type { Action, Condition, Script, Stmt } from './script.ts';

export const SCRIPT_HEADER = '客人说 → 听';
const INDENT = '    ';

export function printCondition(c: Condition): string {
  return c.kind === '听到' || c.kind === '没听到' ? `${c.kind} "${c.template}"` : `${c.kind} ${c.item}`;
}

export function printAction(a: Action): string {
  switch (a.kind) {
    case '做':
      return `${a.again ? '再 ' : ''}${a.verb ?? '做'} ${a.what}`;
    case '说':
      return `说 "${a.text}"`;
    case '收钱':
      return a.method ? `收钱 ${a.method}` : '收钱';
    case '上菜':
    case '打包':
      return a.kind;
  }
}

function printActions(actions: Action[], firstInBody: boolean): string {
  const parts = actions.map(printAction);
  if (firstInBody) return `就 ${parts.join('，然后 ')}`;
  return parts.length === 2 ? `先 ${parts[0]}，然后 ${parts[1]}` : parts.join('，');
}

function printBlock(stmts: readonly Stmt[], depth: number, out: string[]): void {
  const pad = INDENT.repeat(depth);
  stmts.forEach((s, i) => {
    if (s.kind === 'do') {
      out.push(pad + printActions(s.actions, depth > 0 && i === 0));
      return;
    }
    out.push(`${pad}如果 ${printCondition(s.cond)}`);
    printBlock(s.then, depth + 1, out);
    if (s.else) {
      out.push(`${pad}不然`);
      printBlock(s.else, depth + 1, out);
    }
  });
}

export function printScript(script: Script): string {
  const out = [SCRIPT_HEADER];
  printBlock(script.body, 0, out);
  return `${out.join('\n')}\n`;
}
