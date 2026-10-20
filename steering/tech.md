# Tech — Doomscroll AI

Read this before writing code: the constraints that can't bend, what the browser has to support, the
commands, what to run after a change, and how the data leaves the game.

## Hard constraints (from the brief)
- **Plain HTML, CSS and vanilla JavaScript.** No frameworks, libraries, build step, npm or backend.
- **It must run by double-clicking `index.html`** (a `file://` page, offline). So: no ES modules, no
  `fetch` or XHR, and no data files loaded at runtime. Data lives in `.js` files.
- **The disk is reached only through the data folder** the teacher picks on the name screen
  (`js/datafolder.js`, Chrome's File System Access API: `showDirectoryPicker`, which works from `file://`).
  Nothing else reads or writes files, and nothing is fetched.
- **Classic `<script>` tags in dependency order, sharing one global, `window.DS`:**
  `config → content → vp → metrics → logger → leaderboard → datafolder → radar → ui → reveal → game`. Each file is an IIFE
  (`(function () { 'use strict'; … })()`) that adds to `DS`; `config.js` and `content.js` just set data.
- **ES5 style** in everything the browser loads: `var` and function expressions, with no arrow functions,
  `let`/`const`, classes or template literals. (`tests/run-node.js` and `tests/e2e.js` run in Node.)
- **Model code never touches the page** ([structure.md](structure.md#two-layers)), so the tests and the
  simulator run the very same files without a browser.
- **Every tunable number lives in `js/config.js`.** Other files read `DS.CONFIG` live: never copy a value
  or replace the object, only change its keys.
- **All randomness goes through `DS.rng`**, which can be seeded: `RNG_SEED` replays the same game.
- No LLM calls, no network, no cookies or browser storage (the data folder is chosen again each visit rather than
  remembered in IndexedDB). The personal data is the player's name, grade and gamer tag
  ([Data and logging](#data-and-logging)): the name only names the folder and files, never a row or a column; the
  grade is a column; the gamer tag is only in the leaderboard file, never in the game's rows.

## Browser support
- **Target:** current Chrome on a 1366 × 768 school laptop (about 600px of page height).
- **Chrome 105 or newer** for the radar's container-query sizing (`cqw`/`cqh`). Older versions get
  fixed-size radars from the `@supports not (width: 1cqh)` block at the bottom of `css/style.css`.
- Also relies on the `inert` attribute (pop-ups), `:focus-visible` and `prefers-reduced-motion`.
  `color-mix()` sits behind `@supports`, so it's optional; so is `:has()` (the ticked "8th" box's highlight).
- **Saving to the data folder needs Chrome or Edge 86+** (`showDirectoryPicker`). Firefox and Safari have no
  folder button: their files download at Log out, and their leaderboard holds only that visit's rounds.
- **Fits without scrolling** in windows at least 1001px wide (1001–1180px uses narrower radar buttons)
  and about 560px tall. Narrower windows scroll.

## Commands
```bash
node tests/run-node.js        # unit tests: model, logger, results wording, radar geometry. Exit 1 on failure
node tests/run-node.js sim    # balance simulator: the results table, the 7 goals and a tutorial line. Exit 1 if a goal fails
node tests/e2e.js             # the real game in headless Chrome from file://, about 95 checks. Needs Node 22+ and Chrome
```
No terminal? Open `tests.html` and `sim.html` in Chrome. They run the same code.

**To see the game:** double-click `index.html`, or start the static server in `.claude/launch.json`
(a `python3` static server that sends `Cache-Control: no-store`, so a reload always gets your latest edits) and open `http://localhost:8765/index.html`.

**Dev mode:** `index.html?dev=1` keeps the console handles open and loads `tests/dev-helpers.js`:
- `DS.dev.play({ bot: 'spam' })` plays a whole round instantly and lands on the results (bots: `learner`,
  `spam`, `mix`, `random`, `none`). Called from the results screen, it starts a new round first.
- `DS.dev.measureReveal()` reports whether each results step fits the current window.
- `DS.dev.round()` returns the live round, hidden tastes included.

## Checks
What to run after a change:

| You changed | Run |
|---|---|
| `config.js`, `vp.js`, `metrics.js`, or speech bubbles in `content.js` | unit tests **and** the simulator, at click intervals of 1.0 and 1.5 s |
| `logger.js`, `leaderboard.js`, or the results wording in `reveal.js` | unit tests |
| `ui.js`, `game.js`, `radar.js`, `datafolder.js`, the drawing half of `reveal.js`, `style.css` or `index.html` | `tests/e2e.js` (layout, radar, loopholes, the name screen, the data folder, CSV, leaderboard) |
| people or topics in `content.js` | unit tests and `tests/e2e.js` |

- The **unit tests** pin their own copy of the settings (`PINNED` in `tests/tests.js`), so tuning
  `config.js` never breaks them.
- The **simulator** plays hundreds of 30-second rounds with robot players, without real timers, and checks
  the goals in [balance.md](balance.md).
- **`tests/e2e.js`** drives real Chrome through the DevTools protocol using Node's built-in WebSocket, so
  there's nothing to install. It covers the play-mode lockdown, the tutorial's two steps, its profile radar
  and its words in every version, both radar versions, the 6-person grid, the avatar reactions (they come and go, never move
  the layout or say anything about the tastes, and fade in place with reduced motion), the fit at
  1366 × 600 and 1024 × 768, the name screen's checks, the results text, the CSV files and the leaderboard in
  the data folder (a pretend in-memory folder, `FAKE_FOLDER`, since a headless Chrome can't click the real
  picker), Log out with and without a folder, and the frantic-click and pause loopholes.

## Data and logging
- Every event flows `logger` → pending → `flush(records)` → stored → `files()` → `saveFinished()` / `saveUnsaved()`.
  `flush()` is the **only exit**; the CSV files are written from what it stored.
- **CSV columns.** The first 11 are the agreed set, in this order: `session_id, timestamp_ms, phase, vp_id,
  event, topic, liked, attention_before, attention_after, fatigue_mult, tastes_json`. After them come
  `round_no, round_time_sec, detail, post_no, clock_time`, then `taste_<topic>` for each topic in topic order
  (`tastes_json` as plain numbers), then `grade` ("8th", or what the player typed; the same on every row of a
  session). New columns go at the end only.
- **`topic` and `post_no`** are filled on `push`, on `watch_end` (the post that ended) and on an `afk` caused by a
  skip; an idle `afk` has neither. A push and its watch_end share `post_no`, which restarts with each new person
  (each round, each tutorial "Try again").
- **Events:** `push`, `watch_end`, `afk`, `round_start`, `round_end`, `pause`, `resume`. On `round_start`,
  `detail` says which version was played.
- **Sealed during play:** while a tutorial or a round is running, `stored()` and `files()` return `[]`, and
  `saveUnsaved()` and `downloadUnsaved()` return `null`, because the log holds the drifting tastes. `endRound()`
  moves to the `reveal` phase as soon as the round is over (before the "Time's up!" banner), so the round's file
  can be written right away.
- **The data folder** (`js/datafolder.js`): `data/First_Last/First_Last_tutorial.csv`, `First_Last_round1.csv`… and
  `data/leaderboard/leaderboard.csv`. The teacher picks the project's `data` folder (or the project folder: `data`
  is made inside). Chrome forgets the permission when the tab closes, so it's picked once per visit; Log out keeps it.
- **Each part saves itself when it ends** (`logger.saveFinished()`, called by `game.js`): the tutorial when the
  round starts, a round when it ends. It never writes the live part (the round still being played). A file is
  written whole each time (a tutorial replay rewrites the tutorial file). **Log out** (`saveUnsaved()`) writes
  whatever is still unsaved, then `logger.reset()`; if the folder fails, the player can take the files as
  downloads (`downloadUnsaved()`). Without a folder (another browser, or the dev helpers), nothing is written until
  Log out, which downloads instead.
- **Nothing is written over:** the first time a session saves a part, `folderFileName()` checks the folder; a file
  left by an earlier session (the same student again, or a namesake) makes it `First_Last_round1 (2).csv`.
- **Testable without a folder:** `logger.hasFolder`, `writeFile`, `fileExists` and `download` (and the leaderboard's
  `hasFolder`, `readFile`, `writeFile`) are replaceable. The file functions may return a value or a promise
  (`when()`), so the unit tests stay synchronous while the real folder is asynchronous.
- **A session** is one player, from the name screen to Log out. `logger.reset()` starts the next one with a new
  session object (id, saved rows, file names), so a save that finishes late marks the old session, never the
  next player's. `sessionId` is a getter, so it can change even though play mode freezes the logger.
- **The files' names:** `First_Last_<part>.csv` (`logger.fileName(part)`) in the folder `First_Last`
  (`logger.folderName()`). `logger.cleanName()` drops what a file name can't hold (`/ \ : * ? " < > |`), turns
  spaces into `-`, and cuts each name at 20 characters. Without a name it falls back to
  `doomscroll_<session_id>`.
- **The leaderboard** (`js/leaderboard.js`): one row per finished round, `gamer_tag, points, round_no, version,
  played_at`. Points are `DS.metrics.points()`: everyone's attention when the round ended, added up (AFK = 0).
  `add()` reads the file, adds the row and writes it back, so rows a teacher deleted stay deleted. Rounds of other
  versions aren't ranked together. No name and no session id, so the board can't be joined to the data.
- **Privacy:** the session id is random (like `20261004-153012-a3f9c1`), and no row identifies the player. The
  name is on the folder and files only, the gamer tag on the leaderboard only, so a future server that receives
  `flush()`'s records gets neither.
- **Adding the Flask server:** put one `fetch` POST inside `logger.flush()` (the comment above it has the
  code) and keep the line that stores the records. The server needs CORS, because the page is opened from
  a file.

## Security posture
Play mode (the default) freezes `DS`, the settings, the dice, the metrics, the logger, the leaderboard, the
data folder and the person model, and hides `DS.game.current`, so a curious student can't change the game from the console. It's a
speed bump, not security: the answers are in `content.js`, and anything in a browser can be edited. Never
use scores for grades.
