# Product — Doomscroll AI

Read this for the why: who the game is for, what it teaches, how a session goes, the principles every
change has to keep, and what has already been decided.

## What it is
A three-minute browser game for 8th graders, built as an AI4K12 project. The student *is* the
recommendation algorithm of a pretend video app. Two people ("Virtual Profiles", VPs) are scrolling,
and the student chooses which topic to show each one next to keep their attention up. It plays like a
fast juggling game.

Then the results screen shows what the student actually did. They kept people's attention by showing them
more and more of the same thing, and those people's tastes narrowed. That is a filter bubble, and the
student built it by chasing attention. The class then discusses whether that was good for those people.

## Who it's for
- **Players:** students aged 13–14, in class, usually one per school laptop (Chrome, 1366 × 768, about
  600px of page height once the browser's toolbars are counted).
- **Teachers:** start it with a double-click (no accounts, no install, works offline), choose the data folder
  once per visit, pause it to talk, and walk the class through the results on a projector with the arrow keys.
- **The team lead** reads the code, so it's written to be understood ([tech.md](tech.md)).

## The lesson
- **What a recommender does:** it keeps a profile of each user's interests (the radar), built from
  everything they watch or skip, and shows them more of whatever keeps them watching.
- **What it costs:** chasing attention narrows what people see. Each liked post makes that topic a bit
  more liked and every other topic a bit less, so the feed and the person drift toward one topic.
- **The player had a choice:** mixing topics keeps variety but scores a little lower; showing everyone
  their favorite scores best. The game rewards only attention, on purpose, and the results ask what it
  never rewarded.
- **How "variety" is measured:** the average difference between pairs of watched posts (0 = all the same
  topic, 1 = all different), first half of the round against the second. The brief takes this measure from
  a research paper.
- **Exploring vs exploiting:** a recommender with a new user has to explore (try topics to learn what
  works); with a known user it can exploit (show what already works). The tutorial teaches both by name, in
  that order: explore Alex's empty profile, then exploit it. The round rewards exploiting and never names
  the words. The results count how many topics the player tried and bring the two definitions back.
- **AI4K12 ideas it touches:** representation and learning (a profile of interests, built from data) and
  societal impact (what optimizing for engagement does to people).

## How a session goes (about three minutes)
1. **Who's playing?** First and last name, grade (tick **8th** or type another) and a **gamer tag**, all needed,
   plus the **data folder** (chosen once per visit, usually by the teacher). Then **Title** → Start. The name
   only names the player's folder and files (`data/Kai_Moreno/Kai_Moreno_round1.csv`); the grade is a column of
   the data; the gamer tag is only on the leaderboard.
2. **The tutorial:** one person, Alex, a new user, in two named steps. An intro chain of pop-ups explains
   attention and the radar, which here is Alex's **profile**: it starts empty
   and each post Alex watches moves that topic out one ring (buttons read "✓2 ✗1").
   - **The first pop-up says why:** "You are the algorithm: your job is to keep Alex on the app as long as
     possible."
   - **Step 1 · Explore** ("Test what Alex likes"): push random topics as tests (does Alex watch, or skip?) until
     all 6 are tested. "Exploring = trying something new to learn more." Some get skipped: that's the cost. One-time hints follow the first watch ("a ring, and apps
     count a watch as interested"), skip ("no ring; a skip is a signal too") and repeat. Then "You explored!"
     says the tests are done, what Alex watched, and that every new user starts empty like this.
   - **Step 2 · Exploit** ("Keep Alex on the app"): show only topics that passed the tests, so Alex stays as long
     as possible; get 3 watches in a row. "Exploiting = showing what you know works." A skip starts the count again.
   - **The last pop-up** says the player explored, then exploited, as real apps do with every user; that the
     round's radars come filled in (only in versions where they do); and that at 0 a person leaves: for a
     platform the worst outcome, no attention, no ads. Its buttons: **Start the game** and **Replay the
     tutorial**.
3. **The round:** two people, 30 seconds, their radars filled in from the first second. A liked post is
   watched for 2 seconds. Attention drains while someone is ignored, and at 0 they leave for good (AFK). The
   score is how many are still scrolling and their average attention. Each post gets a small reaction on the
   person's avatar: ❤️ for a watch (with 💬 when the topic was fresh), 👆 for a skip. Likes are a dice roll,
   but a long spike is never skipped twice in a row. The round's file saves itself the moment it ends, and the
   round goes on the leaderboard with its **points**: everyone's attention at the end, added up (AFK = 0).
4. **Results**, one step at a time: the win first, then one step per person (what you showed them and how
   many of the six topics you tried, the variety they watched in each half, and their radar at the start next
   to the end), then the **🏆 Leaderboard** (every round on this laptop by points, yours marked "you", and
   "You're #3 of 12 rounds."), then the big picture: one line defining exploiting and exploring, and three
   questions for the class. **Play again** starts a new round right away.
5. **Log out** (on the big-picture step, which says where the files were saved). Each part already saved itself;
   Log out saves anything left, then goes back to the name screen, so the next student starts a new session on
   the same laptop.

## Principles every change has to keep
1. **Fun first, lesson last.** Nothing during play explains the filter bubble, and the narrowing (the taste
   drift) never shows until the results screen.
2. **Never lie.** Every sentence on the results screen is backed by the data, including when nothing
   narrowed, the data is thin, or there's a tie ([content.md](content.md)).
3. **The temptation is real.** Showing favorites must out-score mixing, and mixing must still keep
   variety. Otherwise the lesson flips ([balance.md](balance.md)).
4. **Skill beats luck.** A careful player almost never loses to someone clicking at random.
5. **One screen, read at a glance.** Everything fits the target laptop without scrolling, and a
   13-year-old can follow it while busy.
6. **Safe and private.** Age-appropriate, and nothing leaves the laptop. The personal data is the player's
   name (it names their folder and files and is in none of the rows), their grade (a column, identifying nobody)
   and a gamer tag (only on the leaderboard, never in the data, with a few words refused).

## Not built, on purpose
- **The Flask backend.** `logger.flush()` is ready for a single `fetch` ([tech.md](tech.md#data-and-logging)).
- Sound, accounts, leaderboards, LLM calls.
- **Grading.** Scores aren't secure: anything that runs in a browser can be changed. The leaderboard is for fun.
- **A class-wide leaderboard.** Each laptop keeps its own board in its data folder. A shared board across
  laptops would need the server.

## Versions for playtests
Switches in the address bar let two groups play two versions without anyone editing a file:

| Link | Version |
|---|---|
| `index.html` | the default: 2 people, radars showing each person's interests (the tutorial's radar starts empty in every version) |
| `index.html?profiles=4` | the previous default: 4 people in a 2 × 2 grid of radars |
| `index.html?radar=learned` | radars start empty and fill from the player's own pushes ("4/5", or "?" if never tried); a ★ marks each bio's hint |
| `index.html?profiles=6&layout=grid` | the original: 6 people, 3 × 2 buttons |
| `index.html?layout=grid` | 2 people, 3 × 2 buttons |

The `round_start` rows in the CSV record which version was played (`radar-interests/2`, `radar-learned/2`, `grid/6`).

## Decision log
Decided with the team lead. Don't reopen these without new evidence, such as a playtest or data. Add new
decisions here with the date and the reason.

| Date | Decision | Why |
|---|---|---|
| 2026-10-05 | **4 people instead of 6.** 6 + grid stays as a playtest switch. | Six cards overwhelmed the team lead. An overwhelmed player picks at random instead of choosing. |
| 2026-10-05 | **The topic buttons sit around a radar** on each card. | Quicker to read than six separate buttons: the longest spike points at the button to press. |
| 2026-10-05 | **The radar shows each person's interests from the first second** (`RADAR_SHOWS: 'interests'`). | The team lead wants the radar to guide the player. This overrides the brief's "tastes are never shown during play". Trade-off accepted: players no longer discover what each person likes, and speed becomes the skill. `?radar=learned` keeps the discovery version. |
| 2026-10-05 | **The radar never changes during a round.** | Keeps the brief's other rule: players must not see the drift happen. The results compare the start and the end. |
| 2026-10-05 | **The results show each person's radar at the start next to the end.** | The same picture, before and after, makes "your feed did this" plain to see. |
| 2026-10-05 | **Fairer dice and a 3-second watch** ([balance.md](balance.md)). | The game felt like luck: a player who knew the right answer was skipped 23% of the time. |
| 2026-10-07 | **One tutorial instead of two, with many explanatory pop-ups. A 30-second round. 2 people instead of 4.** (`?profiles=4` stays.) | The team lead asked for a shorter, more explained session. The "lose them" idea moved into the tutorial's last pop-up. Trade-offs, checked in the simulator: with 30 s and 2 people each half of the round has only about 5 watched posts per person, so a person who leaves early often gets the "too few watched posts" wording; drain and starting attention were retuned so random play still loses people ([balance.md](balance.md)). |
| 2026-10-07 | **"Guess the profile" puzzle on the last results step.** 10 points across six topics, one post per point; the person watches up to what they want and skips the rest. Deterministic, no dice. | The team lead wanted players to build a radar themselves and learn from a simulation. The budget stops "max everything". It teaches how a profile is learned (skips = too much; an unshown topic = no data), and every perfect profile mixes 3+ topics. |
| 2026-10-11 | **The tutorial starts as a cold start; the round still shows filled-in radars.** Alex's radar starts empty and fills in from the player's pushes (the `learned` radar, per card), in every version. Reactions on the avatars, a "You tried 3 of 6 topics" line per person, and a definition of exploiting and exploring on the big-picture step only. | The team lead wanted the explore/exploit idea in the game without breaking the hidden lesson. A blank radar is how every real profile starts, so the player explores first, then exploits in the round; the results name both. Trade-off, checked in the simulator: a blind but sensible player loses Alex in about 2–4% of tutorials at 1–2 s per pick (7–9% before the two rows below) and gets "Try again" ([balance.md](balance.md#the-tutorial-explore-then-exploit)). |
| 2026-10-11 | **The tutorial ends only when the radar is complete:** every topic tried and attention at 90. "Alex is hooked!" says so if 90 comes first. The win pop-up offers **Replay the tutorial** beside **Start the game**. | The team lead found the tutorial too quick: a player could stop at 90 after two or three posts. Trying every topic is the exploring the results name later, and costs a few skips. |
| 2026-10-11 | **A 2-second watch** (was 3). | The team lead asked for a faster game. All 7 goals still pass at 1, 1.5 and 2 s per click; a careful player shows each person about 15 posts at 1 s per click (was 11). |
| 2026-10-11 | **No skip streaks on good picks** (`SKIP_STREAK_BREAK` 0.6): right after a skip, a post with a like chance of 60% or more always lands. | The team lead felt the game failed them too often. With pure dice, 55% of rounds had someone skip 2+ posts in a row; now 17%, and those involve coin-flip "meh" topics. A threshold of 0.5 cut it to 2% but let random play keep people. The average like rate barely moves (spam 92%), and the tutorial is finished more often. |
| 2026-10-12 | **The tutorial is two named steps, Explore then Exploit, on a profile radar.** Step 1: try all 6 topics. Step 2: 3 watches in a row (a skip starts the count again). The radar is drawn like "Guess the profile": five rings, one per watched post, and a purple profile shape; buttons read "✓2 ✗1". The words "exploring" and "exploiting" now appear in the tutorial too (with the results' definitions, word for word), never in the round. Replaces the two 2026-10-11 tutorial rows (the blank `learned` radar, and "every topic tried and attention at 90"). | The team lead found the learned radar iffy (a topic skipped once still grew a one-third spike) and saw that the tutorial never actually introduced exploring or exploiting. Naming them reverses the 2026-10-11 rule that kept the words to the results; the filter bubble (the drift) stays hidden. A blind but sensible player finishes in 96.5–98% of runs at 0.5–2 s per pick, in about 11.5 posts ([balance.md](balance.md#the-tutorial-explore-then-exploit)). |
| 2026-10-12 | **A name screen comes first: the player's first and last name name the CSV** (`First_Last.csv`, cleaned for a file name, 20 characters each). Both are needed. The name is in no row of the data. | The team lead wants each student's data file to say whose it is. This relaxes principle 6 ("no personal data"): the name stays on the laptop and only names the file, so the rows stay anonymous and a future server wouldn't receive it. Without a name (tests, dev helpers) the file keeps `doomscroll_<session_id>.csv`. |
| 2026-10-12 | **Alex has 3 favorites, side by side on the radar** (Dance, Music, Comics; Sports is "meh"). Was Music and Food, with 2 "meh". | The team lead found the tutorial's finished profile looked like a straight line: Music and Food sit opposite each other. A topic with no watches sits at the center, so only neighbors enclose an area; spread-out favorites made a thin "Y". In the simulator a finished profile is now a filled shape 97–98% of the time (was 76%) and a line under 1% (was 21%). The tutorial gets a little easier: a blind player finishes 100% of runs at 1–2 s per pick (was 96.5–97.5%), in 10.9 posts (was 11.5). |
| 2026-10-13 | **Everyone in the round has 3 favorites side by side and 1 "meh"**, like Alex, with a retune: `DISLIKE_PENALTY` 18 (was 12), `IDLE_DRAIN_PER_SEC` 4.0 (was 3.0), `FATIGUE_MULTIPLIERS` 1, 0.95, 0.9, 0.85 (was 1, 0.85, 0.7, 0.6). The tutorial keeps skips at 12 and Alex's drain at 1.5/s. | The team lead wanted the round's radars to be filled shapes too, so the player reads each person at a glance with three near-sure picks instead of coin-flip "meh" topics. Without the retune, random play kept people and mixing tied spamming (the lesson flipped). With it, all 7 goals pass at 1, 1.5 and 2 s per click; each mistake costs more, and repeats cost less. Trade-off: at 3 s per click spam averages 52 (goal 55; was 57). The results' start radars are now wide wedges, so the shrink to one spike shows more. Checked in the simulator; the cheaper option (moving the "meh" next to the favorites, no balance change) was declined because coin-flip picks would remain. |
| 2026-10-13 | **The tutorial says why, and frames exploring as testing.** The first pop-up: "You are the algorithm: your job is to keep Alex on the app as long as possible." Step 1 pushes random topics as tests ("does Alex watch, or skip?"); step 2 shows only what passed the tests, to keep Alex on the app. | The team lead wanted it clearer that exploring means testing topics at random, and that exploiting what passed serves the algorithm's goal: time on the app. The definitions stay word for word, and nothing hints at the narrowing. |
| 2026-10-15 | **"Guess the profile" is removed; a Log out button takes its place** on the big-picture step. Log out saves the player's unsaved files, then starts a new session on the name screen (a new session id, an empty log, no name). Replaces the 2026-10-07 puzzle row. | The team lead no longer needs the puzzle. Classes share laptops, so one student must be able to hand over to the next without reloading, and without losing data: Log out saves before it forgets. |
| 2026-10-17 | **The name screen also asks for a grade and a gamer tag. The files save themselves into a `data` folder: `data/First_Last/First_Last_round1.csv`… and `data/leaderboard/leaderboard.csv`. A leaderboard step comes before the big picture.** Grade: an "8th" box or a typed grade, in a new last column `grade`. Gamer tag: up to 16 characters, a few rude words refused, only in the leaderboard file (never in the rows). The teacher picks the folder once per visit (Chrome's folder picker); each part saves as it ends, so the Download button is gone; a file is never written over (`(2)`). Points = everyone's attention at the end, added up (AFK = 0). Every round played on the laptop is a row; the step shows the top 10 in two columns and your rank. Replaces the Download button of the 2026-10-15 row. | The team lead wants each student's files in their own folder without downloading, a grade to compare classes, and a leaderboard of every playthrough. One laptop for now, so the folder picker does it with no server and the game still opens with a double-click; a class-wide board would need one. The board rewards only attention, which the big picture then questions, so it sits before it. Trade-offs: Chrome/Edge only (other browsers download at Log out), the folder is picked again each visit (remembering it would need browser storage), and principle 6 now covers the grade and the tag. |
| 2026-10-15 | **One CSV per part of the session:** `First_Last_tutorial.csv`, then `First_Last_round1.csv`, `_round2.csv`… Tutorial rows are always round 0. New columns at the end: `post_no`, `clock_time`, and `taste_<topic>` for each topic. A `watch_end` row (and an AFK after a skip) now says its topic. | The team lead wants each Play-again round stored separately, still named after the player. The new columns make the file readable in a spreadsheet: pair a push with its watch_end, read the time, and chart the tastes without parsing JSON. The first 11 columns are unchanged. Trade-off: the first download saves two files, so Chrome may ask to allow multiple downloads. |
