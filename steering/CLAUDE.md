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
| [tech.md](tech.md) | write code: the hard constraints (file://, ES5, no modules), browser support, commands, checks, data |
| [structure.md](structure.md) | look for where something lives, how the pieces talk, the game's states, the radar, or how to add things |
| [content.md](content.md) | write anything a player sees: people, speech bubbles, tutorial and results wording, accessibility |
| [balance.md](balance.md) | change a number in `js/config.js`: what "balanced" means, the current tuning, the simulator's goals |

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
- **The log is sealed during play:** `logger.stored()` is `[]` and `exportCSV()` is `null` during the
  tutorials and the round, because the log holds the drifting tastes. Tests read it through `openLog()`.
- **Tests pin their own config** (`PINNED` in `tests/tests.js`), so tuning never breaks them. A new key that
  a test depends on goes into `PINNED`.
- **Layout budgets:** the board fits windows at least 1001px wide and about 560px tall; each results step
  must fit about 445px. `tests/e2e.js` and `DS.dev.measureReveal()` check this.
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
  `logger.flush()`.
- **The player's name only names the CSV file** (`logger.fileName()`). Never put it in a row or a column: the rows
  are what a future server receives.
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
  the "Guess the profile" bonus puzzle (`js/guess.js`) on the last results step.
- 2026-10-11: exploring vs exploiting. The tutorial is a cold start (Alex's radar starts empty; the round's
  radars are unchanged). Each card's avatar reacts to every post (❤️, 💬, 👆). The results say "You tried 3 of
  6 topics" per person and define both words on the big-picture step. The simulator now reports how often a
  blind player finishes the tutorial ([balance.md](balance.md#the-tutorial-explore-then-exploit)).
- 2026-10-11, later: the tutorial ends only when every topic is tried and Alex is at 90 (its win pop-up adds
  "Replay the tutorial"), a 2-second watch, and no skip streaks on good picks (`SKIP_STREAK_BREAK`).
- 2026-10-12: the tutorial is two named steps on a profile radar drawn like "Guess the profile": Explore (try
  all 6 topics), then Exploit (3 watches in a row). The two words are now said in the tutorial too.
- 2026-10-12, later: a name screen first. The player's first and last name name the CSV (`Kai_Moreno.csv`), and
  nothing else: the name is in no row.
- 2026-10-12, later: Alex has 3 favorites side by side on the radar, so the tutorial's profile ends as a filled
  shape instead of a line ([balance.md](balance.md#the-tutorial-explore-then-exploit)).
- 2026-10-13: everyone in the round has 3 favorites side by side too (filled wedges on the radars), with a retune
  (skips 18, drain 4/s, softer fatigue). The tutorial keeps its old skip cost and drain ([balance.md](balance.md)).
- 2026-10-13, later: the tutorial opens with the job ("You are the algorithm: keep Alex on the app as long as
  possible"), explores with random topics as tests, then exploits what passed ([content.md](content.md)).
- Not built, by design: the Flask endpoint (one `fetch` in `logger.flush`), sound, accounts.
