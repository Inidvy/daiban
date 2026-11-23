import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDay, kitchenFor, loadContent } from '../src/content.ts';
import { newBotState, runTurn } from '../src/interpreter.ts';
import { parseScript } from '../src/script.ts';

const content = loadContent();
const day2 = kitchenFor(content, getDay(content, 2)); // 鸡蛋面 is sold out

function run(source: string, utterances: string[], kitchen = day2) {
  const script = parseScript(source);
  const state = newBotState();
  const turns = utterances.map((u) => runTurn(script, u, kitchen, state));
  return { state, turns };
}

test('makes the order with the filled slots', () => {
  const { state, turns } = run('如果 听到 "我要 [数量][量词][东西]"\n    就 做 [数量][量词][东西]', ['老板，我要三碗牛肉面']);
  assert.deepEqual(state.made, [{ dish: '牛肉面', qty: 3, spice: '辣', soldOut: false }]);
  assert.equal(turns[0].heard, true);
});

test('不要辣 changes the last dish', () => {
  const { state } = run(
    '如果 听到 "我要 [数量][量词][东西]"\n    就 做 [数量][量词][东西]\n如果 听到 "不要辣"\n    就 做 不辣的',
    ['我要两碗牛肉面，不要辣'],
  );
  assert.equal(state.made[0].spice, '不辣');
});

test('有 / 不然 checks the stock', () => {
  const source = `如果 听到 "有 [东西] 吗"
    如果 有 [东西]
        就 说 "有"
    不然
        就 说 "没有了"`;
  assert.deepEqual(run(source, ['有牛肉面吗']).state.said, ['有']);
  assert.deepEqual(run(source, ['还有鸡蛋面吗？']).state.said, ['没有了']);
});

test('fills [价钱] with the total of what was made', () => {
  const { state } = run(
    '如果 听到 "我要 [数量][量词][东西]"\n    就 做 [数量][量词][东西]\n如果 听到 "多少钱"\n    就 说 "一共 [价钱]"',
    ['我要两碗牛肉面', '多少钱？'],
  );
  assert.deepEqual(state.said, ['一共三十六块']); // 2 × 18
});

test('再 做 一个 adds one more of the last dish', () => {
  const { state } = run(
    '如果 听到 "我要 [数量][量词][东西]"\n    就 做 [数量][量词][东西]\n如果 听到 "再来一个"\n    就 再 做 一个',
    ['我要两碗牛肉面', '再来一个'],
  );
  assert.equal(state.made[0].qty, 3);
});

test('an utterance no rule hears is reported, and 没听到 works', () => {
  const { turns, state } = run('如果 没听到 "谢谢"\n    就 说 "还要什么？"', ['我要一碗牛肉面', '谢谢']);
  assert.equal(turns[0].heard, false);
  assert.deepEqual(state.said, ['还要什么？']);
});

test('收钱, 打包 and 上菜 change the state', () => {
  const { state } = run('如果 听到 "扫码"\n    就 收钱 扫码，打包，然后 上菜', ['我扫码吧']);
  assert.equal(state.paid, '扫码');
  assert.equal(state.packed, true);
  assert.equal(state.served, true);
});

test('an empty slot confuses the bot instead of crashing', () => {
  const { state } = run('如果 听到 "谢谢"\n    就 做 [数量][量词][东西]', ['谢谢']);
  assert.equal(state.made.length, 0);
  assert.match(state.confused[0], /第2行.*\[数量\] is empty/);
});

test('cooking a sold-out dish is marked', () => {
  const { state } = run('如果 听到 "我要 [数量][量词][东西]"\n    就 做 [数量][量词][东西]', ['我要一碗鸡蛋面']);
  assert.equal(state.made[0].soldOut, true);
});
