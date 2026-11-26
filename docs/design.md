# 代班 (Dàibān) — Chinese Learning Game Design Doc

Nov 22, 2026 · @Jannik

## Overview

**Pitch:** You run businesses in a Chinese city. Bots work the shifts using logic you write in Chinese words. When a bot can't cope, you cover the shift yourself, out loud. The title 代班 (dàibān, "to cover a shift") works both ways: bots cover for you, then you cover for them.

**Learner and goal:** an adult beginner to lower-intermediate learner who wants everyday spoken Mandarin: understanding, speaking and remembering sentences for ordering, shopping, transport, university, sport and travel. Characters and writing are secondary.

**Inspirations:**

- *The Farmer Was Replaced*: you program a drone to automate a farm, unlock code features with what you produce, and optimize scripts.
- *Elevator Saga*: you write logic for elevators and watch waves of passengers test it.

**Design pillars:**

1. **The logic is the language.** Every code keyword is a real Chinese connector (如果, 就, 还是, 先…然后). Writing a script means writing sentences.
2. **Sentences, not single words.** The unit of learning is a sentence pattern with slots, like 我要 \[数量\]\[量词\]\[东西\].
3. **Audio first.** Customers speak; text is a hint, not the default.
4. **Speak more than you click.** At least half of play time is spent speaking.
5. **Fun first.** It has to be a game you would play anyway, not a quiz in disguise.
6. **Know why.** Every new word and connector comes with a short reason or picture story, so it sticks through meaning rather than repetition.
7. **Visible progress in Chinese.** The player always sees how much Chinese they can now handle, not just game stars.

## Core loop

One level is one in-game day at one business, about 15 minutes of real time. Each day has four phases:

1. **Morning: program (about 4 min).** Build or improve the bot's script from Chinese logic blocks. Lines are placed by tapping at first and spoken aloud once the pattern is familiar (see Input modes). A "see a sample script" option shows a working solution; the player studies it, then aims for a shorter, more general version for the script-length star.
2. **Lunch rush: watch and react (about 4 min).** The simulation runs. Customers arrive and speak (audio), and the bot reacts using the script. Mistakes are visible and funny. The player can pause, hot-fix a rule, and resume.
3. **Evening: 代班 voice shift (about 5 min).** A VIP or unusual customer arrives that the bot can't handle. The player serves them by speaking in real time.
4. **Night: review (about 2 min).** A replay lists every sentence the bot or player misunderstood, with audio, pinyin and English. The player repeats each one aloud once.

Stars earned in the day unlock the next day, new patterns and new businesses.

**Session length:** about 15 minutes per day is the default, but several days can be played in one sitting. Nothing is locked behind real calendar days; the review scheduler handles spacing by bringing patterns back later.

## Chinese logic language

The script language uses only real Chinese words, with no symbols or English syntax. Every line of a script is also a sentence a learner could say.

**Logic keywords (unlocked in this order):**

| Code idea | Chinese | Real-life sentence | Unlocks |
| --- | --- | --- | --- |
| yes / no question | 吗 | 有牛肉面吗？ | World 1 |
| not | 不 / 没 | 不要辣 | World 1 |
| if / then | 如果…就… | 如果有空，就去 | World 2 |
| else | 不然 | 不然我们走吧 | World 2 |
| or (question) | 还是 | 你要茶还是咖啡？ | World 2 |
| sequence | 先…然后… | 先付钱，然后拿 | World 3 |
| repeat | 再 | 再来一瓶 | World 3 |
| because / so | 因为…所以… | 因为太贵，所以不买 | World 4 |
| although / but | 虽然…但是… | 虽然很远，但是很好吃 | World 4 |

**Other parts of the language:**

- **Senses:** 听到 "…" matches what the customer said. Matching is by pattern, not exact text.
- **Actions:** verbs learned in context: 说, 给, 做, 问, 收钱, 上菜, 打包.
- **Slots:** typed variables inside patterns: \[数量\], \[量词\], \[东西\], \[地方\], \[价钱\]. One rule with slots covers many sentences.
- **Why cards:** tapping any word or connector opens a short reason. Characters get a picture story from their parts (在 = something under a roof, so "at / in"); connectors get a one-line meaning (就 = "then, right away", the result follows at once). Why cards appear the first time a word is used and stay one tap away after that.

**Example: Restaurant, Day 3 waiter bot**

```
客人说 → 听
如果 听到 "我要 [数量] [量词] [东西]"
    就 做 [数量] [量词] [东西]
如果 听到 "不要辣"
    就 做 不辣的
如果 听到 "打包"
    就 说 "好的，给您打包"
不然
    就 说 "在这儿吃吗？"
先 上菜，然后 说 "请慢用"
```

**Input modes:** early on, the player snaps word blocks together by tapping. Once a pattern has been used successfully several times, the player must speak it (or type pinyin) instead. Recognition comes first, production second. Script lines are not spoken from Day 1, which avoids early frustration.

## Customers and simulation

Customers are generated from the same sentence patterns the player is learning, so every line they speak is learnable. New customer types appear on later days and break old scripts on purpose.

**Difficulty dials per customer:**

| Dial | Low | High |
| --- | --- | --- |
| Speed | Slow, clear TTS | Natural speed |
| Variation | Exact taught pattern | Synonyms, reordered phrases |
| Mind-changing | None | 算了，我要… mid-order |
| Politeness | Plain | 麻烦你 / 请问, polite fillers |
| Noise | Quiet | Background chatter, accents (later worlds) |

**Visible failures:** a wrong reaction plays out on screen. A customer who said 不要辣 and got a spicy bowl fans their mouth. A misheard 一百 produces 100 bowls of noodles. Each failure is logged for the night review.

**Customer personalities:** the picky student, the rushed office worker, the chatty grandma, the tourist who mixes in English. Personality sets the dials and gives each customer a recognizable voice.

## Speaking: the 代班 shift and tone mirror

Speaking is the main activity, not a bonus round. The player speaks when programming (saying script lines aloud), during the 代班 shift, and once per item in the night review.

**代班 shift rules:**

- The customer speaks, and the player answers by voice within a time limit that grows more generous on failure.
- Speech recognition checks meaning first (the right pattern and slots), then tones.
- If the player gets stuck, a hint ladder appears: pinyin of the first word, then the full pattern with empty slots, then a model answer to repeat.
- The customer reacts in character. Success earns tips, and a near miss gets a natural clarification (什么？你要几碗？) rather than a red X.

**Tone mirror:** after each spoken line, the player can open a pitch curve of their own voice drawn over a native speaker's curve, then hear the native audio and try again. Tone feedback is shown in review, not mid-conversation, so it does not break the flow.

## Memory, scoring and progression

**Memory (spaced retrieval built into play):** each pattern has a hidden strength score. Patterns that are due for review come back as customers in older businesses, whose shops "bug out" until the player fixes or re-speaks the rule. There are no flashcards; review is a repair job in the city. A repair takes under a minute and pays a small reward (tips, a decoration), so it feels like a quick win, not a chore.

**Menu board (overview):** a single screen shows every pattern of the current business at once, grouped by situation (ordering, preferences, paying). Each pattern is marked new, shaky or known, with its audio one tap away. The night review opens on this board, with the day's misunderstood sentences highlighted, so the player sees the whole picture rather than one item at a time.

**Visible progress:** progress is shown in Chinese terms, not only stars:

- "You can now handle 11 of 15 noodle-shop sentences."
- "The Day 1 customer is now understood at natural speed."
- The shop looks busier and more upgraded as its patterns get stronger.

**Scoring per day (3 stars):**

- 满意度 (customer satisfaction)
- Speed (customers served per rush)
- Script length (fewer, more general rules score higher, which rewards spotting the pattern)
- 代班 bonus for the voice shift

**City map (each business is a world):**

| Order | Business | Everyday focus | New logic |
| --- | --- | --- | --- |
| 1 | 面馆 Noodle shop | Ordering, spice, paying, takeaway | 吗, 不 |
| 2 | 菜市场 Market | Prices, bargaining, quantities | 如果…就…, 还是 |
| 3 | 出租车 Taxi | Directions, addresses, time | 先…然后… |
| 4 | 酒店 Hotel | Check-in, problems, requests | 再, 不然 |
| 5 | 大学 University | Classes, library, classmates | 因为…所以… |
| 6 | 健身房 Gym and sport | Joining games, body, scores | 虽然…但是… |
| 7 | 诊所 Clinic | Symptoms, pharmacy | All, combined |

The order can be reshuffled to match the player's real week (for example, University first for a student).

## Learning science check

The core ideas are supported by research. The two main risks are coding load and passive watching, and the design rules below address both. No study tests learning a language through coding logic directly, so that part is an inference the MVP must test.

| Finding | Source | Design consequence |
| --- | --- | --- |
| Game-based language learning has a small-to-medium positive effect; games built for entertainment did better than ones built for teaching | [Dixon et al. 2022 meta-analysis](https://scholarspace.manoa.hawaii.edu/handle/10125/73464) | Fun must be real; no disguised quizzes |
| Use of formulaic sequences (chunks) significantly predicts speaking fluency | [François & Albakry 2021](https://scholarspace.manoa.hawaii.edu/server/api/core/bitstreams/4cfac547-6780-4c56-bdaa-7776823c329b/content) | Sentence patterns with slots are the core unit |
| Producing output makes learners notice gaps in what they know | [Swain's Output Hypothesis](https://en.wikipedia.org/wiki/Merrill_Swain) | Speaking is the main activity, not a bonus |
| Practice within a single session is rarely enough for long-term retention; spaced retrieval works | [Kang et al. 2014](https://www.doi.org/10.3758/s13423-014-0636-z) | Old businesses break and patterns return over days |
| Learners valued seeing their tone contours next to corrected ones | [Chen, CALL journal](https://scholars.duke.edu/publication/1510695) | Tone mirror in review |
| Interesting but irrelevant material hurts learning by adding extraneous cognitive load | [Seductive details meta-analysis](https://www.eurekalert.org/news-releases/1127304) | Every game element must carry Chinese; minimal syntax |

**Design rules that follow:**

1. No symbols or English syntax in scripts; the logic is the language.
2. Audio first; text appears only on request.
3. At least 50% of session time is spent speaking.
4. Short sessions (about 15 minutes) are the default; longer bursts are allowed, and spacing comes from the review scheduler.
5. Every animation or mechanic must either carry Chinese or give feedback on Chinese.

## MVP spec for Claude Code

The MVP is one noodle shop over 5 days: about 15 sentence patterns, about 60 words, 3 logic keywords (如果…就…, 不然, 不), and the voice shift. If the noodle shop is fun and people remember the sentences a week later, the formula scales to the city.

**The 5 days:**

| Day | New patterns | Twist |
| --- | --- | --- |
| 1 | 我要 \[数量\]\[量词\]\[东西\]; 多少钱？; 谢谢 | Only one dish; learn 碗 and numbers 1–5 |
| 2 | 有 \[东西\] 吗？; 没有了 | A dish sells out; first 如果…就… rule |
| 3 | 不要辣; 微辣; 打包 / 在这儿吃 | Preferences; 不然 as the default branch |
| 4 | 扫码 / 现金; 一共 \[价钱\] | Paying; bigger numbers |
| 5 | 算了，我要…; 再来一个 | Customers change their minds; Day 1–4 patterns return |

**Suggested stack (verify current browser support before building):**

- Web app: TypeScript + React + Vite, installable as a PWA so it works on a phone.
- Audio out: browser text-to-speech (zh-CN voice) first; recorded native audio later.
- Speech in: browser SpeechRecognition (zh-CN) for the prototype, behind an interface so it can be swapped for a cloud speech service with pronunciation scoring.
- Tone mirror: Web Audio API plus a pitch-detection library, drawing the learner's curve over a reference curve.
- Simulation view: a simple 2D scene (Canvas or PixiJS) with customers queuing at a counter.

**Data model (JSON content files):**

- `Pattern`: id, template with slots, pinyin, English, audio, unlock day, situation group (for the menu board).
- `Word`: hanzi, pinyin, English, slot type (数量, 量词, 东西…), why card (picture story or one-line reason).
- `CustomerType`: personality, dial settings, which patterns they can say.
- `Day`: new patterns, customer mix, star thresholds, the 代班 VIP script, sample script.
- `Script`: the player's ordered rules (condition → action), saved per business.
- `Progress`: per-pattern strength and next review date, stars per day.

**Script interpreter:** rules run top to bottom. A condition matches a customer utterance against a pattern template, filling slots. Actions produce speech (TTS) and visible results. Unmatched utterances fall through to 不然, or cause a visible failure if there is none.

**Milestones:**

- [x] M1: Content files for Days 1–5 and a text-only simulation that runs scripts against generated customers.
- [x] M2: Block-based script editor with Chinese blocks, why cards and sample scripts, plus TTS customer audio.
- [x] M3: Visible simulation scene with funny failures, the menu board and a night-review replay.
- [x] M4: Voice input for script lines and the 代班 shift, with the hint ladder.
- [x] M5: Tone mirror, spaced-review scheduler, star scoring and visible-progress messages.
- [x] M7: Levels inside each day, 30 days at six everyday places (noodle shop, fruit shop, café, taxi, hotel, pharmacy), installable on a phone, GitHub Pages deploy.
- [ ] M6: Playtest with 5 learners; measure recall of Day 1 patterns after 7 days. (In-app speaking-time stats, 7-day recall check and JSON export are built; the playtest itself is still to run.)

**Success criteria for the MVP:**

- Players finish all 5 days without being asked to.
- At least 70% of Day 1–5 patterns can be said correctly from memory 7 days later.
- Players spend at least half of their session time speaking.

**Open questions:**

- How strict should tone checking be for beginners?
- Characters, pinyin or both on hint cards?
- Is the lunch-rush simulation satisfying to watch, or does it need more player control?

**Starter prompt for Claude Code:**

```
Read this design doc. Build milestone M1 of 代班: a TypeScript project with JSON content for noodle-shop Days 1–5 (patterns, words, customer types), a pattern matcher with slots, a rule interpreter (如果/就/不然), and a text-only simulation that runs a sample script against 20 generated customers and prints successes and failures. Include tests for the matcher and interpreter.
```
