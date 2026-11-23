import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDay } from '../src/content.ts';
import { loadContent, readSampleScript } from '../src/load-content.ts';
import {
  emptyRules, fromScript, fromTemplate, insertBlock, moveBlock, removeBlock, setElse, toScript,
} from '../src/editor.ts';
import type { Block } from '../src/editor.ts';
import { blockText, paletteFor, spokenText } from '../src/palette.ts';
import { printScript } from '../src/print.ts';
import { parseScript } from '../src/script.ts';
import type { Stmt } from '../src/script.ts';
import { runDay } from '../src/simulation.ts';

const content = loadContent();

function withoutLines(stmts: Stmt[]): unknown {
  return stmts.map((s) =>
    s.kind === 'do'
      ? { kind: 'do', actions: s.actions }
      : { kind: 'if', cond: s.cond, then: withoutLines(s.then), else: s.else ? withoutLines(s.else) : undefined },
  );
}

test('printScript round-trips every sample script', () => {
  for (const day of content.days) {
    const script = parseScript(readSampleScript(day));
    const again = parseScript(printScript(script));
    assert.deepEqual(withoutLines(again.body), withoutLines(script.body), `Day ${day.day}`);
  }
});

test('blocks from a sample script still earn 3 stars', () => {
  for (const day of content.days) {
    const script = toScript(fromScript(parseScript(readSampleScript(day))));
    const result = runDay({ content, day, script, customers: 20, seed: 1 });
    assert.equal(result.satisfaction, 1, `Day ${day.day}`);
  }
});

test('toScript line numbers match the printed text', () => {
  const blocks = fromScript(parseScript(readSampleScript(getDay(content, 5))));
  const script = toScript(blocks);
  const lines = printScript(script).split('\n');
  const check = (stmts: Stmt[]) => {
    for (const s of stmts) {
      const text = lines[s.line - 1];
      if (s.kind === 'if') {
        assert.match(text, /^\s*如果/, `line ${s.line}`);
        check(s.then);
        if (s.else) check(s.else);
      } else {
        assert.doesNotMatch(text, /^\s*(如果|不然)/, `line ${s.line}`);
      }
    }
  };
  check(script.body);
});

test('insert, move, else and remove', () => {
  const rule = fromTemplate({ kind: 'if', cond: { kind: '听到', template: '谢谢' } });
  const say = fromTemplate({ kind: 'do', action: { kind: '说', text: '不客气' } });
  const serve = fromTemplate({ kind: 'do', action: { kind: '上菜' } });

  let blocks: Block[] = insertBlock([], { parentId: null, branch: 'then' }, rule);
  assert.deepEqual(emptyRules(blocks), [rule.id]);
  assert.equal(toScript(blocks).body.length, 0); // empty rules are skipped

  blocks = insertBlock(blocks, { parentId: rule.id, branch: 'then' }, say);
  blocks = insertBlock(blocks, { parentId: rule.id, branch: 'then' }, serve, 0);
  blocks = moveBlock(blocks, serve.id, 1);
  blocks = setElse(blocks, rule.id, true);
  blocks = insertBlock(blocks, { parentId: rule.id, branch: 'else' }, fromTemplate({ kind: 'do', action: { kind: '打包' } }));
  assert.equal(
    printScript(toScript(blocks)),
    '客人说 → 听\n如果 听到 "谢谢"\n    就 说 "不客气"\n    上菜\n不然\n    就 打包\n',
  );

  blocks = removeBlock(blocks, say.id);
  blocks = setElse(blocks, rule.id, false);
  assert.equal(printScript(toScript(blocks)), '客人说 → 听\n如果 听到 "谢谢"\n    就 上菜\n');
});

test('the palette grows day by day', () => {
  const keys = (day: number) => paletteFor(content, day).map((p) => p.key);
  assert.ok(keys(1).includes('hear:p_order'));
  assert.ok(!keys(1).includes('check:有'));
  assert.ok(keys(2).includes('check:有'));
  assert.ok(!keys(3).includes('收钱:扫码'));
  assert.ok(keys(4).includes('收钱:扫码'));
  assert.ok(keys(5).includes('再做'));
  assert.ok(paletteFor(content, 5).every((p) => p.group !== '听' || p.template.kind === 'if'));
});

test('blocks read as script lines and as sentences', () => {
  const order = paletteFor(content, 1).find((p) => p.key === 'hear:p_order')!.template;
  assert.equal(blockText(order), '如果 听到 "我要 [数量][量词][东西]"');
  assert.equal(spokenText(order), '如果听到：我要两碗牛肉面');
});
