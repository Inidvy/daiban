import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitchenFor, getDay, toPinyin } from '../src/content.ts';
import { loadContent } from '../src/load-content.ts';
import { digitsToChinese } from '../src/numbers.ts';
import { paletteFor } from '../src/palette.ts';
import { looksLikePinyin, toneless } from '../src/pinyin.ts';
import { checkAnswer, hintLadder, timeLimitMs } from '../src/shift.ts';
import { learnerContour, splitSyllables, targetContour, toneOf } from '../src/tones.ts';
import { matchSpokenLine, voiceTemplate } from '../src/voice.ts';

const content = loadContent();
const lexicon = kitchenFor(content, getDay(content, 5)).lexicon;
const items = paletteFor(content, 5);
const said = (...alts: string[]) => matchSpokenLine(alts, items, lexicon, content.words)?.item.key ?? null;

test('converts recognizer digits to numerals', () => {
  assert.equal(digitsToChinese('我要2碗牛肉面，一共90块'), '我要二碗牛肉面，一共九十块');
});

test('matches a spoken script line to its block', () => {
  assert.equal(said('如果听到我要两碗牛肉面'), 'hear:p_order');
  assert.equal(said('如果听到我要数量量词东西'), 'hear:p_order');
  assert.equal(said('就做3碗牛肉面'), '做:order');
  assert.equal(said('如果听到打包'), 'hear:p_takeaway');
  assert.equal(said('打包'), '打包');
  assert.equal(said('说请慢用'), 'say:p_enjoy');
  assert.equal(said('如果有牛肉面'), 'check:有');
  assert.equal(said('收钱扫码'), '收钱:扫码');
  assert.equal(said('今天天气很好'), null);
  // The best of several recognizer alternatives wins.
  assert.equal(said('如果听到不要拉', '如果听到不要辣'), 'hear:p_no_spice');
});

test('every block can be typed as toneless pinyin', () => {
  for (const item of items) {
    const pinyin = toPinyin(voiceTemplate(item.template).replace(/\[[^\]]*\]/g, ''), content.words);
    assert.ok(/^[a-zü\s,.?!āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]*$/i.test(pinyin), `${item.key}: no pinyin for part of "${pinyin}"`);
  }
  assert.ok(looksLikePinyin('ruguo tingdao dabao'));
  assert.equal(toneless('Wǒ yào lǜ3'), 'woyaolv');
  assert.equal(said('ruguo tingdao dabao'), 'hear:p_takeaway');
  assert.equal(said('shuo qing manyong'), 'say:p_enjoy');
});

test('the 代班 checker goes by meaning and asks back on a near miss', () => {
  const day1 = getDay(content, 1).vip.turns;
  const check = (turn: number, ...alts: string[]) => checkAnswer(day1[turn], alts, content.patterns, lexicon, content.words);
  assert.equal(check(0, '好的，请慢用！').kind, 'ok');
  assert.equal(check(1, '九十块').kind, 'ok');
  assert.equal(check(1, '一共90块').kind, 'ok');
  assert.equal(check(1, 'jiushi kuai').kind, 'ok');
  assert.equal(check(1, 'jiushiwu kuai').kind, 'miss');
  const wrongPrice = check(1, '八十块');
  assert.equal(wrongPrice.kind, 'near');
  const noUnit = check(1, '九十');
  assert.ok(noUnit.kind === 'near' && /块/.test(noUnit.clarify.en));
  assert.equal(check(2, '谢谢').kind, 'miss');
  assert.ok(timeLimitMs(2) > timeLimitMs(0));
});

test('every model answer passes its own turn', () => {
  for (const day of content.days) {
    for (const turn of day.vip.turns) {
      const v = checkAnswer(turn, [turn.model], content.patterns, lexicon, content.words);
      assert.equal(v.kind, 'ok', `Day ${day.day}: ${turn.model}`);
    }
  }
});

test('the hint ladder goes from first word to the model answer', () => {
  const [h1, h2, h3] = hintLadder(getDay(content, 4).vip.turns[0], content.patterns, content.words);
  assert.equal(h1.text, 'yígòng …');
  assert.equal(h2.text, '一共＿＿');
  assert.equal(h3.text, '一共五十块。');
});

test('splits pinyin into syllables and reads tones', () => {
  assert.deepEqual(splitSyllables('niúròumiàn'), ['niú', 'ròu', 'miàn']);
  assert.deepEqual(splitSyllables('zài zhèr chī háishi dǎbāo'), ['zài', 'zhèr', 'chī', 'hái', 'shi', 'dǎ', 'bāo']);
  assert.deepEqual(splitSyllables('hǎode, gěi nín dǎbāo'), ['hǎo', 'de', 'gěi', 'nín', 'dǎ', 'bāo']);
  assert.deepEqual(splitSyllables('dōngxi shàngcài xiànjīn suànle'), ['dōng', 'xi', 'shàng', 'cài', 'xiàn', 'jīn', 'suàn', 'le']);
  assert.deepEqual(['mā', 'má', 'mǎ', 'mà', 'ma'].map(toneOf), [1, 2, 3, 4, 5]);
});

test('builds the target contour with third-tone sandhi', () => {
  const c = targetContour('nǐ hǎo');
  assert.deepEqual(c.map((s) => s.points), [[3, 5], [2, 1, 4]]);
  assert.deepEqual(targetContour('qǐng mànyòng')[0].points, [2, 1, 1]);
});

test('maps a pitch track to the 1–5 scale relative to the speaker', () => {
  const low = learnerContour([null, 100, 100, 200, null]);
  const high = learnerContour([200, 200, 400]);
  assert.deepEqual(low, high);
  assert.equal(low[0], 3);
  assert.equal(low.at(-1), 5);
});

test('recall and review checks', async () => {
  const { saysPattern, saidSentence } = await import('../src/shift.ts');
  const order = content.patterns.find((p) => p.id === 'p_order')!;
  assert.ok(saysPattern(order, ['我要3碗牛肉面'], lexicon, content.words));
  assert.ok(saysPattern(order, ['wo yao liang wan niurou mian'], lexicon, content.words));
  assert.equal(saysPattern(order, ['我要牛肉面'], lexicon, content.words), null);
  assert.ok(saidSentence('老板，我要两碗牛肉面。', ['我要两碗牛肉面']));
  assert.equal(saidSentence('在这儿吃还是打包', ['打包']), null);
});

test('a taxi 代班 answer must name the place the customer asked for', () => {
  const taxi = kitchenFor(content, getDay(content, 16)).lexicon;
  const turn = getDay(content, 16).vip!.turns.find((t) => t.says.includes('机场'))!;
  const check = (...alts: string[]) => checkAnswer(turn, alts, content.patterns, taxi, content.words).kind;
  assert.equal(check('好的，去机场。'), 'ok');
  assert.equal(check('好的，去火车站。'), 'near');
});
