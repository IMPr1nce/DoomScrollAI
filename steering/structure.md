# Structure — Doomscroll AI

Read this to find where something lives, how the pieces talk to each other, and how to add things without
breaking the rules in [tech.md](tech.md).

## Layout
```
index.html             every screen (title, tutorial, main, reveal), the pop-up and the banner; scripts at the bottom
css/style.css          all styling; colors are variables at the top
js/config.js           every tunable number and flag (DS.CONFIG)
js/content.js          topics, the people (+ Alex for the tutorials), speech-bubble lines
js/vp.js               the person model (DS.VP), the dice (DS.rng), createCast and createTutorialVP
js/metrics.js          diversity, score, observed(), buildReveal(): every number the results show
js/logger.js           the event log, the CSV, flush()
js/radar.js            radar geometry (pure) and SVG drawing
js/ui.js               screens, pop-up, click guard, scoreboard, banner, the profile card (and its avatar reactions)
js/reveal.js           the results screen: DS.revealText (pure wording) + DS.reveal (drawing)
js/guess.js            "Guess the profile": DS.guessModel (pure: hidden profile, simulate, wording) + DS.guess (screen)
js/game.js             the conductor: loop, phases, pause, round end, playtest switches, lockdown
tests.html             the unit tests in a browser (tests/tests.js)
sim.html, sim/sim.js   the balance simulator
tests/run-node.js      runs the unit tests or the simulator in Node
tests/e2e.js           the real game in headless Chrome
tests/dev-helpers.js   DS.dev.* (dev mode only)
steering/              these documents
.claude/               launch.json (the dev server) and CLAUDE.md (loads these documents)
README.md              for teachers and the team lead: running, tuning, the data
```

## Two layers
- **Model** (no DOM; runs in the browser and in Node): `config`, `content`, `vp`, `metrics`, `logger`
  (records and CSV), the geometry in `radar.js`, `DS.revealText`, `DS.guessModel`, and `sim/sim.js`.
- **Page:** `ui.js`, the drawing in `radar.js` and `reveal.js`, `game.js`, `tests/dev-helpers.js`.

A file may only use what loaded before it. `reveal.js` looks up `DS.ui` when it first draws, because the
tests load it without the page code.

## How the pieces talk
- **The loop.** `game.js` runs one `requestAnimationFrame` loop. Each frame, unless the game is frozen, it
  calls `vp.tick(dt)` for each person (`dt` is capped by `MAX_FRAME_DT_SEC`, and the last step stops exactly
  at the time limit), then `active.check()` (goal reached, everyone gone, time's up). Then it calls
  `card.update()` for each card, which writes to the DOM only when a value changed.
- **A click.** Topic button → `opts.onPush(topic)` → `vp.push(topic)`. The model decides everything (like
  or skip, fatigue, drift, AFK) and refuses pushes it doesn't allow (`canPush()`).
- **Events.** Each VP emits `push`, `watch_end`, `afk` and `message` to its listeners: the card (speech
  bubble, flash, the +/− pill, the avatar reaction, the history strip) and the logger. The VP doesn't know
  either exists.
- **Avatar reactions** (`showReaction` in `ui.js`, the `.reaction` rules in `style.css`). A `push` puts one
  `span.reaction` (`aria-hidden`) inside `.card__avatar`, built only from the event's `liked` and
  `fatigueMult`: `reaction--like reaction--fresh` (❤️ + 💬), `reaction--like reaction--repeat` (a smaller ❤️) or
  `reaction--skip` (👆). It's absolutely placed, so the card never changes size. One per card: the next push
  replaces it. One timer removes it; `destroy()` clears that timer, so a thrown-away card never runs it.
  `REACTION_*_SEC` in `config.js` reach the CSS as `--reaction-dur` and `--reaction-delay`. With
  `prefers-reduced-motion`, the duration is cut to `REACTION_STILL_SEC` and the CSS swaps in a fade in place.
- **Round end.** `endRound()` logs `round_end`, flushes the log, shows the banner, then calls
  `DS.reveal.show(DS.metrics.buildReveal(vps, elapsed))`. The results screen only draws: every number and
  verdict comes from `buildReveal()`.

## Game state
- **Phases:** `title → tutorial1 → main → reveal`. "Guess the profile" is a screen opened from the last results
  step (`DS.guess.show`), not a phase: nothing ticks there and nothing is logged. **Play again** goes to `main`; **Replay
  the tutorial** goes to `tutorial1`.
- **`active`** is whatever is being played: `vps`, `cards`, `frozen` (nothing ticks: a pop-up, the
  "ready?" card, a pause or a finished round), `paused` (only a real pause), `ended`, `elapsed`,
  `limitSec` and `check`.
- **Delayed callbacks** capture `active` as a token and do nothing if it changed, because the player may
  have restarted in the meantime.
- **The tutorial has two steps, explore then exploit** (`startTutorial1`). It passes `radarShows:
  TUTORIAL_RADAR_SHOWS` (`'profile'`) to `ui.createCard`, so Alex starts as an empty profile whatever the round's
  `RADAR_SHOWS` is. It's a card option, not a settings change, because play mode freezes `DS.CONFIG`.
  `step` is 1 until every topic has been tried (`untriedTopics` is empty); then `check()` queues the pop-ups
  between the steps (`exploredPages`), and step 2 begins as its pop-up appears. Step 2 counts its run of watches
  (`streak()`, only posts since `step2From`) and ends at `TUTORIAL_EXPLOIT_STREAK`. `header()` rewrites the header
  and the goal pill after every push.
- **The tutorial's pop-ups** (`game.js`): an intro chain (`introPages` → `showPopupChain`) that freezes the
  round, one-time hints (`attachHints`, listening to Alex's `push` events), the pop-ups between the steps, the
  win pop-up (`winText`; its second button, "Replay the tutorial", calls `startTutorial1`) and the "Alex left"
  pop-up. Hints and the step change go through `whenFree`: it waits a beat so the player sees the reaction,
  then waits for any pop-up already up instead of dropping, and gives up once the player leaves the
  tutorial. The pop-ups follow the tutorial's own card (the profile radar, or the grid's counts), never
  `ui.showsInterests()`. The one exception is the win pop-up's "Now the radars come filled in" line, which is
  about the round. The definitions of the two words come from `DS.revealText.exploring` / `.exploiting`. None
  may mention the narrowing of tastes. Each pop-up can pass `target` to `ui.showOverlay`: the target is ringed,
  the rest dimmed, and a small panel with an arrow sits beside it (`placeSpot` in `ui.js`). Keep that text to
  one or two short lines: the highlight does the explaining. The board is one row of two cards for 2 people (`--rows` set by
  `ui.mountCards`), a 2 × 2 for 4, and 3 × 2 for 6.
- **Pausing:** the Pause button, Esc, or switching tabs. Only the main round can be paused.

## The radar
It lives in two places that must agree.
- **`js/radar.js`** draws a flat-topped hexagon. Axis 0 points to the upper left (−120°), and the rest
  follow clockwise in topic order: Sports, Dance, Music, Comics, Movies, Food. The SVG's viewBox is exactly
  −R..R and stretches to fit its box (`preserveAspectRatio="none"`). Lines keep their width
  (`vector-effect: non-scaling-stroke`) and dots are zero-length lines with round caps, so the stretch
  never shows.
- **`css/style.css`** works out `--rx` (across) and `--ry` (down) from the radar box's size (`cqw`/`cqh`),
  sizes the SVG to 2rx × 2ry, and places button i at `--dx * --rx`, `--dy * --ry`. `--btn-w`, `--btn-h`
  and `--rx-min` are the room one button needs. In windows 1001–1180px wide, smaller values go with
  narrower buttons (emoji over word). At 1000px and under, the radar moves under the person's info.
- **What it draws** depends on `RADAR_SHOWS`, unless the card passes its own `opts.radarShows` (the tutorial
  passes `'profile'`): `'interests'` draws `vp.tasteSnapshotStart` once, when the card is made; `'learned'`
  redraws `metrics.observed(vp.history)` after every push, with "?" for topics not tried yet. Both use
  `DS.radar.spikes()`. `'profile'` (the tutorial only) draws `PROFILE_RINGS` rings (`DS.radar.frame(n, rings)`)
  and `DS.radar.profile()`: each topic reaches the ring of its watch count, joined by a purple shape like
  "Guess the profile"; its buttons read "✓2 ✗1" (the `.card--profile` rules in `style.css`). `ui.showsInterests()` tells `game.js` and `reveal.js` which one the round uses.
- Six people always get the button grid instead (decided in `game.js`), because six radars don't fit.

## How to add…
- **A setting:** add the key to `js/config.js` with a comment saying why, and read it as `C.KEY` when you
  need it. If a test depends on it, add it to `PINNED` in `tests/tests.js`. If teachers might change it,
  add a row to the README's tuning table.
- **A playtest switch:** parse it in `applyPlaytestSwitches()` in `game.js` (accept only valid values),
  include it in `versionLabel()` so the CSV says what was played, and add it to the version tables in the
  README and [product.md](product.md#versions-for-playtests).
- **A person:** add them to `DS.VP_DEFS` in `js/content.js` ([content.md](content.md#the-people-vps)). The
  first `PROFILE_COUNT` people play, and the first four must love all six topics between them (that is the
  `?profiles=4` board).
- **A topic:** add it to `DS.TOPICS` and `DS.TOPIC_MESSAGES`, and make sure someone loves it. The radar's
  sizing in CSS assumes six topics (a hexagon), so a seventh means reworking the radar layout.
- **A speech-bubble line or category:** see [content.md](content.md#speech-bubbles).
- **A results outcome:** decide it in `metrics.buildReveal()` (pure), word it in `DS.revealText`, and add a
  "reveal text: …" test to `tests/tests.js`.
- **A log column:** add it after `detail` (never change the first 11), and add it to the README's column table.
