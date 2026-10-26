# Doomscroll AI

**You ARE the algorithm.** A short browser game for 8th graders (AI4K12) about how recommender
systems work.

The student plays the algorithm. Two pretend people ("Virtual Profiles") are scrolling, and the
student pushes posts to each one to keep their attention up. It is fun to play. Then the results
screen shows what the student actually did: they kept everyone's attention by showing each person
more and more of the same thing, and the people's tastes narrowed. That is a filter bubble, and the
student made it by chasing attention. The class then talks about whether that was good for those
people.

No accounts, nothing to install but Python 3, nothing leaves the laptop. One small "saving program" runs on
each laptop and writes the data files. The student types their name (it only names their data files), their
grade, and a gamer tag for the leaderboard.

---

## How to run it

Before class, on each laptop:

1. Open a terminal in the project folder (on a Mac: right-click the folder in Finder → *New Terminal at Folder*).
2. Start the saving program:

   ```bash
   python3 server.py
   ```

   It prints one line: `Saving to /…/DoomScrollAI/data. Open http://localhost:8765`. **Keep that window open**
   while the class plays (minimize it); closing it, or pressing Ctrl + C, stops saving.
3. Open **http://localhost:8765** in Chrome (any current browser works). The first screen says
   **✓ Saving program is running.** Bookmark the address for next time.

That's all. It runs offline, and only this laptop can reach it. Every file lands in the `data` folder inside
the project (see [The data it records](#the-data-it-records)); nothing downloads and no browser prompt appears.
Each laptop keeps its own `data` folder and its own leaderboard, so collect the files from every laptop.

**Python 3:** Macs and Linux laptops have it. On Windows, install it from python.org (tick *Add to PATH*) and
type `python server.py` if `python3` isn't found. Chromebooks can't run it.

Double-clicking `index.html` no longer works: the first screen then says to start the saving program and
open `http://localhost:8765`.

**Screen size:** built for a 1366 × 768 school laptop (about 600 px of page height once Chrome's
toolbars are counted). Everyone fits on screen without scrolling in any window at least 1000 px wide
(under about 1180 px, the radar buttons get narrower, with the emoji above the word). Narrower windows
still work; the page just scrolls.

## What the student does (about 3 minutes)

1. **Who's playing?** The student types their first and last name, ticks **8th** (or types another grade),
   and picks a **gamer tag** (not their real name; a few rude words are refused). All are needed, and the
   saving program must be running (*Continue* checks it). Then the **title screen** → Start. The name names the student's folder and files; the
   grade goes in the data; the gamer tag only goes on the leaderboard.
2. **The tutorial:** one person, Alex, a brand-new user, in two named steps. The radar is Alex's
   **profile**: it starts empty, and each post Alex watches moves that topic
   out one ring (each button reads like "✓2 ✗1": watched twice, skipped once).
   - The first pop-up sets the job: "You are the algorithm: your job is to keep Alex on the app as long as
     possible."
   - **Step 1 · Explore:** push random topics as tests (does Alex watch, or skip?) until all 6 are tested.
     "Exploring = trying something new to learn more." Some posts get skipped: that's the cost of exploring.
   - **Step 2 · Exploit:** show only the topics that passed the tests, to keep Alex on the app; get 3 watches in
     a row. "Exploiting = showing what you know works." A skip starts the count again.
   - Hint pop-ups appear after the first watch, skip and repeat. The last pop-up says real apps do both with
     every user, that the game's radars come filled in, and that at 0 attention a person leaves, the worst
     outcome for a platform. It has two buttons: **Start the game** and **Replay the tutorial**. (A student
     who is unlucky with their first few picks may lose Alex and get *Try again*.)
3. **The game:** two people, 30 seconds. Everyone's attention drains when you ignore them. Show each
   person posts they like. At 0 they leave for good ("AFK"). The score is *still scrolling* and
   *average attention*; the leaderboard's *points* are everyone's attention when time runs out, added up. A liked post is watched for 2 seconds. After every post the person's avatar reacts:
   ❤️ for a watch (with 💬 when the topic was fresh), 👆 for a skip.
   Each person's six topic buttons sit around a **radar**, with a spike pointing at each button. The
   longer the spike, the more that person is into the topic, so a glance shows what to show them. The
   radar shows who they were **at the start of the round** and never changes. Every post they like
   quietly shifts their tastes toward it, but that stays hidden until the results.
4. **Results:** the score first (the win), then one screen per person. It opens with that person's story ("You
   showed Maya mostly Sports, so Maya is drifting into a Sports bubble and lost interest in Comics."), with the
   meaning of "filter bubble" right under it whenever it says "bubble". Then what you showed them and how many of
   the six topics you tried, and their radar twice: at the start (the one you played with) and at the end, usually
   shrunk toward a single spike, beside the topics they lost interest in. That's the filter bubble, and the
   student's own feed made it. Then the **🏆 Leaderboard**: every round played on this laptop, ranked by
   points, with the student's row marked "you". Then the big picture. When feeds narrowed, it defines a filter
   bubble in one line and shows the loop that built it ("you show Maya Sports → they watch → they like Sports
   more, the rest less → repeat"). One line names exploring and exploiting ("Exploiting = showing what you know
   works. Exploring = trying something new to learn more."), and three questions for the class follow, the
   second about the student's own feed. The tutorial introduced the two words; the round never uses them.
5. **Log out or Play again** (on the big-picture step). The files save themselves as each part ends, and the
   step says where. *Play again* starts a new round. *Log out* saves anything not saved yet, then goes back to
   the name screen for the next student.

Teacher tips:

- **Pause** with the button or the **Esc** key. Nothing changes until you resume.
- On a projector, the results screen moves with the **← →** arrow keys.
- After the first round, try **Play again** with a rule: "never show the same topic twice in a row".
  Compare the score, and the stories and "Average variety" numbers on the results.
- Switching to another tab pauses the game automatically.
- **Sharing a laptop:** when a student is done, press **Log out** on the last results step. Their files are
  saved, and the next student starts on an empty name screen.
- **The leaderboard** is `data/leaderboard/leaderboard.csv`. To remove a rude gamer tag, delete its row in a
  spreadsheet and save it as CSV. To start a fresh board (a new class), delete or rename the file.

### Comparing versions in a playtest

Three switches can be set from the address bar, so two groups can play two versions without anyone
editing a file. Add them after `index.html` (put the link in a bookmark):

| Link | Version |
|---|---|
| `index.html` | 2 people, radars showing what each person is into (the default) |
| `index.html?radar=learned` | 2 people, radars that start empty: a spike grows only after you show a topic ("4/5" = liked 4 of 5 times, "?" = never tried), and a **★** marks the topic each bio hints at. Players have to discover what each person likes. |
| `index.html?profiles=6&layout=grid` | the original: 6 people, 3 × 2 buttons (with the "4/5" counts and ★) |
| `index.html?layout=grid` | 2 people, 3 × 2 buttons |
| `index.html?profiles=4` | the 4-person board from before: a 2 × 2 grid of radars (the 90-second round is now 30 s; set `ROUND_SEC` for the old length) |

Six radars don't fit a laptop screen, so `profiles=6` always uses the buttons. Each round's `round_start`
rows in the CSV say which version was played (`radar-interests/2`, `radar-learned/2`, `grid/6`, ...), so the
data can be split by version.

---

## Changing the game: `js/config.js`

Every number that affects the game lives in `js/config.js`. Nothing is hard-coded anywhere else.
Edit the file, save it, reload the page.

| I want… | Change |
|---|---|
| **2, 4 or 6 people**, **radar or buttons** | `PROFILE_COUNT` (2), `TOPIC_LAYOUT` (`'radar'`), or the address-bar switches above |
| The radar to show **interests** or only **what the player has seen** | `RADAR_SHOWS` (`'interests'` or `'learned'`) |
| An **easier** game | raise `ATTENTION_START` or `LIKE_GAIN`; lower `IDLE_DRAIN_PER_SEC` or `DISLIKE_PENALTY` |
| A **harder** game | the opposite |
| A **longer or shorter** round | `ROUND_SEC` (30). The balance was tuned for 30 s and 2 people: see `steering/balance.md` |
| A **stronger filter bubble** on the results screen | raise `DRIFT_UP` (how fast a liked topic is learned) or `DRIFT_DOWN` (how fast other topics fade). Careful with `DRIFT_DOWN`: above about 0.04 (with 2-second watches) even a player who mixes topics on purpose gets squeezed, which weakens "you had a choice". The simulator checks this. |
| Spamming one topic to be **less rewarding** | lower `FATIGUE_MULTIPLIERS`. Careful: too harsh and mixing topics beats spamming, which flips the lesson. The simulator warns you. |
| Buttons to **stay live** while someone watches | `LIKED_LOCKS_BUTTONS: false` (a new post then cuts the current watch short) |
| A **longer or easier tutorial** | `TUTORIAL_EXPLOIT_STREAK` (3 watches in a row in step 2), `TUTORIAL_DRAIN_MULT` (0.375), `TUTORIAL_DISLIKE_PENALTY` (12, the tutorial's own skip cost). Step 1 always asks for every topic. `PROFILE_RINGS` (5) sets how many watches fill a spike on the tutorial's profile radar. |
| A **faster or slower game** | `POST_DURATION_SEC` (2): how long a liked post is watched. Check the simulator after changing it. |
| The **same game every time** (for a demo) | `RNG_SEED: 42` (any number; `null` = different every time) |
| **More or less luck** | `TASTE_FAVORITE` (0.95) and `TASTE_DISLIKED` (0.08): the closer to 1 and 0, the more a right choice is rewarded. `SKIP_STREAK_BREAK` (0.6): right after a skip, a topic with at least this like chance always lands, so long spikes are never skipped twice in a row (`null` = pure dice). `FATIGUE_LIKE_PENALTY` (0.02) adds a little luck back for repeated topics. |
| The `learned` radar to **trust one lucky like less** | raise `RADAR_SMOOTHING` (1) |
| The results screen to be **more or less strict** about calling a change real | `REVEAL_TREND_DELTA`, `REVEAL_LOW_VARIETY` |
| **More or fewer rows** on the leaderboard | `LEADERBOARD_TOP` (10, in two columns; more may not fit a laptop screen: run `tests/e2e.js`) |
| **Longer gamer tags** or typed grades | `GAMER_TAG_MAX` (16), `GRADE_MAX` (12) |

**After you change numbers, check the balance.** Open `sim.html`. It plays hundreds of rounds with
robot players and tells you whether the game still teaches the lesson:

- random play should **lose** people,
- spamming a favorite should **score well but crush variety**,
- mixing topics should **keep variety**,
- and **skill should beat luck**: a careful player should almost never lose to someone clicking at
  random (it reports how often that happens; it was 15% before the dice were made fairer, it's ~1–3% now).

(The same thing from a terminal: `node tests/run-node.js sim`.) The simulator also lets you try
changes without editing any file. Below the goals it reports how often a careful player who can't see
Alex's tastes finishes the tutorial's two steps (all of them at 1–2 seconds per pick today; at 3 seconds,
about 1 in 20 loses Alex once and tries again).

To change the **words and people**, edit `js/content.js`: the six topics (emoji and color), the
people (name, animal avatar, bio, which topics they love or find "meh", and `clue`: the topic their bio
hints at), and every speech-bubble line. Everyone loves 3 topics that sit side by side on the radar, so each
radar is a filled wedge, and finds 1 "meh". The balance is tuned for that: re-run the simulator if you change
anyone's tastes. Keep lines under 40 characters so they fit on one line of a
small card. **Order matters:** with 4 profiles the first four people play, and between them they must
love all six topics (the default of 2 plays Maya and Jordan). `tests.html` checks all of this.

---

## The data it records

Everything the game does is written to a log in the browser's memory: every post pushed, whether it
was liked, attention before and after, each person's tastes as they change, who left and why, pauses,
and the start and end of each round.

The saving program writes the files into the `data` folder next to `server.py`, one file per part of the
session, in a folder named after the student:

```
data/
  Kai_Moreno/
    Kai_Moreno_tutorial.csv     the tutorial (every try and replay), saved when the game starts
    Kai_Moreno_round1.csv       each round, saved the moment it ends, so Play again never mixes two rounds
    Kai_Moreno_round2.csv
  leaderboard/
    leaderboard.csv             one row per round played on this laptop
```

A part with no rows (a tutorial skipped before any post) has no file. Spaces in a name become `-`,
characters a file name can't hold are dropped, and each name is cut at 20 characters. **Nothing is ever
written over:** if a student plays again later (or two students share a name), the new files get a number,
like `Kai_Moreno_round1 (2).csv`. (The log holds the people's tastes as they drift, which the player must not
see until the end, so a round's file is only written once that round is over.)

Each file is written whole and swapped in at once, so a crash or a closed laptop never leaves half a CSV.
**Nothing ever downloads.** If the saving program stops mid-class, the results say the save failed, and *Log
out* shows **Could not save** with a single *Try again* button: the student's data stays in the game until it
is saved. Start `python3 server.py` again, then press *Try again*. (Don't reload the page first: that would
lose the unsaved rounds.)

**Privacy:** the student's name is on the folder and file names only. Inside, the only thing about the
player is their grade: no name, no gamer tag, no account, no device information. The session id is a random
code like `20261004-153012-a3f9c1`, and the log describes what the pretend people did. The gamer tag is only
in the leaderboard file, which has no name or session id, so it can't be joined to anyone's data. Nothing
leaves the laptop, and a future server (below) would not receive the name or the tag. Check your school's
rules before collecting files with students' names.

| Column | Meaning |
|---|---|
| `session_id` | random id for this sitting (page load). Several rounds can share one session. |
| `timestamp_ms` | wall-clock time, in milliseconds. It keeps running while the game is paused. |
| `phase` | `tutorial1`, `main` |
| `vp_id` | which person (blank for pause/resume) |
| `event` | `push`, `watch_end`, `afk`, `round_start`, `round_end`, `pause`, `resume` |
| `topic` | the topic of the post: pushed (`push`), finished watching (`watch_end`), or the skip that made them leave (`afk`) |
| `liked` | `1` liked, `0` skipped (push events) |
| `attention_before`, `attention_after` | the person's attention (0–100) around the event |
| `fatigue_mult` | how much "same topic again" reduced the gain (1 = no penalty) |
| `tastes_json` | the person's like-chances for the 6 topics, right after the event (they drift as posts are liked) |
| `round_no` | 1, 2, 3… for each main round (0 in the tutorial, even a replay) |
| `round_time_sec` | seconds of play since the round started. Unlike `timestamp_ms`, it does not run during a pause. |
| `detail` | extra word: the reaction type on `push`; `complete`/`interrupted` on `watch_end`; `skip`/`idle` on `afk` (why they left); the version played on `round_start` (`radar-interests/4`, `radar-learned/4`, `grid/6`, ...); `time_up`/`all_afk` on `round_end`; `button`/`key`/`tab_hidden` on `pause` |
| `post_no` | which of this person's posts the row is about: 1, 2, 3… A `push` and its `watch_end` share it. Starts again at 1 each round. Blank on rows that aren't about a post. |
| `clock_time` | `timestamp_ms` as a time of day on the laptop, like `15:28:44` |
| `taste_sports` … `taste_food` | `tastes_json` split into one number per topic, so a spreadsheet can sort or chart it. A line chart of one taste across a round shows the filter bubble forming. |
| `grade` | the student's grade from the first screen: `8th`, or what they typed. The same on every row of a session. |
| `date_time` | `timestamp_ms` as a date and time on the laptop, to the millisecond, like `2026-10-17 13:31:04.873`. Excel and Google Sheets read it as a real date, so it sorts and subtracts. |
| `session_sec` | seconds since the student finished the name screen. Counts everything (pauses, pop-ups, the results), so it lines up their tutorial and round files into one visit. |
| `wait_sec` | on `push` rows only: seconds this person sat free (not watching) before the post, i.e. how long the student took to come back to them. Pauses and pop-ups don't count. |

The first 11 columns are the agreed set. The rest make the data usable: rounds, a pause-proof clock, the
extra word, a post number to pair rows, a readable time, the tastes as plain numbers, the grade, a full date
and time, the time into the visit, and how long each person waited for a post. New columns only ever go at the end.

The leaderboard file has its own columns: `gamer_tag`, `points` (everyone's attention when the round ended,
added up; someone who left counts 0, so 0–200 with 2 people), `round_no` (the student's 1st, 2nd… round),
`version` (rounds of different versions are ranked separately) and `played_at` (date and time).

### Adding the Flask server later

Everything that leaves the logger goes through **one function**, `logger.flush(records)`, in
`js/logger.js`. Today it files the records away for the CSV files. The game calls it at the end of
each round, and when the page closes. To also send the data to a server, add one `fetch` inside that
function (the code is written out in the comment right above it):

```js
fetch('http://localhost:5000/api/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(records)     // an array of objects, one per CSV row, same column names
}).catch(function () { /* the game must never break because the network did */ });
```

Keep the line that stores the records (the CSV files need it). A server at another address needs CORS
turned on, because the page comes from the saving program's address (`http://localhost:8765`).

---

## Project layout

```
server.py             the saving program: serves the game at http://localhost:8765 and writes the CSV files
index.html            the page (all screens live here, one visible at a time)
css/style.css         all styling. Colors are variables at the top.
js/config.js          every tunable number and flag
js/content.js         topics, the people (and their bio clues), every message
js/vp.js              the person model: tastes, attention, like/skip, drift, fatigue (NO page code)
js/metrics.js         diversity, scores, and every number on the results screen (NO page code)
js/logger.js          event log, the CSV files, and flush(), the one exit for data
js/leaderboard.js     the leaderboard: gamer tags, points, ranking, its CSV (NO page code)
js/datafolder.js      talks to the saving program: is it running? write, read, exists
js/radar.js           draws the six-topic radar (on the cards and on the results screen)
js/ui.js              screens, pop-up, scoreboard, profile cards (radar or button layout)
js/reveal.js          the results screen: the wording (pure, tested) + the drawing
js/game.js            the conductor: clock, phases, pause, round end, logging hooks
data/                 where server.py saves: one folder per student, and leaderboard/ (not in git)
tests.html            open in Chrome: the model, logger and results-wording tests
sim.html              open in Chrome: the balance simulator
tests/                tests.js, plus optional tools: run-node.js (terminal runner), e2e.js (real-Chrome check),
                      dev-helpers.js (dev mode only)
sim/sim.js            the simulator's engine (also page-free)
steering/             how the project is meant to work, for anyone changing it (people or AI): start with
                      steering/CLAUDE.md, then product.md, tech.md, structure.md, content.md, balance.md
.claude/              launch.json (runs server.py) and CLAUDE.md, which loads the steering docs into Claude Code
```

Rules the code follows: plain HTML + CSS + vanilla JS; no modules, frameworks or build step; one small backend,
`server.py`, using only Python's standard library; classic `<script>` tags in dependency order sharing one
global, `window.DS`; the only disk access is through the saving program, which writes nothing but
`data/<folder>/<file>.csv`; the model files never touch the page, so the tests and the simulator can run them
without a browser.

## Checking your work

- **`tests.html`**: open in Chrome. Everything should be green. The tests pin their own settings, so
  tuning `config.js` never breaks them.
- **`sim.html`**: the balance report described above.
- **Terminal (optional, needs Node):** `node tests/run-node.js` and `node tests/run-node.js sim`.
- **Real-browser check (optional, needs Node 22+, Python 3 and Chrome):** `node tests/e2e.js`. It starts the
  real `server.py` with a temporary data folder (your `data/` is never touched), opens the game in a headless
  Chrome, plays whole rounds with robot players, and checks about 115 things in every version (both radars, and 6 people with buttons): the tutorial's two steps, its profile
  radar and what its pop-ups say, the avatar reactions, every screen fits a short laptop
  window (and the board a 1024 × 768 one), no radar button overlaps another, the interests radar matches
  each person and never changes mid-round, the results text is sane (no "undefined"), the name screen's
  checks, the CSV files land on disk in the right folder, well-formed and saying which version was played, a
  second session gets ` (2)` files, the leaderboard file and step, Log out, the saving program stopping
  mid-session (only *Try again*, nothing downloaded, nothing lost), what the saving program refuses, the console
  doors are closed, and the frantic-click and pause loopholes stay closed. Run it after tuning `config.js` or editing `content.js`. It takes 2–3 minutes.
- **Developer mode:** open `http://localhost:8765/index.html?dev`. This leaves the
  console handles open and loads `tests/dev-helpers.js`. In the console (F12):
  - `DS.dev.play()` skips the tutorials, plays a whole round with a robot in an instant, and lands
    on the results screen. Great for demos. `DS.dev.play({ bot: 'spam' })` shows the sharpest filter bubble.
  - `DS.dev.measureReveal()` checks that every results step fits the current window height.

## Things to know

- **The console is closed in play mode, but only as a speed bump.** Students get "play mode": the live,
  drifting tastes can't be read from the console (the data log that records them is sealed until the
  results screen), and the settings and the dice are frozen while the game runs. This stops casual poking. It is
  not real security: the answer key (who likes what) is written in `content.js`, and anything that runs in
  a browser can be changed by someone determined. So don't use scores for grades.
- **A fast clicker is protected from themselves.** After any pop-up or new screen appears, its buttons
  ignore clicks for half a second (`CLICK_GUARD_MS`), so the last frantic clicks of a round can't skip the
  results screen or dismiss a pop-up.
- **The results text only says what happened.** A person's story says "bubble" only when their feed was mostly
  one topic they still enjoy and they lost interest in another; a topic shown a lot but skipped is no bubble. "Lost
  interest in Comics" always matches the percents printed on the radar beside it. A player who mixed topics is
  told so, even when every watch still nudged a taste away. The big picture names the filter bubble only when
  feeds narrowed. All of this is tested.
- **Why it no longer feels like luck.** Favorites used to be skipped 23% of the time, even for a player
  who knew every answer. Now it's under 10%, and never twice in a row (`SKIP_STREAK_BREAK`), so "even
  favorites get skipped sometimes" is still true but rare. Only a handful of ideas fit on the screen at once, so the game uses 2 people (it was 4, and 6 before that: six
  made players click at random), and the radar shows at a glance what each person is into.
- **The radar shows interests on purpose (the team lead's call).** It turns the game from "guess what
  they like" into "keep two people happy at once", and the narrowing still stays hidden because the
  radar never updates mid-round. The tutorial is the exception: Alex's profile starts empty, so the student
  first sees how such a profile is learned. Speed is now the skill: in the simulator, a robot that always shows
  the longest spike averages about 94 attention at one click a second, 84 at one every 1.5 s, and 64 at
  one every 2 s (a random clicker gets 20–26). The cost is that nobody has to *learn* each person. To
  make discovery part of the game again, use `?radar=learned`.
- **The people use animal avatars and the words "they/their"**, on purpose, so nobody is assigned a
  gender or a look.
- No sound. Works best in a current Chrome (105 or newer; older versions get a fixed-size radar).

## Troubleshooting

| Problem | Fix |
|---|---|
| The page is blank, or you see "needs JavaScript" | turn JavaScript on, then reload |
| "This site can't be reached" at localhost:8765 | the saving program isn't running. Run `python3 server.py` in the project folder, then reload. |
| "Start the saving program first" | the same: start it (or check its window is still open), then press *Continue* again. If the message adds "Then open http://localhost:8765", the game was opened by double-clicking `index.html`: open that address instead. |
| "Port 8765 is already in use" | the saving program is already running in another window: use that one. Or start a second copy with `python3 server.py --port 8766` and open `http://localhost:8766`. |
| `python3: command not found` | install Python 3 (python.org). On Windows, try `python server.py`. |
| "Could not save" at Log out | the saving program stopped. Start it again, then press *Try again*. Don't reload the page: the unsaved rounds would be lost. |
| A rude gamer tag on the board | delete its row from `data/leaderboard/leaderboard.csv`. |
| The cards need scrolling | the window is narrower than 1000 px or shorter than 560 px. Maximize the window, or press Ctrl + minus to zoom out. |
| Everything is too easy or too hard | see the tuning table above, then check `sim.html` |
