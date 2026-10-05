# CLAUDE.md — Doomscroll AI

Browser game for 8th graders (AI4K12). The student plays a recommender algorithm: push posts to six
simulated people ("Virtual Profiles", VPs) to keep their attention. Hidden lesson: chasing
engagement narrows what people see (a filter bubble). Fun first, then the results screen reveals it.
See `README.md` for how to run, tune and read the data. The team lead wants to understand the code,
so **comment the why, not the what.**

## Hard constraints (from the brief)
- Plain HTML + CSS + vanilla JS. No frameworks, build step, backend or npm. Must work by double-clicking
  `index.html` (file://): **no ES modules, no fetch/XHR**; classic `<script>` tags in dependency order
  sharing one global, `window.DS`. Code style is ES5 (`var`, function expressions), match it.
- Target Chrome on a 1366×768 school laptop (~600px of page height). Six profiles must fit with no
  scrolling. Body text ≥16px; nothing smaller. Emoji + words, never color alone.
- **Model files never touch the DOM** (`config`, `content`, `vp`, `metrics`, `logger`'s record/CSV
  functions, the wording half of `reveal.js`) so tests and the simulator run without a browser.
- **Every tunable number lives in `js/config.js`.** Never hard-code a balance value elsewhere.
- No LLM calls. Everything age-appropriate for 13-year-olds.

## Where things live
| File | Role |
|---|---|
| `js/config.js` | all numbers + flags. Other files read `DS.CONFIG` *live*; never replace the object, only set keys |
| `js/content.js` | topics, the 6 VPs (+ tutorial VP Alex), messages (`DS.MESSAGES`, `DS.TOPIC_MESSAGES`) |
| `js/vp.js` | `DS.VP`: tastes, attention, push/like/skip, drift, fatigue, AFK, `tick(dt)`. Emits events via `onEvent`. `DS.rng` is the only randomness (seedable) |
| `js/metrics.js` | diversity, score, and `buildReveal()`: **every number and verdict the results screen shows** |
| `js/logger.js` | event log → `flush(records)` (the single exit) → store → `exportCSV()` |
| `js/ui.js` | screens, pop-up (inert + click guard), HUD, banner, profile card (`createCard`) |
| `js/reveal.js` | results screen. `DS.revealText` = pure sentences (tested); `DS.reveal` = drawing |
| `js/game.js` | the conductor: rAF loop, phases, pause, round end, logging hooks, play-mode lockdown |
| `tests.html` + `tests/tests.js` | model/logger/wording tests. `tests/run-node.js` runs them in Node |
| `sim.html` + `sim/sim.js` | balance simulator (bots: random / spam / mix / learner…) |
| `tests/dev-helpers.js` | `DS.dev.play()` etc. Loaded only with `index.html?dev` |
| `tests/e2e.js` | end-to-end check in headless Chrome (no npm: Node's built-in WebSocket + the DevTools protocol) |

Flow: title → tutorial1 ("Hook them") → tutorial2 ("Lose them") → main (6 VPs, `ROUND_SEC`) → reveal →
"Play again" (straight to main).

## Commands
```
node tests/run-node.js        # all tests, exit code 1 on failure
node tests/run-node.js sim    # balance sim, prints the 6 goals; exit 1 if any fail
node tests/e2e.js             # real headless Chrome over file://: ~35 checks (fit, text, CSV, loopholes). Needs Node 22+ and Chrome
```
Or open `tests.html` / `sim.html` in Chrome. Re-run the tests **and** the sim after touching `config.js`, `vp.js`, or
messages, and `e2e.js` after touching any UI, CSS or `game.js` (it checks the layout and the loopholes).
To see the app: `.claude/launch.json` has a static server (`python3 -m http.server 8765`), then open
`http://localhost:8765/index.html?dev=1`. In the console: `DS.dev.play()` jumps to the results screen.

## Things that are easy to get wrong
- **Tests pin their own config** (`PINNED` in `tests/tests.js`) so tuning never breaks them. Add new
  config keys that tests depend on to `PINNED`.
- **State machine in `game.js`:** `active.frozen` (nothing ticks) is used for pause, the "ready?" card and a
  finished round; `active.paused` is true only for a real pause, so `resume()` can't unfreeze the others.
  Stale `setTimeout`s must check `active === token` (see `endRound`, `showResultAfterDelay`).
- **Click guard:** any button a frantic click could land on right after a screen change must be wrapped with
  `ui.guarded(fn)` (pop-up buttons and all results-screen buttons already are). Game buttons are not.
- **Results text must be honest.** `buildReveal()` returns a trend per VP and overall (`dropped` / `low` /
  `rose` / `steady` / `unknown`) and `revealText` has a sentence for each. When you add an outcome, add its
  wording **and** a test in `tests.js` ("reveal text: …"). Ties for "most shown" are reported as ties.
- **No he/she for VPs** (animal avatars are deliberately gender-neutral). A test scans all reveal copy.
  Sentences are capped at 24 words (reading level). Message lines ≤ 40 chars (one line on a small card).
- **Hidden tastes never appear during play** (not in the DOM, aria-labels, or classes). Only the reveal shows them.
- **Play-mode lockdown:** unless `?dev` / `DEV_MODE`, `game.js` freezes `DS`, `DS.CONFIG`, `DS.rng`,
  `DS.metrics`, `DS.logger` and `VP.prototype`, and omits `DS.game.current`. So don't write to `DS.CONFIG` at
  runtime in game code. `tests.html`/`sim.html` don't load `game.js`, so they can still change config.
- **The log is sealed during play** (`logger.stored()` returns `[]` and `exportCSV()` returns `null` while the
  phase is tutorial1/tutorial2/main), because it contains the hidden tastes. In tests, read it via `openLog()`.
- **Layout budgets:** the main grid fits down to ~558px tall; each results step must fit ~445px (stage).
  Check with `DS.dev.measureReveal()` after resizing the window to 1366×560.
- **Logger columns:** the first 11 are the agreed set, then `round_no`, `round_time_sec`, `detail`. Everything
  leaves through `logger.flush()`; the Flask upload is meant to be one `fetch` added there.
- When editing a file with a script, **don't slice by a comment string that appears twice** (it once
  clobbered half of `reveal.js`). Prefer exact multi-line `Edit`s, then re-run the tests.

## Status
Phases 1–6 done: model, simulator, tutorials, main game, reveal + logger + CSV, polish + docs.
Not built (by design): the Flask endpoint (just add a `fetch` in `logger.flush`), sound, accounts.
