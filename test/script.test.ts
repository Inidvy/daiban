import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countRules, parseScript, ScriptError } from '../src/script.ts';

test('parses the waiter bot from the design doc', () => {
  const script = parseScript(`客人说 → 听
如果 听到 "我要 [数量] [量词] [东西]"
    就 做 [数量] [量词] [东西]
如果 听到 "不要辣"
    就 做 不辣的
如果 听到 "打包"
    就 说 "好的，给您打包"
不然
    就 说 "在这儿吃吗？"
先 上菜，然后 说 "请慢用"
`);
  assert.equal(script.body.length, 4);
  const [order, , pack, last] = script.body;
  assert.equal(order.kind, 'if');
  assert.equal(pack.kind === 'if' && pack.else?.length, 1);
  assert.deepEqual(last.kind === 'do' && last.actions, [{ kind: '上菜' }, { kind: '说', text: '请慢用' }]);
  assert.equal(countRules(script.body), 4);
});

test('keeps commas inside quotes and supports inline 就', () => {
  const script = parseScript('如果 听到 "打包" 就 打包，然后 说 "好的，给您打包"');
  const stmt = script.body[0];
  assert.ok(stmt.kind === 'if');
  const body = stmt.then[0];
  assert.deepEqual(body.kind === 'do' && body.actions, [{ kind: '打包' }, { kind: '说', text: '好的，给您打包' }]);
});

test('nests 如果 blocks by indentation', () => {
  const script = parseScript(`如果 听到 "有 [东西] 吗"
    如果 有 [东西]
        就 说 "有"
    不然
        就 说 "没有了"`);
  const outer = script.body[0];
  assert.ok(outer.kind === 'if');
  const inner = outer.then[0];
  assert.ok(inner.kind === 'if' && inner.cond.kind === '有' && inner.else);
  assert.equal(countRules(script.body), 3);
});

test('parses 再 做, 收钱 and full-width quotes', () => {
  const script = parseScript('再 做 一个\n收钱 扫码\n说 “谢谢”');
  assert.deepEqual(
    script.body.map((s) => s.kind === 'do' && s.actions[0]),
    [{ kind: '做', what: '一个', again: true }, { kind: '收钱', method: '扫码' }, { kind: '说', text: '谢谢' }],
  );
});

test('reports errors with line numbers', () => {
  const cases: [string, number, RegExp][] = [
    ['如果 听到 "谢谢"\n    就 跳舞', 2, /不懂/],
    ['不然\n    说 "好"', 1, /不然 must come right after/],
    ['说 "好"\n    说 "好"', 2, /indent/],
    ['如果 听到 "谢谢"', 1, /needs a 就 line/],
    ['如果 听到 "我要 [饮料]"\n    说 "好"', 1, /unknown slot/],
    ['收钱 信用卡', 1, /扫码 or 现金/],
  ];
  for (const [source, line, message] of cases) {
    assert.throws(
      () => parseScript(source),
      (e: unknown) => e instanceof ScriptError && e.line === line && message.test(e.message),
      source,
    );
  }
});
