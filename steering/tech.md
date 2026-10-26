# Tech — Doomscroll AI

Read this before writing code: the constraints that can't bend, what the browser has to support, the
commands, what to run after a change, and how the data leaves the game.

## Hard constraints (from the brief)
- **Plain HTML, CSS and vanilla JavaScript** in the browser. No frameworks, libraries, build step or npm.
- **One small local backend: `server.py`**, Python 3 standard library only (`http.server`): no Flask, no pip,
  no database. `python3 server.py` serves the game at `http://localhost:8765` and writes the CSV files into
  `data/` next to it. One per laptop, bound to `127.0.0.1` only, offline. The game no longer runs from a
  double-click: opened from `file://`, the name screen says to start the saving program and blocks Continue.
- **No ES modules and no data files loaded at runtime:** game data lives in `.js` files, and the scripts are
  served exactly as they are on disk.
- **The disk is reached only through the saving program**, and only through `js/datafolder.js`: four same-site
  `fetch` calls to `/api/health`, `/api/write`, `/api/read` and `/api/exists`. Nothing else in the game fetches.
  `server.py` writes only `data/<folder>/<file>.csv` (and `data/leaderboard/leaderboard.csv`), each file whole and
  atomically (a temporary file, then a rename).
- **Classic `<script>` tags in dependency order, sharing one global, `window.DS`:**
  `config → content → vp → metrics → logger → leaderboard → datafolder → radar → ui → reveal → game`. Each file is an IIFE
  (`(function () { 'use strict'; … })()`) that adds to `DS`; `config.js` and `content.js` just set data.
- **ES5 style** in everything the browser loads: `var` and function expressions, with no arrow functions,
  `let`/`const`, classes or template literals. (`tests/run-node.js` and `tests/e2e.js` run in Node; `server.py`
  is Python 3, standard library only.)
- **Model code never touches the page** ([structure.md](structure.md#two-layers)), so the tests and the
  simulator run the very same files without a browser.
- **Every tunable number lives in `js/config.js`.** Other files read `DS.CONFIG` live: never copy a value
  or replace the object, only change its keys.
- **All randomness goes through `DS.rng`**, which can be seeded: `RNG_SEED` replays the same game.
- No LLM calls, no network beyond the laptop's own saving program, no cookies or browser storage. The personal
  data is the player's name, grade and gamer tag ([Data and logging](#data-and-logging)): the name only names the folder and files, never a row or a column; the
  grade is a column; the gamer tag is only in the leaderboard file, never in the game's rows.

## Browser support
- **Target:** current Chrome on a 1366 × 768 school laptop (about 600px of page height).
- **Chrome 105 or newer** for the radar's container-query sizing (`cqw`/`cqh`). Older versions get
  fixed-size radars from the `@supports not (width: 1cqh)` block at the bottom of `css/style.css`.
- Also relies on the `inert` attribute (pop-ups), `:focus-visible` and `prefers-reduced-motion`.
  `color-mix()` sits behind `@supports`, so it's optional; so is `:has()` (the ticked "8th" box's highlight).
- **Saving works in any current browser**, because `server.py` does the writing (no folder picker, no download).
  It needs **Python 3** on the laptop: macOS and Linux have it; Windows needs it installed; a Chromebook can't run it.
- **Fits without scrolling** in windows at least 1001px wide (1001–1180px uses narrower radar buttons)
  and about 560px tall. Narrower windows scroll.

## Commands
```bash
python3 server.py             # the game and its saving program: open http://localhost:8765 (--port, --data to change)
node tests/run-node.js        # unit tests: model, logger, results wording, radar geometry. Exit 1 on failure
node tests/run-node.js sim    # balance simulator: the results table, the 7 goals and a tutorial line. Exit 1 if a goal fails
node tests/e2e.js             # the real game and server.py in headless Chrome, about 115 checks. Needs Node 22+, Python 3, Chrome
```
No terminal? Open `tests.html` and `sim.html` in Chrome (from the server, or by double-clicking: they need no server).

**To see the game:** `python3 server.py` (it's also the server in `.claude/launch.json`), then open
`http://localhost:8765`. It sends `Cache-Control: no-store`, so a reload always gets your latest edits.

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
| `ui.js`, `game.js`, `radar.js`, `datafolder.js`, `server.py`, the drawing half of `reveal.js`, `style.css` or `index.html` | `tests/e2e.js` (layout, radar, loopholes, the name screen, the saving program, CSV on disk, leaderboard) |
| people or topics in `content.js` | unit tests and `tests/e2e.js` |

- The **unit tests** pin their own copy of the settings (`PINNED` in `tests/tests.js`), so tuning
  `config.js` never breaks them.
- The **simulator** plays hundreds of 30-second rounds with robot players, without real timers, and checks
  the goals in [balance.md](balance.md).
- **`tests/e2e.js`** starts the real `server.py` on a free port with a temporary data folder (the real `data/`
  is never touched), and drives real Chrome through the DevTools protocol using Node's built-in WebSocket, so
  there's nothing to install. It covers the play-mode lockdown, the tutorial's two steps, its profile radar
  and its words in every version, both radar versions, the 6-person grid, the avatar reactions (they come and go, never move
  the layout or say anything about the tastes, and fade in place with reduced motion), the fit at
  1366 × 600 and 1024 × 768, the name screen's checks (and the page opened from `file://`), the results text, the
  CSV files and the leaderboard read straight from disk, a second session's `(2)` files, the saving program
  stopping mid-session ("Could not save", only *Try again*, nothing downloaded, saved once it is back), Continue
  blocked while it is down, `server.py`'s refusals (paths, Origin, Host, size), and the frantic-click and pause
  loopholes.

## Data and logging
- Every event flows `logger` → pending → `flush(records)` → stored → `files()` → `saveFinished()` / `saveUnsaved()`.
  `flush()` is the **only exit**; the CSV files are written from what it stored.
- **CSV columns.** The first 11 are the agreed set, in this order: `session_id, timestamp_ms, phase, vp_id,
  event, topic, liked, attention_before, attention_after, fatigue_mult, tastes_json`. After them come
  `round_no, round_time_sec, detail, post_no, clock_time`, then `taste_<topic>` for each topic in topic order
  (`tastes_json` as plain numbers), then `grade` ("8th", or what the player typed; the same on every row of a
  session), then `date_time, session_sec, wait_sec`. New columns go at the end only.
- **The three time columns.** `date_time` is `timestamp_ms` as the laptop's date and time to the millisecond
  (`2026-10-17 13:31:04.873`, a space rather than ISO's `T`, which Excel doesn't read as a date). `session_sec` is
  wall-clock seconds since `logger.setPlayer()` (the name screen's Continue), or since the session's first row when
  there was no name screen. `wait_sec`, on `push` rows only, is how long that person sat free before the post, on
  their own clock (pauses and pop-ups don't count); `logger.watch()` tracks it per person, good to about one frame.
- **`topic` and `post_no`** are filled on `push`, on `watch_end` (the post that ended) and on an `afk` caused by a
  skip; an idle `afk` has neither. A push and its watch_end share `post_no`, which restarts with each new person
  (each round, each tutorial "Try again").
- **Events:** `push`, `watch_end`, `afk`, `round_start`, `round_end`, `pause`, `resume`. On `round_start`,
  `detail` says which version was played.
- **Sealed during play:** while a tutorial or a round is running, `stored()` and `files()` return `[]`, and
  `saveUnsaved()` returns `null`, because the log holds the drifting tastes. `endRound()`
  moves to the `reveal` phase as soon as the round is over (before the "Time's up!" banner), so the round's file
  can be written right away.
- **The data folder** is `data/` next to `server.py` (or `--data`): `data/First_Last/First_Last_tutorial.csv`,
  `First_Last_round1.csv`… and `data/leaderboard/leaderboard.csv`. `server.py` makes the folders when needed.
- **The saving program's API** (`server.py`, called only by `js/datafolder.js`): `GET /api/health` → `{ok}`;
  `POST /api/write` with JSON `{folder, file, text}` → `{ok}`; `GET /api/read?folder=&file=` → `{text}` (`null` when
  there is no file, so a missing leaderboard isn't an error); `GET /api/exists?folder=&file=` → `{exists}`. The game
  decides every name (cleaning, `(2)`); the server only refuses what isn't `data/<folder>/<file>.csv`.
- **`DS.dataFolder.ready()`** means the saving program answered the name screen's last check (`check()`, run when
  the screen opens and again on Continue). `logger.hasFolder()` and `leaderboard.hasFolder()` read it.
- **Each part saves itself when it ends** (`logger.saveFinished()`, called by `game.js`): the tutorial when the
  round starts, a round when it ends. It never writes the live part (the round still being played). A file is
  written whole each time (a tutorial replay rewrites the tutorial file). **Log out** (`saveUnsaved()`) always
  asks the saving program (it may be back), writes whatever is still unsaved, then `logger.reset()`. **Nothing
  ever downloads.** If a save fails, every row stays in memory and the "Could not save" pop-up offers only *Try
  again*; a failed `(2)` name lookup is forgotten so the retry asks again.
- **Nothing is written over:** the first time a session saves a part, `folderFileName()` checks the folder; a file
  left by an earlier session (the same student again, or a namesake) makes it `First_Last_round1 (2).csv`.
- **Testable without the server:** `logger.hasFolder`, `writeFile` and `fileExists` (and the leaderboard's
  `hasFolder`, `readFile`, `writeFile`) are replaceable. The file functions may return a value or a promise
  (`when()`), so the unit tests stay synchronous while the real saving program is asynchronous.
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
- **Sending the rows to a server too:** put one `fetch` POST inside `logger.flush()` (the comment above it has the
  code) and keep the line that stores the records. A class-wide server at another address needs CORS (the page
  comes from `server.py`'s address); an `/api/log` endpoint added to `server.py` itself doesn't.

## Security posture
Play mode (the default) freezes `DS`, the settings, the dice, the metrics, the logger, the leaderboard, the
data folder and the person model, and hides `DS.game.current`, so a curious student can't change the game from the console. It's a
speed bump, not security: the answers are in `content.js`, and anything in a browser can be edited. Never
use scores for grades.

`server.py` is the one thing that can write to the disk, so it is strict:
- **Reachable only from this laptop:** it binds `127.0.0.1`, never `0.0.0.0`.
- **Only the game's page may write:** a write needs `Origin: http://localhost:<port>` (or `127.0.0.1`) and a JSON
  body (another site can't send one without a CORS preflight, which it never allows). Every request needs a
  `Host` of `localhost:<port>` or `127.0.0.1:<port>`, which stops DNS rebinding. A page opened from a file
  (`Origin: null`) is refused too.
- **Only `data/<folder>/<file>.csv`:** single names (no `/`, `\`, `..`, hidden names or the characters
  `logger.cleanName` drops), `.csv` only, `leaderboard/` holds only `leaderboard.csv`, the resolved path must stay
  in `data/`, and a body over 5 MB is refused.
- **It never serves `data/` or hidden files as pages**, and lists no folders: the CSVs leave only through the API.
- Anyone at the laptop can still read `data/` in the file manager, as before.
