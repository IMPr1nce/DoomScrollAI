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
| Skill beats luck | random beats the blind learner in at most 10% of match-ups | the game must not feel like dice |

**The robots:** `random`; `spam`, which shows each person their favorite every time; `mix`, which rotates
through everything a person still enjoys; and `learner`, which doesn't peek: it tries topics, then sticks
with what got likes. There are a few more diagnostic robots. `spam` and `mix` know the tastes, which is
what a player following the interests radar knows. `learner` plays like someone using `?radar=learned`.

## What players get today
Average attention (0–100) over 200 rounds, by how often the robot clicks. All 7 goals pass at every speed.

| One click every | Random | Spam (always the longest spike) | Mix (second-half variety) | Learner (blind) | Random beats learner |
|---|---|---|---|---|---|
| 1.0 s | 25.8 | 93.5 | 84.9 (0.55) | 72.4 | 0.8% |
| 1.5 s | 22.5 | 84.4 | 70.2 (0.61) | 52.5 | 2.5% |
| 2.0 s | 20.4 | 63.9 | 51.6 (0.65) | 38.4 | 7.1% |

With the interests radar, speed is the main skill. A robot that always shows the longest spike beats random
clicking by 44–68 points. Real kids are slower and make mistakes, so read these as best cases.

## Current tuning, and why
| Setting | Value | Why |
|---|---|---|
| `ATTENTION_START` | 60 | From the brief. An ignored person leaves after 30 s; five skips in a row empty the bar. |
| `IDLE_DRAIN_PER_SEC` | 2.0 | What forces juggling (it was 1.5 with six people). |
| `LIKE_GAIN` | 20 | Earned gradually over the watch (was 15). |
| `DISLIKE_PENALTY` | 12 | Lands at once, so a bad pick is felt. |
| `POST_DURATION_SEC` | 3 | More decisions per minute with four people (was 5). |
| `ROUND_SEC` | 90 | From the brief. |
| `FATIGUE_MULTIPLIERS` | 1, 0.85, 0.7, 0.6 | Softened from 1, 0.7, 0.45, 0.3, which made mixing beat spamming (the lesson flipped). |
| `FATIGUE_LIKE_PENALTY` | 0.02 | Was 0.05: then a player who knew the answer was skipped 23% of the time. |
| `DRIFT_UP` / `DRIFT_DOWN` | 0.12 / 0.04 | The bubble engine. A `DRIFT_DOWN` above 0.04 squeezes even a player who mixes on purpose. |
| `TASTE_FAVORITE` / `TASTE_MEH` / `TASTE_DISLIKED` | 0.92 / 0.5 / 0.08, ± 0.04 jitter | "Fairer dice": a right pick is rarely punished, but never certain. |

## Rules of thumb
- **Fatigue too harsh** → mixing beats spamming → the lesson flips.
- **`DRIFT_DOWN` too high** → even mixers end up narrow → "you had a choice" stops being true.
- **Favorites closer to 0.5** → luck comes back. Watch the last goal.
- **More people, a longer watch or a faster drain** → harder. Re-check that random still loses people and
  spam still keeps them.
- **Changing `PROFILE_COUNT` or the dice** → re-run everything. The current numbers were tuned for four people.

## How to change a number
1. Try it without editing anything: paste overrides into the "Config overrides" box in `sim.html`, or run
   `DS.sim.runAll({ overrides: { DRIFT_DOWN: 0.05 }, clickIntervalSec: 1.5 })` in Node.
2. All 7 goals should pass at click intervals of 1.0 and 1.5 s. Check 2.0 s for slower kids.
3. Put the value in `js/config.js` with a comment saying why, and what it was before.
4. Run the unit tests (they pin their own values, so they shouldn't change) and `tests/e2e.js`.
5. Update this file's tables, and the README's tuning table if teachers would touch the setting.
