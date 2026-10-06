# CLAUDE.md — Doomscroll AI

Browser game for 8th graders (AI4K12). The student plays a recommender algorithm: push posts to four
(or six) simulated people ("Virtual Profiles", VPs) to keep their attention. Hidden lesson: chasing
engagement narrows what people see (a filter bubble). Fun first, then the results screen reveals it.
See `README.md` for how to run, tune and read the data. The team lead wants to understand the code,
so **comment the why, not the what.**

## Hard constraints (from the brief)
- Plain HTML + CSS + vanilla JS. No frameworks, build step, backend or npm. Must work by double-clicking
  `index.html` (file://): **no ES modules, no fetch/XHR**; classic `<script>` tags in dependency order
  sharing one global, `window.DS`. Code style is ES5 (`var`, function expressions), match it.
- Target Chrome on a 1366×768 school laptop (~600px of page height). All profiles must fit with no
  scrolling. Body text ≥16px; nothing smaller. Emoji + words, never color alone.
- The team lead pivoted from 6 profiles to 4 (6 was overwhelming: players clicked at random) and added
  the radar. 6 + grid is kept as a switch for playtests (`?profiles=6&layout=grid`).
- **The radar is guidance (team lead's call, 2026-10-05):** by default (`RADAR_SHOWS: 'interests'`) each
  card's radar shows the person's tastes at the START of the round, from the first second. This overrides
  the brief's "tastes never shown during play"; it was argued against twice (it hands players the answer)
  and the team lead chose it anyway, so don't re-argue it. What stays hidden is the brief's other rule:
  the drift ("players must not see this happening during play"). The radar never updates mid-round.
  The earlier "learned" radar (starts empty, fills from the player's own pushes) is `?radar=learned`.
- **Model files never touch the DOM** (`config`, `content`, `vp`, `metrics`, `logger`'s record/CSV
  functions, the wording half of `reveal.js`) so tests and the simulator run without a browser.
- **Every tunable number lives in `js/config.js`.** Never hard-code a balance value elsewhere.
- No LLM calls. Everything age-appropriate for 13-year-olds.

## Where things live
| File | Role |
|---|---|
| `js/config.js` | all numbers + flags. Other files read `DS.CONFIG` *live*; never replace the object, only set keys |
| `js/content.js` | topics, the VPs (+ tutorial VP Alex), each with a `clue` (bio topic); messages. **Order matters**: `PROFILE_COUNT` takes the first N |
| `js/vp.js` | `DS.VP`: tastes, attention, push/like/skip, drift, fatigue, AFK, `tick(dt)`. Emits events via `onEvent`. `DS.rng` is the only randomness (seedable) |
| `js/metrics.js` | diversity, score, `observed()` (what the player has seen: the 'learned' radar's data), and `buildReveal()`: **every number and verdict the results screen shows** |
| `js/logger.js` | event log → `flush(records)` (the single exit) → store → `exportCSV()` |
| `js/radar.js` | radar geometry (pure, tested) + SVG drawing, used by cards and the results screen |
| `js/ui.js` | screens, pop-up (inert + click guard), HUD, banner, profile card (`createCard`, radar or grid layout). `ui.showsInterests()` = which radar is in use; game.js and reveal.js ask it too |
| `js/reveal.js` | results screen. `DS.revealText` = pure sentences (tested); `DS.reveal` = drawing |
| `js/game.js` | the conductor: rAF loop, phases, pause, round end, logging hooks, play-mode lockdown |
| `tests.html` + `tests/tests.js` | model/logger/wording tests. `tests/run-node.js` runs them in Node |
| `sim.html` + `sim/sim.js` | balance simulator (bots: random / spam / mix / learner…) |
| `tests/dev-helpers.js` | `DS.dev.play()` etc. Loaded only with `index.html?dev` |
| `tests/e2e.js` | end-to-end check in headless Chrome (no npm: Node's built-in WebSocket + the DevTools protocol) |

Flow: title → tutorial1 ("Hook them") → tutorial2 ("Lose them") → main (`PROFILE_COUNT` VPs, `ROUND_SEC`) →
reveal → "Play again" (straight to main).

## Commands
```
node tests/run-node.js        # all tests, exit code 1 on failure
node tests/run-node.js sim    # balance sim, prints the 6 goals; exit 1 if any fail
node tests/e2e.js             # real headless Chrome over file://: ~50 checks in every version (fit, radar, text, CSV, loopholes). Needs Node 22+ and Chrome
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
- **The current tastes (`vp.tastes`) never appear during play** (not in the DOM, aria-labels, or classes):
  they drift, and the drift is the hidden lesson. The interests radar may only read `vp.tasteSnapshotStart`,
  drawn once when the card is made (`e2e.js` checks it doesn't change after a push). With
  `?radar=learned` no tastes at all appear during play. Only the reveal shows the end tastes.
- **Play-mode lockdown:** unless `?dev` / `DEV_MODE`, `game.js` freezes `DS`, `DS.CONFIG`, `DS.rng`,
  `DS.metrics`, `DS.logger` and `VP.prototype`, and omits `DS.game.current`. So don't write to `DS.CONFIG` at
  runtime in game code. `tests.html`/`sim.html` don't load `game.js`, so they can still change config.
- **The log is sealed during play** (`logger.stored()` returns `[]` and `exportCSV()` returns `null` while the
  phase is tutorial1/tutorial2/main), because it contains the drifting tastes. In tests, read it via `openLog()`.
- **Layout budgets:** the main board fits down to ~560px tall; each results step must fit ~445px (stage).
  Check with `DS.dev.measureReveal()` after resizing the window to 1366×560.
- **Radar geometry lives in two places that must agree:** `radar.js` (flat-topped hexagon, `START_DEG`
  -120, viewBox -R..R stretched with preserveAspectRatio none) and `style.css` (`--rx`/`--ry` from the
  radar box's cqw/cqh). Buttons sit at `--dx * --rx`, `--dy * --ry`. The across-radius never drops below
  `--rx-min` (about a button width), or the top/bottom button pairs overlap (`e2e.js` checks for overlaps,
  at 1366×600 and 1024×768). Between 1001 and 1180px wide the buttons stack emoji over word (smaller
  `--btn-w`/`--btn-h`/`--rx-min`) so the radar still fits beside the info; at 1000px and under it stacks
  under the info (scrolls); with 6 profiles the layout falls back to the grid (in game.js).
- **The 'learned' radar** shows only `metrics.observed()` (the player's own results; untried = null = "?",
  never 0). Both radars draw with `DS.radar.spikes()`.
- **`round_start` logs the version** as `detail` (`versionLabel()` in game.js: `radar-interests/4`,
  `radar-learned/4`, `grid/6`), so playtest data can be split by version.
- **Balance was tuned for 4 profiles** (watch 3 s, drain 2.0, DRIFT_DOWN 0.04, fairer dice). If you change
  `PROFILE_COUNT` or the dice, re-run the sim: all 7 goals, including the luck goal, should pass at
  click intervals 1.0 and 1.5 s.
- **Logger columns:** the first 11 are the agreed set, then `round_no`, `round_time_sec`, `detail`. Everything
  leaves through `logger.flush()`; the Flask upload is meant to be one `fetch` added there.
- When editing a file with a script, **don't slice by a comment string that appears twice** (it once
  clobbered half of `reveal.js`). Prefer exact multi-line `Edit`s, then re-run the tests.

## Status
Phases 1–6 done: model, simulator, tutorials, main game, reveal + logger + CSV, polish + docs.
Then: fairer dice, 4 profiles, radar cards, results radars, playtest switches (2026-10-05). Then the
interests radar as the default, with the results screen showing the radar at the start vs the end, and
a narrow-button layout so the board fits 1001–1180px-wide windows (2026-10-05).
Not built (by design): the Flask endpoint (just add a `fetch` in `logger.flush`), sound, accounts.
