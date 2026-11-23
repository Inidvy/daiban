import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLexicon, findMatch, normalize, parseTemplate } from '../src/matcher.ts';
import { loadContent } from '../src/load-content.ts';

const lexicon = buildLexicon(loadContent().words);

test('fills slots from an order', () => {
  const m = findMatch('我要 [数量][量词][东西]', '我要两碗牛肉面', lexicon);
  assert.ok(m);
  assert.deepEqual(m.bindings.数量, { text: '两', value: 2 });
  assert.equal(m.bindings.量词?.text, '碗');
  assert.equal(m.bindings.东西?.text, '牛肉面');
});

test('finds the pattern inside a longer, polite sentence', () => {
  const m = findMatch('我要 [数量][量词][东西]', '老板，麻烦你，我要三份饺子，打包！', lexicon);
  assert.equal(m?.bindings.东西?.text, '饺子');
  assert.equal(m?.bindings.数量?.value, 3);
});

test('ignores spaces and punctuation on both sides', () => {
  assert.ok(findMatch('算了，我要 [数量][量词][东西]', '算了我要一碗茶', lexicon));
  assert.ok(findMatch('算了我要[数量][量词][东西]', '……算了，我要一碗茶。', lexicon));
  assert.equal(normalize('有 牛肉面 吗？'), '有牛肉面吗');
});

test('reads multi-character numbers', () => {
  assert.equal(findMatch('我要 [数量][量词][东西]', '我要十一碗牛肉面', lexicon)?.bindings.数量?.value, 11);
  assert.equal(findMatch('一共 [价钱]', '一共一百二十块', lexicon)?.bindings.价钱?.value, 120);
});

test('takes the leftmost match (so 算了 needs its own rule)', () => {
  const m = findMatch('我要 [数量][量词][东西]', '我要一碗牛肉面，算了，我要两碗鸡蛋面', lexicon);
  assert.equal(m?.bindings.东西?.text, '牛肉面');
});

test('does not match when a slot is missing or the words differ', () => {
  assert.equal(findMatch('我要 [数量][量词][东西]', '我要牛肉面', lexicon), null);
  assert.equal(findMatch('我要 [数量][量词][东西]', '来两碗牛肉面', lexicon), null);
  assert.equal(findMatch('有 [东西] 吗', '我要两碗牛肉面', lexicon), null);
});

test('whole-match mode must cover the entire text', () => {
  assert.ok(findMatch('[数量][量词][东西]', '两碗牛肉面', lexicon, { whole: true }));
  assert.equal(findMatch('[数量][量词][东西]', '两碗牛肉面不辣', lexicon, { whole: true }), null);
});

test('rejects unknown slots', () => {
  assert.throws(() => parseTemplate('我要 [饮料]'), /unknown slot/);
});
