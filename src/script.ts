// Parser for the Chinese logic language (docs/design.md, "Chinese logic language").
//
//   如果 听到 "我要 [数量][量词][东西]"     condition: 听到 / 没听到 "pattern", 有 / 没有 [东西]
//       就 做 [数量][量词][东西]           body lines are indented; 就 is optional
//       先 上菜，然后 说 "请慢用"            several actions: 先 A，然后 B (or A，B)
//   不然                                    otherwise-branch of the 如果 right above it
//       就 说 "没有了"
//
// Actions: 说 / 问 "text", 做 …, 再 做 …, 收钱 [扫码|现金], 上菜, 打包.

import { parseTemplate } from './matcher.ts';
import type { PayMethod } from './types.ts';

export type Condition =
  | { kind: '听到'; template: string }
  | { kind: '没听到'; template: string }
  | { kind: '有'; item: string }
  | { kind: '没有'; item: string };

export type Action =
  /** verb 给 (give) words it for shops; the bot does the same thing. */
  | { kind: '做'; what: string; again: boolean; verb?: '给' }
  | { kind: '说'; text: string }
  | { kind: '收钱'; method?: PayMethod }
  | { kind: '上菜' }
  | { kind: '打包' };

export interface IfStmt {
  kind: 'if';
  cond: Condition;
  then: Stmt[];
  else?: Stmt[];
  line: number;
}
export interface DoStmt {
  kind: 'do';
  actions: Action[];
  line: number;
}
export type Stmt = IfStmt | DoStmt;

export interface Script {
  body: Stmt[];
}

export class ScriptError extends Error {
  line: number;
  constructor(line: number, message: string) {
    super(`第${line}行 (line ${line}): ${message}`);
    this.name = 'ScriptError';
    this.line = line;
  }
}

interface Line {
  no: number;
  indent: number;
  text: string;
}

function toLines(source: string): Line[] {
  const lines: Line[] = [];
  source.split(/\r?\n/).forEach((raw, idx) => {
    const text = raw.trim();
    if (!text || text.startsWith('客人说')) return; // header line "客人说 → 听"
    let indent = 0;
    for (const ch of raw) {
      if (ch === ' ') indent += 1;
      else if (ch === '\t') indent += 4;
      else if (ch === '　') indent += 2; // full-width space from Chinese keyboards
      else break;
    }
    lines.push({ no: idx + 1, indent, text });
  });
  return lines;
}

const QUOTE_OPEN = '"“「';
const QUOTE_CLOSE: Record<string, string> = { '"': '"', '“': '”', '「': '」' };

/** Reads a quoted string at the start of `text`. */
function readQuoted(text: string, line: number): { value: string; rest: string } {
  const open = text[0];
  if (!open || !QUOTE_OPEN.includes(open)) throw new ScriptError(line, `expected "…" here: ${text || '(nothing)'}`);
  const close = text.indexOf(QUOTE_CLOSE[open], 1);
  if (close < 0) throw new ScriptError(line, 'missing closing quote');
  return { value: text.slice(1, close), rest: text.slice(close + 1).trim() };
}

/** Splits "先 A，然后 B" into ["A", "B"], ignoring separators inside quotes. */
function splitActions(text: string): string[] {
  const pieces: string[] = [];
  let current = '';
  let closeQuote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (closeQuote) {
      if (ch === closeQuote) closeQuote = null;
      current += ch;
    } else if (QUOTE_OPEN.includes(ch)) {
      closeQuote = QUOTE_CLOSE[ch];
      current += ch;
    } else if (ch === '，' || ch === ',' || ch === '；' || ch === ';') {
      pieces.push(current);
      current = '';
    } else if (text.startsWith('然后', i)) {
      pieces.push(current);
      current = '';
      i += 1;
    } else {
      current += ch;
    }
  }
  pieces.push(current);
  return pieces
    .map((p) => p.trim().replace(/^先\s*/, '').trim())
    .filter((p) => p.length > 0);
}

function parseAction(piece: string, line: number): Action {
  let text = piece;
  let again = false;
  if (text.startsWith('再')) {
    again = true;
    text = text.slice(1).trim();
  }
  const rest = (word: string) => text.slice(word.length).trim();

  if (text.startsWith('做')) {
    const what = rest('做');
    if (!what) throw new ScriptError(line, '做 what? e.g. 做 [数量][量词][东西]');
    return { kind: '做', what, again };
  }
  if (text.startsWith('给') && !again) {
    const what = rest('给');
    if (!what) throw new ScriptError(line, '给 what? e.g. 给 [数量][量词][东西]');
    return { kind: '做', what, again, verb: '给' };
  }
  if (again) throw new ScriptError(line, '再 only works with 做 (再 做 一个)');
  if (text.startsWith('说') || text.startsWith('问')) {
    const { value, rest: after } = readQuoted(rest(text[0]), line);
    if (after) throw new ScriptError(line, `unexpected text after the quote: ${after}`);
    return { kind: '说', text: value };
  }
  if (text.startsWith('收钱')) {
    const method = rest('收钱');
    if (!method) return { kind: '收钱' };
    if (method === '扫码' || method === '现金') return { kind: '收钱', method };
    throw new ScriptError(line, `收钱 takes 扫码 or 现金, not ${method}`);
  }
  if (text === '上菜') return { kind: '上菜' };
  if (text === '打包') return { kind: '打包' };
  throw new ScriptError(line, `不懂 "${piece}": unknown action (known: 说, 问, 做, 给, 再 做, 收钱, 上菜, 打包)`);
}

function parseActionLine(text: string, line: number): DoStmt {
  const body = text.replace(/^就\s*/, '');
  const actions = splitActions(body).map((p) => parseAction(p, line));
  if (actions.length === 0) throw new ScriptError(line, '就 what? Add an action after 就');
  return { kind: 'do', actions, line };
}

function checkTemplate(template: string, line: number): void {
  try {
    parseTemplate(template);
  } catch (e) {
    throw new ScriptError(line, (e as Error).message);
  }
}

/** Parses the text after 如果. `inline` is a same-line "就 …" part, if any. */
function parseCondition(text: string, line: number): { cond: Condition; inline: string } {
  for (const kind of ['没听到', '听到'] as const) {
    if (text.startsWith(kind)) {
      const { value, rest } = readQuoted(text.slice(kind.length).trim(), line);
      checkTemplate(value, line);
      if (rest && !rest.startsWith('就')) throw new ScriptError(line, `expected 就 after the pattern, found: ${rest}`);
      return { cond: { kind, template: value }, inline: rest };
    }
  }
  for (const kind of ['没有', '有'] as const) {
    if (text.startsWith(kind)) {
      const after = text.slice(kind.length);
      const jiu = after.indexOf('就');
      const item = (jiu < 0 ? after : after.slice(0, jiu)).trim();
      if (!item) throw new ScriptError(line, `${kind} what? e.g. ${kind} [东西]`);
      checkTemplate(item, line);
      return { cond: { kind, item }, inline: jiu < 0 ? '' : after.slice(jiu).trim() };
    }
  }
  throw new ScriptError(line, `如果 what? Use 听到 "…", 没听到 "…", 有 [东西] or 没有 [东西]`);
}

export function parseScript(source: string): Script {
  const lines = toLines(source);
  let i = 0;

  function parseBlock(parentIndent: number): Stmt[] {
    const out: Stmt[] = [];
    if (i >= lines.length || lines[i].indent <= parentIndent) return out;
    const indent = lines[i].indent;
    while (i < lines.length) {
      const ln = lines[i];
      if (ln.indent < indent) break;
      if (ln.indent > indent) throw new ScriptError(ln.no, 'unexpected indent (缩进不对)');
      i++;
      if (ln.text.startsWith('如果')) {
        const { cond, inline } = parseCondition(ln.text.slice(2).trim(), ln.no);
        const then: Stmt[] = inline ? [parseActionLine(inline, ln.no)] : [];
        then.push(...parseBlock(indent));
        if (then.length === 0) throw new ScriptError(ln.no, '如果 needs a 就 line below it (indented)');
        out.push({ kind: 'if', cond, then, line: ln.no });
      } else if (ln.text.startsWith('不然')) {
        const prev = out.at(-1);
        if (!prev || prev.kind !== 'if' || prev.else) {
          throw new ScriptError(ln.no, '不然 must come right after a 如果 block, at the same indent');
        }
        const inline = ln.text.slice(2).trim();
        const otherwise: Stmt[] = inline ? [parseActionLine(inline, ln.no)] : [];
        otherwise.push(...parseBlock(indent));
        if (otherwise.length === 0) throw new ScriptError(ln.no, '不然 needs a 就 line below it (indented)');
        prev.else = otherwise;
      } else {
        out.push(parseActionLine(ln.text, ln.no));
      }
    }
    return out;
  }

  const body = parseBlock(-1);
  if (i < lines.length) throw new ScriptError(lines[i].no, 'unexpected indent (缩进不对)');
  return { body };
}

/** Number of rules (each 如果 and each 不然), for the script-length star. */
export function countRules(stmts: readonly Stmt[]): number {
  let n = 0;
  for (const s of stmts) {
    if (s.kind !== 'if') continue;
    n += 1 + countRules(s.then);
    if (s.else) n += 1 + countRules(s.else);
  }
  return n;
}
