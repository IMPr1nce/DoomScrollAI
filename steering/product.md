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
- **Teachers:** start it with a double-click (no accounts, no install, works offline), pause it to talk,
  and walk the class through the results on a projector with the arrow keys.
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
- **AI4K12 ideas it touches:** representation and learning (a profile of interests, built from data) and
  societal impact (what optimizing for engagement does to people).

## How a session goes (about three minutes)
1. **Title** → Start.
2. **The tutorial, "Hook them":** one person, Alex. A chain of pop-ups explains the radar plot, liked vs skipped,
   and that a long spike doesn't mean "show it again and again". Then get Alex's attention up to 90, with
   one-time hints after the first like, skip and repeat. The last pop-up says that at 0 a person leaves: for a
   platform the worst outcome, no attention, no ads.
3. **The round:** two people, 30 seconds. Attention drains while someone is ignored, and at 0 they leave
   for good (AFK). The score is how many are still scrolling and their average attention.
4. **Results**, one step at a time: the win first, then one step per person (what you showed them, the
   variety they watched in each half, and their radar at the start next to the end), then the big picture
   with three questions for the class. **Play again** starts a new round right away.

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
6. **Safe and private.** Age-appropriate, no personal data, nothing leaves the browser.

## Not built, on purpose
- **The Flask backend.** `logger.flush()` is ready for a single `fetch` ([tech.md](tech.md#data-and-logging)).
- Sound, accounts, leaderboards, LLM calls.
- **Grading.** Scores aren't secure: anything that runs in a browser can be changed.

## Versions for playtests
Switches in the address bar let two groups play two versions without anyone editing a file:

| Link | Version |
|---|---|
| `index.html` | the default: 2 people, radars showing each person's interests |
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
