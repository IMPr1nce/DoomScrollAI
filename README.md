# Doomscroll AI

**You ARE the algorithm.** A short browser game for 8th graders (AI4K12) about how recommender
systems work.

The student plays the algorithm. Two pretend people ("Virtual Profiles") are scrolling, and the
student pushes posts to each one to keep their attention up. It is fun to play. Then the results
screen shows what the student actually did: they kept everyone's attention by showing each person
more and more of the same thing, and the people's tastes narrowed. That is a filter bubble, and the
student made it by chasing attention. The class then talks about whether that was good for those
people.

No installs. No server. No accounts. No names collected.

---

## How to run it

1. Open the project folder.
2. **Double-click `index.html`.** Use Chrome if you can.

That's all. It runs straight from the file, offline. You can put the folder on a USB stick, a
shared drive, or any web host that serves static files.

**Screen size:** built for a 1366 × 768 school laptop (about 600 px of page height once Chrome's
toolbars are counted). Everyone fits on screen without scrolling in any window at least 1000 px wide
(under about 1180 px, the radar buttons get narrower, with the emoji above the word). Narrower windows
still work; the page just scrolls.

## What the student does (about 3 minutes)

1. **Title screen** → Start.
2. **The tutorial, "Hook them":** one person, Alex. A chain of pop-ups first explains the radar plot, what
   a like and a skip do, and that a long spike is *not* a reason to show the same topic again and
   again. Then the student gets Alex's attention up to 90; one-time hint pop-ups appear after their
   first like, skip and repeat. Real apps keep a profile like Alex's radar for every user, built from
   everything they watch. The last pop-up says that at 0 attention a person leaves, the worst outcome
   for a platform.
3. **The game:** two people, 30 seconds. Everyone's attention drains when you ignore them. Show each
   person posts they like. At 0 they leave for good ("AFK"). The score is *still scrolling* and
   *average attention*.
   Each person's six topic buttons sit around a **radar**, with a spike pointing at each button. The
   longer the spike, the more that person is into the topic, so a glance shows what to show them. The
   radar shows who they were **at the start of the round** and never changes. Every post they like
   quietly shifts their tastes toward it, but that stays hidden until the results.
5. **Results:** the score first (the win), then one screen per person: what you showed them, how much
   variety they saw, and their radar twice: at the start (the one you played with) and at the end,
   usually shrunk into a single spike. That's the filter bubble, and the student's own feed made it.
   Then the big picture and three questions for the class.

Teacher tips:

- **Pause** with the button or the **Esc** key. Nothing changes until you resume.
- On a projector, the results screen moves with the **← →** arrow keys.
- After the first round, try **Play again** with a rule: "never show the same topic twice in a row".
  Compare the score and the variety numbers.
- Switching to another tab pauses the game automatically.

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
| A **stronger filter bubble** on the results screen | raise `DRIFT_UP` (how fast a liked topic is learned) or `DRIFT_DOWN` (how fast other topics fade). Careful with `DRIFT_DOWN`: above about 0.04 (with 3-second watches) even a player who mixes topics on purpose gets squeezed, which weakens "you had a choice". The simulator checks this. |
| Spamming one topic to be **less rewarding** | lower `FATIGUE_MULTIPLIERS`. Careful: too harsh and mixing topics beats spamming, which flips the lesson. The simulator warns you. |
| Buttons to **stay live** while someone watches | `LIKED_LOCKS_BUTTONS: false` (a new post then cuts the current watch short) |
| A **longer or easier tutorial** | `TUTORIAL1_GOAL`, `TUTORIAL_DRAIN_MULT` |
| The **same game every time** (for a demo) | `RNG_SEED: 42` (any number; `null` = different every time) |
| **More or less luck** | `TASTE_FAVORITE` (0.92) and `TASTE_DISLIKED` (0.08): the closer to 1 and 0, the more a right choice is rewarded. `FATIGUE_LIKE_PENALTY` (0.02) adds a little luck back for repeated topics. |
| The `learned` radar to **trust one lucky like less** | raise `RADAR_SMOOTHING` (1) |
| The results screen to be **more or less strict** about calling a change real | `REVEAL_TREND_DELTA`, `REVEAL_LOW_VARIETY` |

**After you change numbers, check the balance.** Open `sim.html`. It plays hundreds of rounds with
robot players and tells you whether the game still teaches the lesson:

- random play should **lose** people,
- spamming a favorite should **score well but crush variety**,
- mixing topics should **keep variety**,
- and **skill should beat luck**: a careful player should almost never lose to someone clicking at
  random (it reports how often that happens; it was 15% before the dice were made fairer, it's ~1–3% now).

(The same thing from a terminal: `node tests/run-node.js sim`.) The simulator also lets you try
changes without editing any file.

To change the **words and people**, edit `js/content.js`: the six topics (emoji and color), the
people (name, animal avatar, bio, which topics they love or find "meh", and `clue`: the topic their bio
hints at), and every speech-bubble line. Keep lines under 40 characters so they fit on one line of a
small card. **Order matters:** with 4 profiles the first four people play, and between them they must
love all six topics (the default of 2 plays Maya and Jordan). `tests.html` checks all of this.

---

## The data it records

Everything the game does is written to a log in the browser's memory: every post pushed, whether it
was liked, attention before and after, each person's tastes as they change, who left and why, pauses,
and the start and end of each round.

On the last results step, **Download data (CSV)** saves `doomscroll_<session_id>.csv`. (The log holds
the people's tastes as they drift, which the player must not see until the end, so it can't be read or
downloaded in the middle of a game, only from the results screen.)

**Privacy:** the session id is a random code like `20261004-153012-a3f9c1`. Nothing about the player
is collected: no name, no account, no device information. The log describes what the pretend
people did. Closing the tab without downloading discards it.

| Column | Meaning |
|---|---|
| `session_id` | random id for this sitting (page load). Several rounds can share one session. |
| `timestamp_ms` | wall-clock time, in milliseconds. It keeps running while the game is paused. |
| `phase` | `tutorial1`, `main` |
| `vp_id` | which person (blank for pause/resume) |
| `event` | `push`, `watch_end`, `afk`, `round_start`, `round_end`, `pause`, `resume` |
| `topic` | topic pushed (push events) |
| `liked` | `1` liked, `0` skipped (push events) |
| `attention_before`, `attention_after` | the person's attention (0–100) around the event |
| `fatigue_mult` | how much "same topic again" reduced the gain (1 = no penalty) |
| `tastes_json` | the person's like-chances for the 6 topics, right after the event (they drift as posts are liked) |
| `round_no` | 1, 2, 3… for each main round (0 in the tutorials) |
| `round_time_sec` | seconds of play since the round started. Unlike `timestamp_ms`, it does not run during a pause. |
| `detail` | extra word: the reaction type on `push`; `complete`/`interrupted` on `watch_end`; `skip`/`idle` on `afk` (why they left); the version played on `round_start` (`radar-interests/4`, `radar-learned/4`, `grid/6`, ...); `time_up`/`all_afk` on `round_end`; `button`/`key`/`tab_hidden` on `pause` |

The first 11 columns are the agreed set. The last three make the data usable (rounds, a pause-proof
clock, and the extra word).

### Adding the Flask server later

Everything that leaves the logger goes through **one function**, `logger.flush(records)`, in
`js/logger.js`. Today it files the records away for the CSV download. The game calls it at the end of
each round, and when the page closes. To also send the data to a server, add one `fetch` inside that
function (the code is written out in the comment right above it):

```js
fetch('http://localhost:5000/api/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(records)     // an array of objects, one per CSV row, same column names
}).catch(function () { /* the game must never break because the network did */ });
```

Keep the line that stores the records (the CSV download needs it). The Flask side needs CORS turned
on, because `index.html` is opened from a file, not from the server.

---

## Project layout

```
index.html            the page (all screens live here, one visible at a time)
css/style.css         all styling. Colors are variables at the top.
js/config.js          every tunable number and flag
js/content.js         topics, the people (and their bio clues), every message
js/vp.js              the person model: tastes, attention, like/skip, drift, fatigue (NO page code)
js/metrics.js         diversity, scores, and every number on the results screen (NO page code)
js/logger.js          event log, CSV download, and flush(), the one exit for data
js/radar.js           draws the six-topic radar (on the cards and on the results screen)
js/ui.js              screens, pop-up, scoreboard, profile cards (radar or button layout)
js/reveal.js          the results screen: the wording (pure, tested) + the drawing
js/game.js            the conductor: clock, phases, pause, round end, logging hooks
tests.html            open in Chrome: the model, logger and results-wording tests
sim.html              open in Chrome: the balance simulator
tests/                tests.js, plus optional tools: run-node.js (terminal runner), e2e.js (real-Chrome check),
                      dev-helpers.js (dev mode only)
sim/sim.js            the simulator's engine (also page-free)
steering/             how the project is meant to work, for anyone changing it (people or AI): start with
                      steering/CLAUDE.md, then product.md, tech.md, structure.md, content.md, balance.md
.claude/              launch.json (a local web server) and CLAUDE.md, which loads the steering docs into Claude Code
```

Rules the code follows: plain HTML + CSS + vanilla JS; no modules, frameworks, build step or backend;
classic `<script>` tags in dependency order sharing one global, `window.DS`; the model files never touch
the page, so the tests and the simulator can run them without a browser.

## Checking your work

- **`tests.html`**: open in Chrome. Everything should be green. The tests pin their own settings, so
  tuning `config.js` never breaks them.
- **`sim.html`**: the balance report described above.
- **Terminal (optional, needs Node):** `node tests/run-node.js` and `node tests/run-node.js sim`.
- **Real-browser check (optional, needs Node 22+ and Chrome):** `node tests/e2e.js`. It opens the actual
  game from `file://` in a headless Chrome, plays whole rounds with robot players, and checks about 50
  things in every version (both radars, and 6 people with buttons): every screen fits a short laptop
  window (and the board a 1024 × 768 one), no radar button overlaps another, the interests radar matches
  each person and never changes mid-round, the results text is sane (no "undefined"), the CSV is
  well-formed and says which version was played, the console doors are closed, and the frantic-click and
  pause loopholes stay closed. Run it after tuning `config.js` or editing `content.js`. It takes about a minute.
- **Developer mode:** open `index.html?dev` (add `?dev` to the file's address). This leaves the
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
- **The results text only says what happened.** "Variety dropped" appears only if it dropped; a feed that
  was narrow from the first post gets its own wording; people who left early are shown as "too few
  watched posts" instead of a made-up number. All of this is tested.
- **Why it no longer feels like luck.** Favorites used to be skipped 23% of the time, even for a player
  who knew every answer. Now it's under 10%, so "even favorites get skipped sometimes" is still true but
  rare. Only a handful of ideas fit on the screen at once, so the game uses 2 people (it was 4, and 6 before that: six
  made players click at random), and the radar shows at a glance what each person is into.
- **The radar shows interests on purpose (the team lead's call).** It turns the game from "guess what
  they like" into "keep two people happy at once", and the narrowing still stays hidden because the
  radar never updates mid-round. Speed is now the skill: in the simulator, a robot that always shows
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
| Download data does nothing | the browser or the school's settings may block downloads. Allow downloads for this page. |
| The cards need scrolling | the window is narrower than 1000 px or shorter than 560 px. Maximize the window, or press Ctrl + minus to zoom out. |
| Everything is too easy or too hard | see the tuning table above, then check `sim.html` |
