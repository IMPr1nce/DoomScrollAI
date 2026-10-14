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

| One click every | Random (people lost, of 2) | Spam (always the longest spike) | Mix (second-half variety) | Learner (blind) | Random beats spam |
|---|---|---|---|---|---|
| 1.0 s | 39.4 (1.13) | 91.6 | 88.1 (0.77) | 77.7 | 0.0% |
| 1.5 s | 34.7 (1.24) | 85.2 | 80.7 (0.86) | 66.5 | 0.5% |
| 2.0 s | 30.1 (1.32) | 75.1 | 70.0 (0.93) | 53.0 | 1.0% |

Measured on 2026-10-13, after everyone got 3 favorites side by side and 1 "meh", with the retune that came with
it (`DISLIKE_PENALTY` 18, `IDLE_DRAIN_PER_SEC` 4.0, `FATIGUE_MULTIPLIERS` 1, 0.95, 0.9, 0.85). The closest goal is
now the temptation at 1 s per click: spam beats mix by 3.5 points (4.5 at 1.5 s, 5 at 2 s). At 3 s per click,
not one of the speeds the goals cover, spam averages 52.4 against the floor of 55 (it was 56.7 before the retune).

**Why the retune.** With 3 favorites, half the topics are near-sure picks. Unchanged, random play kept people
(0.4 of 2 lost, against a floor of 1) and mixing tied spamming at 1.5 s per click (85.7 vs 85.6), so the lesson
flipped. A harsher skip and drain make random clicks costly again. Softer fatigue keeps "show the favorite" the
best score, because rotating three sure picks would otherwise dodge most of the old fatigue.

With the interests radar, speed is the main skill. A robot that always shows the longest spike beats random
clicking by 45–55 points. Real kids are slower and make mistakes, so read these as best cases.

**The luck goal changed on 2026-10-07.** It used to compare random with the *blind learner* (the player of
`?radar=learned`). In a 30-second round with 2 people the learner has barely time to learn (random beat it
15–25% of the time), so with the default interests radar the goal now compares random with *spam*, the
player who follows the longest spike. With `?radar=learned` it still uses the learner, and that version
does not pass at 30 s: if you playtest it, expect it to feel luckier.

## The tutorial: explore, then exploit
Since 2026-10-12 the tutorial has two steps. Step 1: Alex's profile starts empty, so the first picks are blind,
and every topic has to be tried. Step 2: `TUTORIAL_EXPLOIT_STREAK` (3) watches in a row, where a skip starts the
count again. After its goals, the simulator prints one line on the tutorial. It's a report, not one of the
7 goals. The line comes from a blind but sensible robot (`tutorialTopic` in `sim/sim.js`). It tries each topic
once in a random order, then repeats a topic Alex watched while it pays in full, and switches when a repeat
stops paying, to another topic Alex watched more often than skipped. "Seconds to pick" counts from when Alex
is free again.

| Seconds to pick | Finished (200 runs) | Average to the finish |
|---|---|---|
| 1.0 | 100% | 24 s, 10.9 posts |
| 1.5 | 100% | 29 s, 10.9 posts |
| 2.0 | 100% | 35 s, 10.9 posts |
| 3.0 | 94.5% | 46 s, 11.0 posts |

The 2026-10-13 retune left these unchanged, because the tutorial keeps its own numbers: skips cost
`TUTORIAL_DISLIKE_PENALTY` (12, not the round's 18), and `TUTORIAL_DRAIN_MULT` (0.375) keeps Alex's drain at
1.5/s. With the round's skip cost a blind player lost Alex in about 1 tutorial in 5 at 2 s per pick.

Measured on 2026-10-12, after Alex got three favorites side by side on the radar (Dance, Music, Comics) and one
"meh" (Sports), so the finished profile is a filled shape instead of a line. With two favorites (Music and Food,
opposite each other) it was 96.5–97.5% at 1–2 s and 82.5% at 3 s, and about a fifth of finished profiles were a
flat line. Step 1 now costs about 2.5 skips on average (was about 3).

The losses come in step 1: Alex starts at 50, and four early skips (−48, plus the drain) are enough to lose
them. The player then gets "Alex left!" and a fresh Alex. Step 2 almost never loses anyone: by then the
player knows what Alex watches, and `SKIP_STREAK_BREAK` means a favorite is never skipped twice in a row. If
the finish rate needs raising, a tutorial-only skip penalty of 8 measured best on the old tutorial (it barely
shortens it); a higher tutorial start shortens it.

## Current tuning, and why
| Setting | Value | Why |
|---|---|---|
| `ATTENTION_START` | 50 | Was 60 (the brief). With 30 s and 2 people, 60 left random play losing only 40% of people. |
| `IDLE_DRAIN_PER_SEC` | 4.0 | Was 3.0 (and 2.0 before). With 3 favorites each, random play needs to cost more to still lose people. An ignored person is gone in about 12 s. |
| `LIKE_GAIN` | 20 | Earned gradually over the watch (was 15). |
| `DISLIKE_PENALTY` | 18 | Lands at once, so a bad pick is felt. Was 12: with 3 favorites, a random click lands on one half the time. |
| `TUTORIAL_DISLIKE_PENALTY` / `TUTORIAL_DRAIN_MULT` | 12 / 0.375 | The tutorial keeps the old skip cost and Alex's old 1.5/s drain: its first picks are blind. |
| `POST_DURATION_SEC` | 2 | The team lead asked for a faster game (was 3, and 5 before that). More posts per person also means more drift, so the bubble shows more clearly. |
| `ROUND_SEC` | 30 | Was 90 (the brief); the team lead asked for 30. |
| `PROFILE_COUNT` | 2 | Was 4, and 6 before that. |
| `FATIGUE_MULTIPLIERS` | 1, 0.95, 0.9, 0.85 | Softened from 1, 0.7, 0.45, 0.3 (mixing beat spamming), then from 1, 0.85, 0.7, 0.6 when everyone got 3 favorites (rotating three sure picks made mixing win at 2 s per click). A repeat now costs a little. |
| `FATIGUE_LIKE_PENALTY` | 0.02 | Was 0.05: then a player who knew the answer was skipped 23% of the time. |
| `SKIP_STREAK_BREAK` | 0.6 | Right after a skip, a post with at least this like chance always lands, so a long spike is never skipped twice in a row. Rounds with someone skipping 2+ in a row fell from 55% to 17%. At 0.5 (which also covers "meh" topics) it was 2%, but random play stopped losing half its people at 1 s per click. `null` = pure dice. |
| `DRIFT_UP` / `DRIFT_DOWN` | 0.12 / 0.04 | The bubble engine. A `DRIFT_DOWN` above 0.04 squeezes even a player who mixes on purpose. |
| `TASTE_FAVORITE` / `TASTE_MEH` / `TASTE_DISLIKED` | 0.95 / 0.5 / 0.08, ± 0.03 jitter (`TASTE_MAX` 0.97) | "Fairer dice": a right pick is rarely punished, but never certain. Favorite was 0.92 until 2026-10-07, when players still felt too many skips on a long spike. Since 2026-10-13 everyone has 3 favorites side by side, 1 "meh" and 2 disliked topics (`content.js`). |

**Thin data.** A careful player shows each person about 15 posts in a round at 1 s per click (about 7 per
half), and about 10 at 1.5 s. So the results' variety numbers rest on few posts, and a person who leaves in
the first half has no second half ("too few watched posts"). The wording handles this honestly, but the 30-second round has less to show
than the old 90-second one.

## Rules of thumb
- **Fatigue too harsh** → mixing beats spamming → the lesson flips.
- **`DRIFT_DOWN` too high** → even mixers end up narrow → "you had a choice" stops being true.
- **Favorites closer to 0.5** → luck comes back. Watch the last goal.
- **More favorites per person** → random play keeps people, and mixing catches up with spamming. Going from 1–2
  to 3 needed a harsher skip, a faster drain and softer fatigue.
- **`SKIP_STREAK_BREAK` at or under 0.5** → it starts rescuing "meh" topics, which helps random play keep
  people. Watch the first goal.
- **More people, a longer watch or a faster drain** → harder. Re-check that random still loses people and
  spam still keeps them.
- **Changing `PROFILE_COUNT`, the dice or anyone's tastes** → re-run everything. The current numbers were tuned for
  two people with 3 favorites each, 30 seconds and a 2-second watch.

## How to change a number
1. Try it without editing anything: paste overrides into the "Config overrides" box in `sim.html`, or run
   `DS.sim.runAll({ overrides: { DRIFT_DOWN: 0.05 }, clickIntervalSec: 1.5 })` in Node.
2. All 7 goals should pass at click intervals of 1.0 and 1.5 s. Check 2.0 s for slower kids.
3. Put the value in `js/config.js` with a comment saying why, and what it was before.
4. Run the unit tests (they pin their own values, so they shouldn't change) and `tests/e2e.js`.
5. Update this file's tables, and the README's tuning table if teachers would touch the setting.
