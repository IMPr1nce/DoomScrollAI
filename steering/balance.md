# Balance — Doomscroll AI

Read this before changing a number in `js/config.js`. Here, balance isn't only about fun: the numbers
decide whether the game teaches the right lesson.

## What "balanced" means: the simulator's 7 goals
`sim/sim.js` plays hundreds of rounds with robot players. Every goal must pass. The thresholds are in
`SIM_GOALS` in `js/config.js`.

| Goal | Threshold | Why it matters |
|---|---|---|
| Random play loses people | at least 50% of people AFK | choices have to matter |
| Spam-favorite keeps people | at most 20% AFK | the tempting strategy has to work… |
| Spam-favorite scores well | average attention of at least 55 | …and feel like winning |
| Spam beats mix-it-up on attention | spam > mix | **the temptation:** if mixing wins, the lesson flips |
| Spam crushes variety | second-half variety of at most 0.25 | the bubble has to show up in the results |
| Mix-it-up keeps variety | second-half variety of at least 0.5 | "you had a choice" has to be true |
| Skill beats luck | random beats a careful player in at most 10% of match-ups (careful = spam with the interests radar, the blind learner with `?radar=learned`) | the game must not feel like dice |

**The robots:** `random`; `spam`, which shows each person their favorite every time; `mix`, which rotates
through everything a person still enjoys; and `learner`, which doesn't peek: it tries topics, then sticks
with what got likes. There are a few more diagnostic robots. `spam` and `mix` know the tastes, which is
what a player following the interests radar knows. `learner` plays like someone using `?radar=learned`.

## What players get today
Average attention (0–100) over 200 rounds of 30 seconds with 2 people, by how often the robot clicks. All
7 goals pass at every speed.

| One click every | Random | Spam (always the longest spike) | Mix (second-half variety) | Learner (blind) | Random beats spam |
|---|---|---|---|---|---|
| 1.0 s | 35.8 | 88.6 | 79.0 (0.63) | 62.3 | 0.2% |
| 1.5 s | 34.8 | 86.5 | 73.4 (0.67) | 55.3 | 0.4% |
| 2.0 s | 31.0 | 79.1 | 63.5 (0.73) | 45.2 | 1.1% |

With the interests radar, speed is the main skill. A robot that always shows the longest spike beats random
clicking by 45–55 points. Real kids are slower and make mistakes, so read these as best cases.

**The luck goal changed on 2026-10-07.** It used to compare random with the *blind learner* (the player of
`?radar=learned`). In a 30-second round with 2 people the learner has barely time to learn (random beat it
15–25% of the time), so with the default interests radar the goal now compares random with *spam*, the
player who follows the longest spike. With `?radar=learned` it still uses the learner, and that version
does not pass at 30 s: if you playtest it, expect it to feel luckier.

## Current tuning, and why
| Setting | Value | Why |
|---|---|---|
| `ATTENTION_START` | 50 | Was 60 (the brief). With 30 s and 2 people, 60 left random play losing only 40% of people. |
| `IDLE_DRAIN_PER_SEC` | 3.0 | Was 2.0. An ignored person is gone in about 17 s, so juggling still matters in a 30 s round. |
| `LIKE_GAIN` | 20 | Earned gradually over the watch (was 15). |
| `DISLIKE_PENALTY` | 12 | Lands at once, so a bad pick is felt. |
| `POST_DURATION_SEC` | 3 | More decisions per minute (was 5). |
| `ROUND_SEC` | 30 | Was 90 (the brief); the team lead asked for 30. |
| `PROFILE_COUNT` | 2 | Was 4, and 6 before that. |
| `FATIGUE_MULTIPLIERS` | 1, 0.85, 0.7, 0.6 | Softened from 1, 0.7, 0.45, 0.3, which made mixing beat spamming (the lesson flipped). |
| `FATIGUE_LIKE_PENALTY` | 0.02 | Was 0.05: then a player who knew the answer was skipped 23% of the time. |
| `DRIFT_UP` / `DRIFT_DOWN` | 0.12 / 0.04 | The bubble engine. A `DRIFT_DOWN` above 0.04 squeezes even a player who mixes on purpose. |
| `TASTE_FAVORITE` / `TASTE_MEH` / `TASTE_DISLIKED` | 0.95 / 0.5 / 0.08, ± 0.03 jitter (`TASTE_MAX` 0.97) | "Fairer dice": a right pick is rarely punished, but never certain. Favorite was 0.92 until 2026-10-07, when players still felt too many skips on a long spike. |

**Thin data.** Each person gets only about 10 pushes in a round (about 5 per half), so the results'
variety numbers rest on very few posts, and a person who leaves in the first half has no second half
("too few watched posts"). The wording handles this honestly, but the 30-second round has less to show
than the old 90-second one.

## Rules of thumb
- **Fatigue too harsh** → mixing beats spamming → the lesson flips.
- **`DRIFT_DOWN` too high** → even mixers end up narrow → "you had a choice" stops being true.
- **Favorites closer to 0.5** → luck comes back. Watch the last goal.
- **More people, a longer watch or a faster drain** → harder. Re-check that random still loses people and
  spam still keeps them.
- **Changing `PROFILE_COUNT` or the dice** → re-run everything. The current numbers were tuned for two people and 30 seconds.

## How to change a number
1. Try it without editing anything: paste overrides into the "Config overrides" box in `sim.html`, or run
   `DS.sim.runAll({ overrides: { DRIFT_DOWN: 0.05 }, clickIntervalSec: 1.5 })` in Node.
2. All 7 goals should pass at click intervals of 1.0 and 1.5 s. Check 2.0 s for slower kids.
3. Put the value in `js/config.js` with a comment saying why, and what it was before.
4. Run the unit tests (they pin their own values, so they shouldn't change) and `tests/e2e.js`.
5. Update this file's tables, and the README's tuning table if teachers would touch the setting.
