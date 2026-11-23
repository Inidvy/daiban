# 代班 (Dàibān)

Learn spoken Chinese by programming noodle-shop bots in Chinese logic. Design: [docs/design.md](docs/design.md).

**Status:** milestones M1–M2: noodle-shop Days 1–5, the logic language, a block script editor with why cards and sample scripts, and a lunch rush with spoken customers.

## Run

Needs Node 23.6 or newer.

```powershell
npm install
npm run dev                                                     # the game at http://localhost:5173
npm run sim -- --day 3                                          # Day 3 sample script, 20 customers
npm run sim -- --day 5 --script content/scripts/day1.txt        # watch an old script break
npm run sim -- --day 4 --seed 7 --customers 40 --quiet          # only show failing customers
npm test
```

## Layout

| Path | What |
|---|---|
| `content/words.json` | ~75 words: hanzi, pinyin, English, slot type, why card; dishes have price and measure word |
| `content/patterns.json` | 21 sentence patterns with slots, grouped by situation for the menu board |
| `content/customers.json` | Customer personalities and their difficulty dials |
| `content/days.json` | Days 1–5: new patterns, menu, sold-out dishes, star thresholds, 代班 VIP |
| `content/scripts/dayN.txt` | Sample script for each day (3 stars) |
| `src/matcher.ts` | Pattern matching with slots (`我要 [数量][量词][东西]`) |
| `src/script.ts` | Parser for the Chinese logic language (如果 / 就 / 不然 / 先…然后) |
| `src/interpreter.ts` | Runs a script against one utterance at a time |
| `src/simulation.ts` | Generates customers, serves them, judges the result, builds the night review |
| `src/cli.ts` | Text-only lunch rush |
| `src/print.ts`, `src/editor.ts`, `src/palette.ts` | Script printer, block editor model, which blocks unlock on which day |
| `src/ui/` | React app: block editor, palette, why cards, lunch rush with speech, night review |

## Audio

Customers speak through the browser's built-in text-to-speech (zh-CN). Chrome and Edge include Chinese voices. If the device has none, the game shows customer text instead and says how to add a voice (Windows: Settings → Time & language → Speech → Add voices → 中文 (简体)).

## The script language

```
客人说 → 听
如果 听到 "我要 [数量][量词][东西]"
    如果 有 [东西]
        就 做 [数量][量词][东西]
        说 "在这儿吃还是打包？"
    不然
        就 说 "没有了"
如果 听到 "不要辣"
    就 做 不辣的
```

- Conditions: `听到 "…"`, `没听到 "…"`, `有 [东西]`, `没有 [东西]`. Patterns match anywhere in the sentence, ignoring spaces and punctuation.
- Actions: `说 "…"` / `问 "…"`, `做 …`, `再 做 一个`, `收钱 [扫码|现金]`, `上菜`, `打包`. Several on one line: `先 A，然后 B`.
- Body lines are indented; `就` is optional. `不然` belongs to the `如果` right above it.
- `[价钱]` in a `说` line is the total of everything made so far.
