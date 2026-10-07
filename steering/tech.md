# Tech — Doomscroll AI

Read this before writing code: the constraints that can't bend, what the browser has to support, the
commands, what to run after a change, and how the data leaves the game.

## Hard constraints (from the brief)
- **Plain HTML, CSS and vanilla JavaScript.** No frameworks, libraries, build step, npm or backend.
- **It must run by double-clicking `index.html`** (a `file://` page, offline). So: no ES modules, no
  `fetch` or XHR, and no data files loaded at runtime. Data lives in `.js` files.
- **Classic `<script>` tags in dependency order, sharing one global, `window.DS`:**
  `config → content → vp → metrics → logger → radar → ui → reveal → game`. Each file is an IIFE
  (`(function () { 'use strict'; … })()`) that adds to `DS`; `config.js` and `content.js` just set data.
- **ES5 style** in everything the browser loads: `var` and function expressions, with no arrow functions,
  `let`/`const`, classes or template literals. (`tests/run-node.js` and `tests/e2e.js` run in Node.)
- **Model code never touches the page** ([structure.md](structure.md#two-layers)), so the tests and the
  simulator run the very same files without a browser.
- **Every tunable number lives in `js/config.js`.** Other files read `DS.CONFIG` live: never copy a value
  or replace the object, only change its keys.
- **All randomness goes through `DS.rng`**, which can be seeded: `RNG_SEED` replays the same game.
- No LLM calls, no network, no cookies or browser storage, no personal data.

## Browser support
- **Target:** current Chrome on a 1366 × 768 school laptop (about 600px of page height).
- **Chrome 105 or newer** for the radar's container-query sizing (`cqw`/`cqh`). Older versions get
  fixed-size radars from the `@supports not (width: 1cqh)` block at the bottom of `css/style.css`.
- Also relies on the `inert` attribute (pop-ups), `:focus-visible` and `prefers-reduced-motion`.
  `color-mix()` sits behind `@supports`, so it's optional.
- **Fits without scrolling** in windows at least 1001px wide (1001–1180px uses narrower radar buttons)
  and about 560px tall. Narrower windows scroll.

## Commands
```bash
node tests/run-node.js        # unit tests: model, logger, results wording, radar geometry. Exit 1 on failure
node tests/run-node.js sim    # balance simulator: the results table and the 7 goals. Exit 1 if a goal fails
node tests/e2e.js             # the real game in headless Chrome from file://, about 50 checks. Needs Node 22+ and Chrome
```
No terminal? Open `tests.html` and `sim.html` in Chrome. They run the same code.

**To see the game:** double-click `index.html`, or start the static server in `.claude/launch.json`
(`python3 -m http.server 8765`) and open `http://localhost:8765/index.html`.

**Dev mode:** `index.html?dev=1` keeps the console handles open and loads `tests/dev-helpers.js`:
- `DS.dev.play({ bot: 'spam' })` plays a whole round instantly and lands on the results (bots: `learner`,
  `spam`, `mix`, `random`, `none`).
- `DS.dev.measureReveal()` reports whether each results step fits the current window.
- `DS.dev.round()` returns the live round, hidden tastes included.

## Checks
What to run after a change:

| You changed | Run |
|---|---|
| `config.js`, `vp.js`, `metrics.js`, or speech bubbles in `content.js` | unit tests **and** the simulator, at click intervals of 1.0 and 1.5 s |
| `logger.js`, or the results wording in `reveal.js` | unit tests |
| `ui.js`, `game.js`, `radar.js`, the drawing half of `reveal.js`, `style.css` or `index.html` | `tests/e2e.js` (layout, radar, loopholes, CSV) |
| people or topics in `content.js` | unit tests and `tests/e2e.js` |

- The **unit tests** pin their own copy of the settings (`PINNED` in `tests/tests.js`), so tuning
  `config.js` never breaks them.
- The **simulator** plays hundreds of 90-second rounds with robot players, without real timers, and checks
  the goals in [balance.md](balance.md).
- **`tests/e2e.js`** drives real Chrome through the DevTools protocol using Node's built-in WebSocket, so
  there's nothing to install. It covers the play-mode lockdown, both radar versions, the 6-person grid, the
  fit at 1366 × 600 and 1024 × 768, the results text, the CSV, and the frantic-click and pause loopholes.

## Data and logging
- Every event flows `logger` → pending → `flush(records)` → stored → `exportCSV()`. `flush()` is the
  **only exit**; the CSV download on the last results step reads what it stored.
- **CSV columns.** The first 11 are the agreed set, in this order: `session_id, timestamp_ms, phase, vp_id,
  event, topic, liked, attention_before, attention_after, fatigue_mult, tastes_json`. After them come
  `round_no, round_time_sec, detail`. New columns go at the end only.
- **Events:** `push`, `watch_end`, `afk`, `round_start`, `round_end`, `pause`, `resume`. On `round_start`,
  `detail` says which version was played.
- **Sealed during play:** while a tutorial or a round is running, `stored()` returns `[]` and `exportCSV()`
  returns `null`, because the log holds the drifting tastes.
- **Privacy:** the session id is random (like `20261004-153012-a3f9c1`). Nothing identifies the player.
- **Adding the Flask server:** put one `fetch` POST inside `logger.flush()` (the comment above it has the
  code) and keep the line that stores the records. The server needs CORS, because the page is opened from
  a file.

## Security posture
Play mode (the default) freezes `DS`, the settings, the dice, the metrics, the logger and the person
model, and hides `DS.game.current`, so a curious student can't change the game from the console. It's a
speed bump, not security: the answers are in `content.js`, and anything in a browser can be edited. Never
use scores for grades.
