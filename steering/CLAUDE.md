# CLAUDE.md — Doomscroll AI

Browser game for 8th graders (AI4K12). The student plays a recommender algorithm: they push posts to four
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
  drawn once when the card is made (`tests/e2e.js` checks that it doesn't change after a push).
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
  of 40 characters or fewer): [content.md](content.md). A new results outcome needs new wording and a new test.
- **Balance was tuned for 4 people.** Changing `PROFILE_COUNT`, the dice, the drain or the drift means
  re-running the simulator ([balance.md](balance.md)).
- **The first 11 CSV columns are the agreed set.** Add new ones at the end. Everything leaves through
  `logger.flush()`.
- When editing a file with a script, **don't slice by a comment string that appears twice** (it once
  clobbered half of `reveal.js`). Prefer exact multi-line edits, then re-run the tests.

## Status
- Phases 1–6 done: model, simulator, tutorials, main game, results + logger + CSV, polish + docs.
- 2026-10-05: fairer dice, 4 people, radar cards, results radars, playtest switches. Then the interests radar
  became the default (the results compare the radar at the start and the end), narrow radar buttons made the
  board fit 1001–1180px-wide windows, and the steering documents were written.
- Not built, by design: the Flask endpoint (one `fetch` in `logger.flush`), sound, accounts.
