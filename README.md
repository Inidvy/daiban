# 代班 (Dàibān)

Learn everyday spoken Chinese in 30 days by running shops in a Chinese city with a robot you program in Chinese. Design: [docs/design.md](docs/design.md).

**Status:** 30 days at six places, each day split into levels that get harder. A day has four parts: 早上 build the script, 中午 watch the rush (pause and hot-fix a rule mid-rush), 傍晚 serve the 代班 customer by speaking, 晚上 review on the menu board with repair jobs, say-it-aloud and the tone mirror. Installable on a phone and deployable to GitHub Pages.

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

## The 30 days

| Days | Place | Everyday Chinese |
|---|---|---|
| 1–5 | 面馆 Noodle shop | Ordering, numbers, how much, sold out, spice, to go, paying, changing your mind |
| 6–10 | 水果店 Fruit shop | Fresh and sweet, bargaining, tasting, small talk, opening hours and goodbyes |
| 11–15 | 咖啡馆 Café | Large and iced, hello and names, where you're from, work, weekend plans |
| 16–20 | 出租车 Taxi | Where to (a new [地方] slot), how far and how long, left and right, stopping, arriving |
| 21–25 | 酒店 Hotel | Check-in, breakfast, broken things, service, check-out |
| 26–30 | 药店 Pharmacy | Colds and headaches, taking medicine, feeling ill, making plans, saying goodbye |

- **Levels:** each day is split into short levels (1-1, 1-2, …). A level adds one or two new sentences, then the day ends on a busy peak. Each level brings more customers, bigger orders, and faster, more varied speech. One star opens the next level, and clearing a day opens the next one. There's no tutorial: a "新句子 New in this level" card shows the new sentences word by word, then you play.
- **Places:** every place has its own script and its own sentences. Ordering, prices, paying and thanks are general and work everywhere. Customers at a place only say what that place has taught, plus the general sentences.
- **Questions that need an answer:** customers also chat ("你叫什么名字？", "远吗？"). The robot needs a rule that answers each one, or the customer is unhappy.
- **Pinyin everywhere, on by default:** every Chinese word in the game shows pinyin above it, and customer bubbles show the English. The 拼音 button turns pinyin off.

## On a phone

The game is a web app you can install: open it in Chrome (Android) or Safari (iPhone), then choose "Add to Home screen". After the first visit it works offline (`public/sw.js`). Speech recognition needs a connection, because the browser sends audio to its speech service.

## Hosting on GitHub Pages

`.github/workflows/pages.yml` tests, builds and deploys `main` on every push. One-time setup:

1. Push the repo to GitHub.
2. In the repo, go to Settings → Pages → Source and choose "GitHub Actions".

The game is then at `https://<user>.github.io/<repo>/`. The build uses relative paths, so any repo name works.

## Layout

| Path | What |
|---|---|
| `content/places.json` | The six places: sign, name, emoji |
| `content/days.json` | Days 1–30: place, new patterns, menu (goods or destinations), sold out, levels, star thresholds, 代班 VIP |
| `content/patterns.json` | ~120 sentence patterns with slots. `general` ones work everywhere; `reply` marks customer questions and the bot answers that count |
| `content/words.json` | ~330 words: hanzi, pinyin, English, slot type, why card. Goods have a price and measure word. `"day": 0` words are UI words, there so every label gets pinyin |
| `content/customers.json` | Customer personalities and their difficulty dials |
| `content/scripts/dayN.txt` | Sample script for each day (clears every level) |
| `scripts/add-days.mjs` | Generates Days 6–30 (words, patterns, days, sample scripts) from one table |
| `scripts/make-icons.mjs` | Draws the app icons as PNGs (no image library) |
| `src/levels.ts` | Levels: order, unlocking, which patterns each level opens |
| `src/matcher.ts` | Pattern matching with slots (`我要 [数量][量词][东西]`, `我去 [地方]`) |
| `src/script.ts` | Parser for the Chinese logic language (如果 / 就 / 不然 / 先…然后) |
| `src/interpreter.ts` | Runs a script against one utterance at a time |
| `src/simulation.ts` | Generates customers, serves them, judges the result (orders, answers, payment), builds the night review |
| `src/cli.ts` | Text-only rush |
| `src/print.ts`, `src/editor.ts`, `src/palette.ts` | Script printer, block editor model, which blocks a level offers |
| `src/voice.ts`, `src/pinyin.ts` | Matching a spoken (or typed-pinyin) script line to its block |
| `src/shift.ts` | 代班 answer checker (meaning first, near-miss questions), hint ladder |
| `src/progress.ts` | Pattern strength with FSRS (ts-fsrs) |
| `src/tones.ts` | Syllables, tone contours and the learner's pitch curve for the tone mirror |
| `src/ui/` | React app: editor, scene, 代班 shift, menu board, tone mirror, playtest stats |

## Audio

Customers speak through the browser's built-in text-to-speech (zh-CN). Chrome and Edge include Chinese voices. If the device has none, the game shows customer text instead and says how to add a voice (Windows: Settings → Time & language → Speech → Add voices → 中文 (简体)).

## Speaking

- **Script lines:** after a block has been tapped 3 times it has to be said aloud (or typed as pinyin) to place it. The palette also has a "说一行 Say a line" mic.
- **代班 shift:** the customer speaks, you answer. Meaning counts, not exact words; a wrong price gets a question back; the timer grows after each miss; hints go first-word pinyin → pattern with blanks → model answer.
- **Recognition** uses the browser's Web Speech API (Chrome and Edge send audio to their speech service). Without it, every speaking step takes typed 汉字 or pinyin.
- **Tone mirror** records with the microphone and detects pitch on the device (pitchy).

## Playtest (M6)

The 📊 button shows speaking time vs. played time per day (goal: 50%), runs the 7-day recall check (English prompt → say the Day 1 pattern, no hints), and exports everything as JSON. Nothing leaves the device unless the player exports it.

## The script language

```
客人说 → 听
如果 听到 "我要 [数量][量词][东西]"
    如果 有 [东西]
        就 做 [数量][量词][东西]
        说 "在这儿吃还是打包？"
    不然
        就 说 "没有了"
如果 听到 "我去 [地方]"
    就 说 "好的，去 [地方]。"
```

- Conditions: `听到 "…"`, `没听到 "…"`, `有 [东西]`, `没有 [东西]`. Patterns match anywhere in the sentence, ignoring spaces and punctuation.
- Actions: `说 "…"` / `问 "…"`, `做 …` (or `给 …` in shops), `再 做 一个`, `收钱 [扫码|现金]`, `上菜`, `打包`. Several on one line: `先 A，然后 B`.
- Body lines are indented; `就` is optional. `不然` belongs to the `如果` right above it.
- `[价钱]` in a `说` line is the total of everything given so far. A slot heard in the `听到` line (like `[地方]`) can be said back.
