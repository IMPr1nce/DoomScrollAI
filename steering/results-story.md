# Results story — a pending change (spec)

**Status: done (built 2026-10-22).** Approved by the team lead on 2026-10-21. Its lasting rules now live in
[content.md](content.md#results-wording-must-be-honest) and [product.md](product.md#decision-log); read those, not
this, before changing a person's results step. Kept as the record of the change. Two rules were added at build time
with the team lead's OK: "bubble" also needs the main topic to still be enjoyed at the end, and `lostTopics` /
`gainedTopics` / `focusGrew` compare the percents the radars print. Measured: radars about 136px tall at 1366 × 600. The rules in [tech.md](tech.md), [content.md](content.md) and [CLAUDE.md](CLAUDE.md) still apply;
this file only adds to them.

## Why
Students never meet the word "variety" during play, so a "Variety of what they watched" panel with 0–1 numbers on
the results is a curve ball for a 13-year-old. What they *can* follow is a story about one person: what you showed
them, and what happened to their tastes. "You showed Maya mostly Sports, so Maya is drifting into a Sports bubble
and lost interest in Comics." The radars at the start and the end already show it. The sentence says it.

## What changes (only on each person's step)
1. **The variety panel goes**: its title, sentence, the two bars, the 0–1 values and "0 = all the same.
   1 = all different.".
2. **A story sentence replaces the headline** ("Maya started with 4 topics they'd enjoy. By the end, only 2."),
   so nothing is said twice. It names topics instead of counting them, and it adapts to what happened (below).
3. **When the sentence says "bubble", the definition sits right under it**, word for word as on the big picture:
   "Filter bubble = a feed so full of one thing that you rarely see anything else." (from
   `DS.revealText.bubbleDefinition`, so the two can't drift apart). The team lead chose to use the term on the
   person step, so it must be defined there, on every step that uses it, not only the first.
4. **The step becomes a stacked page**, top to bottom, with no empty space (see Layout).

## What stays exactly as it is
- The score step, the leaderboard, and the big picture: the tiles (including "Average variety"), the verdict,
  the filter-bubble definition and loop, the exploring/exploiting line, the three questions, the buttons.
  The team lead asked to keep everything else the same. The "Average variety" tile was raised as a curve ball
  too, and kept: don't change it in this change.
- **The variety measure stays in the model.** `diversity()`, `diversityByHalf()`, `trendOf()`, `firstMix` /
  `secondMix` and `overall.loopExample` in `js/metrics.js` still decide the big picture's honest verdict, the
  loop's example, the "Average variety" tile and the simulator's goals 5 and 6. Only the person step stops
  showing it. Remove a function or field only if nothing uses it any more (`varietyLine`, `halfFacts`,
  `headline`, `variety.leftEarly` are likely candidates), and remove its tests with it.
- The feed panel (the emoji row, "You showed Maya 15 posts. 7 were Sports. You tried 4 of 6 topics." and its
  legend), the person's name, bio and status pill, the radar drawings (`spikeChart`, the `learned` version's
  pair), the tutorial, every config number, the CSV columns, the balance.

## The story sentence: dynamic and honest
**Every claim comes from `buildReveal()`** (pure data in `js/metrics.js`); `DS.revealText.story(p)` only picks the
sentence. New fields per person, all plain data:

| Field | What it is |
|---|---|
| `lostTopics` | topic ids enjoyed at the start but not at the end (`enjoyedTopics` of `tasteSnapshotStart` minus of the end tastes), in topic order |
| `gainedTopics` | the other way round (rare, but it happens) |
| `focusTopic` | the one topic that was **more than half** of everything shown (watched or skipped, the same count the feed line uses), when at least 3 posts were shown; otherwise `null`. More than half means a tie can never name a winner. |
| `focusGrew` | `focusTopic`'s taste ended higher than it started |

**The cause must be true of what the player did.** In this game every watched post nudges tastes (that topic up,
the others down), so even a player who mixed can make someone lose interest in a topic. Never write "because you
didn't show variety" to a player who mixed. Say what they did, then what happened.

Example wording (the implementer drafts the final table for the team lead's OK; keep the meaning):

| What you showed | Topics lost | Sentence |
|---|---|---|
| Nothing (`total` 0) | none | Maya never saw a post, so their tastes didn't change. |
| Mostly one topic | 1 | You showed Maya mostly Sports, so Maya is drifting into a Sports bubble and lost interest in Comics. |
| Mostly one topic | 2 or more | …and lost interest in Comics and Music. (`joinLabels`) |
| Mostly one topic | none | You showed Maya mostly Sports. Sports grew on them, but they still enjoy the same 4 topics. ("grew on them" only if `focusGrew`) |
| A mix | none | You mixed it up for Maya, and they still enjoy the same 4 topics. |
| A mix | 1 or more | You mixed it up for Maya, but every watch still nudged their tastes: they lost interest in Comics. |
| Too few to say (1–2 posts) | none | You showed Maya just 2 posts, so their tastes barely changed. |
| Left, nothing lost | none | Maya left at 0:14, too soon for their tastes to change much. |
| Any | gained 1+ | add: "They now enjoy Food too." |

Rules for every branch:
- **"Bubble" only when a focus topic exists and at least one topic was lost.** Anything else must not say bubble.
- **"Topics they'd enjoy", never "favorites"**: the start count includes the "meh" topic (usually 4, not 3).
- **"Lost interest in Comics"** means Comics crossed below `ENJOY_THRESHOLD` (0.45). Usually it's the "meh" topic
  slipping from about 50% to just under 45%; the radar's corner labels show those numbers, so it can be checked.
- **"Drifting into"**, never "stuck" or "trapped": tastes drift; nothing is locked.
- **No blame.** State what the player did ("You showed Maya mostly Sports"), not "because you failed to…". The
  big picture's question ("Was that good for them?") does the judging.
- **Don't repeat the feed line's numbers.** The feed panel already says "15 posts, 7 were Sports"; the story says
  "mostly Sports".
- The usual word rules: ≤ 24 words a sentence, no he/she/him/her/his (say the name or "they"), school-safe, talk
  to the player as "you", never "exploring"/"exploiting" on a person step.
- **The lost and gained topics also show as chips** beside the radars: "Lost interest: 🦸 Comics" (emoji plus the
  word, never color alone), or "Lost interest: none". These are words, so screen readers read them; the radars
  stay `aria-hidden`/`role="img"` as now.
- The current tastes (`vp.tastes`) still never appear during play. This is only the results screen, which already
  shows the end tastes.

## Layout: the stacked person step
One column, full width (up to 1200px), three panels top to bottom. Measured with a prototype in the page at
1366 × 600 on 2026-10-21: a plain stack of today's panels is **685px against a 485px step**, so the panels must be
compact, as below. The compact prototype fit with **0px to spare**.

| Row | Contents | Budget at 1366 × 600 |
|---|---|---|
| 1. Who | avatar, name, bio and status pill (as now), then the story sentence (20px bold) under the name, then the definition line (16px, muted) only when the sentence says "bubble" | about 120px |
| 2. Feed | "What you showed Maya" and the feed sentence on one line, the emoji row, the legend | about 110px |
| 3. Radars | the two radars side by side (start and end; or the `learned` pair), and a third column beside them with the lost/gained chips, "Chance they'd like each topic, in %." and the "Highlighted: what you showed most." legend. The "What Maya likes" title may go: the captions under each radar say what they are. This row takes the rest of the height (`flex: 1`). | the rest (about 220px) |

- **The trade-off the team lead accepted:** the radars shrink from about **183px to about 105–130px** tall. They
  must stay readable: the corner percentages at their current font size, the start and end side by side. If they
  can't be at least about 110px tall at 1366 × 600, stop and report the measurements; don't make the page scroll,
  and don't drop any text below 16px.
- **The radar is in two places that must agree** (`js/radar.js` and the `.radar`/`.rchart` rules in
  `css/style.css`). The prototype only changed the row's grid and min-height; `--r` already sizes from the box
  (`cqw`/`cqh`). Lower `.tastes__row`'s `min-height` (228px today) instead of rewriting the radar math.
- **Every version must fit:** the default, `?profiles=4`, `?radar=learned`, `?layout=grid` and
  `?profiles=6&layout=grid` (6 people get the button grid during play, but their results steps use these same
  panels). Windows at least 1001px wide and about 560px tall, and 1024 × 768. At 1000px and under the page
  already stacks and may scroll; leave that alone.
- No empty space: the third column fills the room beside the radars. A step with no lost topics still shows the
  chips line ("Lost interest: none") and the hints, so the row never looks half-empty.

## Tests and checks
- **Unit (`tests/tests.js`)**: a "reveal text: story …" test per branch above (including ties never naming a
  topic, "bubble" only with a focus topic and a loss, "favorite" never, 1 vs 2+ lost topics, gained topics, left
  early, nothing shown, 1–2 posts). A `buildReveal` test for `lostTopics`, `gainedTopics`, `focusTopic`,
  `focusGrew`. Add every new sentence to the he/she and ≤ 24-word pool. Drop tests of functions that were removed.
  Don't edit `PINNED` unless a test needs a new key.
- **`tests/e2e.js`**: each person's step has no "Variety of what they watched" and no `.vrow`; it has the story
  sentence, and the definition line exactly when the sentence says "bubble"; every results step still fits at
  1366 × 600 and 1024 × 768 for every bot; no "undefined"/"NaN"/"null"; the step count is still 5 by default.
  Keep the existing checks ("You tried…", the big picture's three questions and definitions, the spam bot told
  its feeds were narrow).
- **`DS.dev.measureReveal()`** at 1366 × 600 (`index.html?dev=1`), with the `spam`, `mix`, `random`, `learner` and
  `none` bots, and with `?profiles=4` and `?radar=learned`. Also report the radars' height on a person step.
  Before playing in dev mode, replace `DS.logger.writeFile`/`fileExists` and `DS.leaderboard.readFile`/`writeFile`
  with no-ops, so test rounds never land in the real `data/` folder.
- `node tests/run-node.js sim` only if `vp.js`, `config.js` or an existing number in `metrics.js` changed (it
  shouldn't).

## Docs to update in the same change
- [content.md](content.md) "Results wording must be honest": replace the headline and variety-sentence bullets with
  the story rules above; keep the big picture's bullets.
- [product.md](product.md): session step 4 (a person's step is now the story, the feed and the radars), the "How
  variety is measured" lesson bullet (still measured, now shown only on the big picture), and a decision-log row
  (the date, what changed, why: "variety was never taught, so it was a curve ball"; trade-off: smaller radars).
- [structure.md](structure.md): "A results step" if `buildSteps`/`goTo` change, and the radar section if its sizing
  rules change.
- [CLAUDE.md](CLAUDE.md): the status line, and "Layout budgets" if the person step's budget changes.
- `README.md`: the results paragraph in "How a session goes" and the "results text only says what happened" tip.
