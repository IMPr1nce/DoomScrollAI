# CLAUDE.md — Doomscroll AI

Browser game for 8th graders (AI4K12). The student plays a recommender algorithm: they push posts to two
simulated people ("Virtual Profiles", VPs) to keep their attention. Hidden lesson: chasing engagement
narrows what people see (a filter bubble). Fun first; the results screen reveals the cost. The team lead
wants to understand the code, so **comment the why, not the what.**

This file is the entry point to the project's steering documents, which all live in `steering/`.
`.claude/CLAUDE.md` imports every one of them, so Claude Code reads them at the start of each session.
Paths in backticks are relative to the project root.

| Document | Read it when you… |
|---|---|
| [product.md](product.md) | need the why: who it's for, the lesson, a player's session, the principles, and the **decision log** |
| [tech.md](tech.md) | write code: the hard constraints (server.py, ES5, no modules), browser support, commands, checks, data |
| [structure.md](structure.md) | look for where something lives, how the pieces talk, the game's states, the radar, or how to add things |
| [content.md](content.md) | write anything a player sees: people, speech bubbles, tutorial and results wording, accessibility |
| [balance.md](balance.md) | change a number in `js/config.js`: what "balanced" means, the current tuning, the simulator's goals |
| [results-story.md](results-story.md) | want the history of a person's results step: the spec for the story sentence and stacked layout (built 2026-10-22; its rules now live in content.md and product.md) |

## Working agreement
- Match the code around you: ES5, one `DS` global, comments that explain why.
- After a change, run the checks that cover it ([tech.md](tech.md#checks)). Report what you ran and what failed.
- When a rule or decision changes, update the steering document that owns it in the same change, and the
  README if a teacher would notice.
- The team lead's design calls are final once made ([decision log](product.md#decision-log)). Raise a
  concern once, then build what was asked. If you offer a compromise, check that it still does what they asked for.

## Things that are easy to get wrong
- **The current tastes (`vp.tastes`) never appear during play** (not in the DOM, aria-labels or classes).
  They drift, and the drift is the hidden lesson. The interests radar reads only `vp.tasteSnapshotStart`,
  drawn once when the card is made (`tests/e2e.js` checks that it doesn't change after a push). The avatar
  reactions read only the push event's `liked` and `fatigueMult`.
- **The tutorial's radar changes on purpose; the round's never does.** The tutorial card passes
  `radarShows: 'profile'` (an empty profile that grows a ring per watch), so its pop-ups must follow the
  tutorial's card, not `ui.showsInterests()`. Only the win pop-up's "Now the radars come filled in" line asks
  about the round.
- **The state machine in `game.js`:** `active.frozen` stops everything (pop-ups, the "ready?" card, pause, a
  finished round); `active.paused` means only a real pause, so `resume()` can't unfreeze the others. Stale
  `setTimeout`s must check `active === token` ([structure.md](structure.md#game-state)).
- **Click guard:** any button a frantic click could hit right after a screen change must be wrapped in
  `ui.guarded(fn)`. Pop-up and results buttons already are; game buttons aren't.
- **Play-mode lockdown:** unless `?dev` / `DEV_MODE`, `game.js` freezes `DS`, `DS.CONFIG`, `DS.rng`,
  `DS.metrics`, `DS.logger` and `VP.prototype`, and leaves out `DS.game.current`. So game code must never
  write to `DS.CONFIG` at runtime. (`tests.html` and `sim.html` don't load `game.js`, so they can.)
- **The log is sealed during play:** `logger.stored()` and `files()` are `[]` and `saveUnsaved()` is `null` during the
  tutorials and the round, because the log holds the drifting tastes. Tests read it through `openLog()`.
  `saveFinished()` may run during play but never writes the live part; `endRound()` moves to `reveal` first.
- **Tests pin their own config** (`PINNED` in `tests/tests.js`), so tuning never breaks them. A new key that
  a test depends on goes into `PINNED`.
- **Layout budgets:** the board and the name screen fit windows at least 1001px wide and about 560px tall; each results
  step must fit about 445px (the leaderboard's 10 rows only fit as two columns; a person's step is three stacked panels whose
  radars take the rest, about 136px tall at 1366 × 600, and must stay 110px+). `tests/e2e.js` and `DS.dev.measureReveal()` check this.
- **The radar lives in two places that must agree:** `js/radar.js` and the `.radar` rules in
  `css/style.css` ([structure.md](structure.md#the-radar)).
- **Words have rules** (results must be honest; no he/she; sentences of 24 words or fewer; speech bubbles
  of 40 characters or fewer; "exploring" and "exploiting" in the tutorial and the big-picture step, never in the
  round): [content.md](content.md).
  A new results outcome needs new wording and a new test.
- **Balance was tuned for 2 people with 3 favorites each, a 30-second round and a 2-second watch.** Changing
  anyone's tastes, `PROFILE_COUNT`, the
  dice (including `SKIP_STREAK_BREAK`), the watch, the drain or the drift means re-running the simulator
  ([balance.md](balance.md)).
- **The first 11 CSV columns are the agreed set.** Add new ones at the end. Everything leaves through
  `logger.flush()`. Each session saves one file per part: the tutorial, then each round (`logger.files()`).
- **The player's name only names the folder and CSV files** (`logger.folderName()`, `logger.fileName(part)`). Never put it
  in a row or a column: the rows are what a future server receives. The **gamer tag** is only in the leaderboard
  file, never in the rows; the **grade** comes right after the `taste_<topic>` columns (the time columns follow it).
- **Saving is async, the tests are not.** The logger's and leaderboard's file functions may return a value or a
  promise (`when()`); the unit tests replace them with plain functions (`fakeFolder()`), and `tests/e2e.js` runs the
  real `server.py` on a temporary data folder. A save that finishes after Log out must touch only its own session
  object, never `logger.reset()`'s new one. A failed save must keep every row: nothing downloads, so *Try again* is
  the only way on.
- **Only `server.py` writes to the disk**, and only `js/datafolder.js` talks to it. Keep its checks (127.0.0.1,
  Host, Origin, JSON, `data/<folder>/<file>.csv`, 5 MB) when adding an endpoint ([tech.md](tech.md#security-posture)).
- **Never write over a student's file:** a part's folder name is picked once per session (`folderFileName()`), adding
  ` (2)` when an earlier session left the same name.
- When editing a file with a script, **don't slice by a comment string that appears twice** (it once
  clobbered half of `reveal.js`). Prefer exact multi-line edits, then re-run the tests.

## Status
- Phases 1–6 done: model, simulator, tutorial, main game, results + logger + CSV, polish + docs.
- 2026-10-05: fairer dice, 4 people, radar cards, results radars, playtest switches. Then the interests radar
  became the default (the results compare the radar at the start and the end), narrow radar buttons made the
  board fit 1001–1180px-wide windows, and the steering documents were written.
- 2026-10-07: one tutorial with a chain of explanatory pop-ups and one-time hints (the "Lose them" tutorial is
  gone), a 30-second round, and 2 people by default (`?profiles=4` and `?profiles=6` still work). Drain and
  starting attention were retuned for it ([balance.md](balance.md)).
- 2026-10-07: tutorial pop-ups point at what they explain (a spotlight), favorites liked ~95% of the time, and
  the "Guess the profile" bonus puzzle (`js/guess.js`) on the last results step (removed 2026-10-15).
- 2026-10-11: exploring vs exploiting. The tutorial is a cold start (Alex's radar starts empty; the round's
  radars are unchanged). Each card's avatar reacts to every post (❤️, 💬, 👆). The results say "You tried 3 of
  6 topics" per person and define both words on the big-picture step. The simulator now reports how often a
  blind player finishes the tutorial ([balance.md](balance.md#the-tutorial-explore-then-exploit)).
- 2026-10-11, later: the tutorial ends only when every topic is tried and Alex is at 90 (its win pop-up adds
  "Replay the tutorial"), a 2-second watch, and no skip streaks on good picks (`SKIP_STREAK_BREAK`).
- 2026-10-12: the tutorial is two named steps on a profile radar: Explore (try
  all 6 topics), then Exploit (3 watches in a row). The two words are now said in the tutorial too.
- 2026-10-12, later: a name screen first. The player's first and last name name the CSV (`Kai_Moreno.csv`), and
  nothing else: the name is in no row.
- 2026-10-12, later: Alex has 3 favorites side by side on the radar, so the tutorial's profile ends as a filled
  shape instead of a line ([balance.md](balance.md#the-tutorial-explore-then-exploit)).
- 2026-10-13: everyone in the round has 3 favorites side by side too (filled wedges on the radars), with a retune
  (skips 18, drain 4/s, softer fatigue). The tutorial keeps its old skip cost and drain ([balance.md](balance.md)).
- 2026-10-13, later: the tutorial opens with the job ("You are the algorithm: keep Alex on the app as long as
  possible"), explores with random topics as tests, then exploits what passed ([content.md](content.md)).
- 2026-10-15: "Guess the profile" removed; **Log out** on the big-picture step saves the unsaved files and starts
  a new session on the name screen. One CSV per part (`Kai_Moreno_tutorial.csv`, `Kai_Moreno_round1.csv`…), and
  new columns at the end: `post_no`, `clock_time`, `taste_<topic>` ([tech.md](tech.md#data-and-logging)).
- 2026-10-17: the name screen asks for a grade (8th or typed) and a gamer tag; the files save themselves into a
  `data` folder the teacher picks (`data/First_Last/…`, Chrome's folder picker, no Download button); a 🏆 Leaderboard
  step before the big picture ranks every round on the laptop by points (`data/leaderboard/leaderboard.csv`).
- 2026-10-20: a small local saving program, `server.py` (Python 3 standard library), serves the game at
  `http://localhost:8765` and writes every CSV into `data/`: no folder picker and nothing ever downloads. The name
  screen checks it ("✓ Saving program is running.") and Continue waits for it; a failed save offers only *Try
  again*. Files, names, `(2)` and columns are unchanged. The game no longer opens with a double-click.
- 2026-10-21: the results speak in counts: a headline per person ("…4 topics they'd enjoy. By the end, only 2."),
  the variety line in watched topics per half (the 0–1 numbers stay on the bars), no "too few watched posts" dead
  ends, a filter-bubble definition and loop on the big picture (only when feeds narrowed), and question 2 asks about
  the student's own feed ([content.md](content.md#results-wording-must-be-honest)).
- 2026-10-22: each person's results step tells a story ("You showed Maya mostly Sports, so Maya is drifting into a Sports
  bubble and lost interest in Comics."), with the bubble's definition under it; the variety panel and the headline are
  gone (variety stays on the big picture). One column of three panels, lost/gained chips beside the radars, which shrink
  to about 136px. "Bubble" needs a main topic still enjoyed; lost topics use the radar's printed percents.
- 2026-10-25: three time columns for research at the end of every row: `date_time` (`2026-10-17 13:31:04.873`),
  `session_sec` (seconds since the name screen) and `wait_sec` (on a push, how long that person sat free first)
  ([tech.md](tech.md#data-and-logging)). The grade is no longer the last column.
- Not built, by design: a shared or Flask server (one `fetch` in `logger.flush`), sound, accounts, a class-wide leaderboard.
