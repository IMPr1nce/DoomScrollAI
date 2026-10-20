# Content and wording — Doomscroll AI

Read this before writing anything a player sees: the people, speech bubbles, tutorial and pop-up text,
results wording, labels.

## Audience and tone
- **Students aged 13–14.** Friendly and playful. Never shame the player or the people.
- **Plain words, short sentences:** 24 words at most. The results wording is tested for this.
- **School-safe:** nothing scary, mean or adult, and **no mental-health crisis content**. Jokes about
  screen time are fine ("Wait, it's 1am??"); anything about self-harm, depression or body image is not.
- Talk to the player as **"you"**. Talk about the people by **name** or as **"they"**.

## The people (VPs)
- **Animal avatars, on purpose:** no gender, skin tone or look. **Never use he, she, him, her or his**
  (the results wording is tested for this).
- **Bio:** age plus one hobby, short enough for one line on a small card. Narrow layouts cut it with "…".
- **Tastes:** 3 favorites side by side on the radar, 1 "meh" (opposite the bio clue in the cast), and 2 disliked.
  No two people share a mix. Neighbors on the radar enclose an area, so each radar is a filled wedge read at a
  glance, and the tutorial's profile ends as a filled shape, never a line (tested). Alex included.
- **`clue`:** the topic their bio hints at, always one of their favorites (the ★ in `?radar=learned`).
  Alex, the tutorial person, has none.
- **Tutorial pop-ups must not hint at the narrowing.** They may say that repeats get boring (each repeat gains
  less: the player can see that in the +). They may not say that a person's tastes change.

## Tutorial pop-ups (explore, then exploit)
Alex is a new user, so the profile radar starts empty and no tutorial line may talk about long spikes or point
at a favorite. Each line is only said when it is true for the version being played (`tests/e2e.js` checks all
four versions). The grid has no radar, so its lines talk about the buttons' counts instead.
- **The why comes first:** the player is the algorithm, and its job is to keep Alex on the app as long as
  possible. Exploring is testing (random topics, each one asking "watch or skip?"); exploiting is showing what
  passed the tests, for that job. Each header text stays one line, so the card doesn't jump between the steps.
- **The header** names the step: "Step 1 of 2 · Explore", "Test what Alex likes", "You know nothing about Alex
  yet. Push random topics to test them, and watch the radar fill in."; then "Step 2 of 2 · Exploit", "Keep Alex
  on the app", "You're the algorithm: show what passed your tests, so Alex stays as long as possible." The goal
  pill counts what is left: "Goal: test all 6 topics (2/6)", then "Goal: 3 watches in a row (1/3)".
- **The intro:** "Meet Alex" ("Alex just joined the app. You are the algorithm: your job is to keep Alex on the
  app as long as possible."), "This is attention", "This is Alex's Interest radar!" ("Each post helps reveal what
  Alex likes. Watch the radar fill in as you learn more about them."; the rings are left to the first-watch hint),
  and "Step 1: Explore" (the definition, then
  "Push random topics as tests: does Alex watch, or skip? Test all 6. Skips are the cost.").
- **The two words are defined exactly as on the results:** "Exploring = trying something new to learn more."
  (step 1) and "Exploiting = showing what you know works." (step 2). Both come from `DS.revealText`, so they can't
  drift apart.
- **Hints:** a watch is "That topic grew one ring on the radar. Apps count a watch as 'interested'."; a skip is
  "No ring, and attention drops. A skip is a signal too: 'not interested'."; a repeat is "Repeats gain less, so
  the + is smaller. Mix it up!"
- **Between the steps:** "You explored!" opens with "Your tests are done.", says which topics Alex watched (never
  anything about the tastes), "The skips were the price of finding out." (only if there were skips), and "Every
  new user starts empty like this, so apps explore to learn them." Then "Step 2: Exploit": the definition, then
  "Now show only topics that passed your tests. Get 3 watches in a row: a skip starts the count again."
- **The win pop-up:** "You explored: random topics tested what Alex likes. Then you exploited what passed, to
  keep Alex on the app. Real apps do both with every user." Then, **only when the round's radars come filled in**, "Now the radars come filled
  in. Can you keep two people hooked?", with the real number of people. Then the line about people leaving at
  0. Its buttons: **Start the game** (first, so it gets the focus) and **Replay the tutorial**, the same words
  as the link on the results screen.
- **"Alex left":** "Each skip costs attention, and waiting drains it. Try again."
- **The round never says "exploring" or "exploiting".** Only the tutorial and the results' big-picture step do.

## Reactions on the avatar
After each post, the card's avatar reacts: a ❤️ floats up for a watch, a 💬 joins it a beat later when the
topic was fresh (not shown in that person's last 3 posts, so `fatigue_mult` is 1), a repeat gets a smaller ❤️
alone, and a skip gets a quick 👆 swipe.
- **Pictures only, `aria-hidden`.** The speech bubble (and the tutorial's history strip) say the same thing in
  words, so this is the one emoji that needs no word beside it.
- **Built only from the push event's `liked` and `fatigueMult`.** Never from the tastes, and no class or
  attribute that says anything about them.
- **Never a pop-up:** nothing freezes or blocks the round, and the card doesn't change size.
- **Order matters** in `DS.VP_DEFS`: the first `PROFILE_COUNT` people play, and the first four must love
  all six topics between them (tested).

## Speech bubbles
- **Categories** (`DS.MESSAGES`): `liked`, `disliked`, `fatigued` (the same topic again), `lowAttention`,
  `afk` (leaving), and `hooked` (stuck in a loop: the lesson, said quietly). When several apply, the most
  dramatic true one wins: afk, then hooked, then fatigued, then lowAttention, then liked or disliked.
- **Each line is 40 characters at most**, so it fits on one line of a small card. No duplicates, and the
  only token allowed is `{topic}` (all tested).
- **Keep at least 12 lines per category** (there are 14 now), so nobody repeats themselves soon. Each topic
  also has at least 4 liked and 4 disliked lines of its own (`DS.TOPIC_MESSAGES`).
- **Topic lines only restate what the like or skip already showed.** No line may hint at tastes the player
  can't see.

## Results wording must be honest
- **Every claim comes from `DS.metrics.buildReveal()`.** `DS.revealText` only turns numbers into sentences.
- **Each trend has its own sentence:** `dropped`, `low` (narrow from the start), `rose`, `steady`, and
  `unknown` (too few watched posts; say which half). Never claim a bubble that didn't form.
- **Ties are said as ties** ("Sports and Music were each shown 4 times"). Never pick a winner, and never
  write "1 were".
- **No fake numbers:** show "—" or "too few watched posts", never a made-up 0.
- **"You tried 3 of 6 topics."** joins the feed sentence on each person's step (no extra height). "All 6"
  when every topic was tried, "…before Maya left." for someone who left, and nothing at all when nothing was
  shown (the feed line already says so).
- **Exploring and exploiting come back on the big-picture step:** "Exploiting = showing what you know works.
  Exploring = trying something new to learn more." The tutorial introduced them with the same words. It
  defines; it doesn't judge the player.
- **The leaderboard says ranks as ranks, and ties as ties:** "You're #3 of 12 rounds.", "You're tied for #3 of 12
  rounds.", "You're #1 of 12 rounds!" (only an untied #1 gets the "!"), "Yours is the first round on the board."
  Tied rounds share a rank (1, 2, 2, 4). Its note says where the rows come from, and says so when the saving
  program wasn't running ("Only rounds since the game was opened…") or the file couldn't be saved. Points are explained on
  the step: "Points = everyone's attention when the round ended. Someone who left counts as 0."
- **Exactly three discussion questions.** The third is "If you always order your favorite food, you never find
  a new favorite. When should an app show something new?"
- **A new outcome needs** a sentence in `DS.revealText` and a "reveal text: …" test in `tests/tests.js`.
- **The discussion questions ask; they don't preach.**

## The name screen and gamer tags
- **The why, in one line:** "Your name labels your data files. Only your gamer tag goes on the leaderboard."
- **Messages, the first missing thing only:** "Type your first and last name.", "Tick 8th grade, or type your
  grade.", "Pick a gamer tag for the leaderboard.", "Pick a different gamer tag." (a refused word: never say
  which word, or why), "Start the saving program first (ask your teacher)."
- **The gamer tag's placeholder says "Not your real name".** The tag is shown to the class.
- **Refused words** live in `DS.BLOCKED_TAG_WORDS` (`content.js`): `anywhere` words are refused even inside a tag
  and spelled around ("sh1t", "f.u_c k"), so they must never hide inside an ordinary word; `whole` words are
  refused only as a word of their own ("ass" but not "class"). Tested both ways. It's a speed bump: the teacher
  can delete a row from `leaderboard.csv`.
- **The saving program's status line:** "Checking the saving program…", then "✓ Saving program is running." or
  "Start the saving program first (ask your teacher)." Opened from a file (`file://`), it adds which address to
  open: "Then open http://localhost:8765." Students call it "the saving program", never "the server".
- **Saving, after the round:** "✓ Your data is saved in data/Kai_Moreno.", "Saving your data…", "Saving failed: is
  the saving program still running? Log out will try again." and, if it never answered, "The saving program isn't
  running, so nothing is saved yet. Log out will try again." The leaderboard's note: "…the saving program wasn't
  running." **Nothing ever says "download".**
- **"Could not save" at Log out:** "Your files didn't reach the saving program. Ask your teacher to check that it is
  running, then try again." Its only button is **Try again**.

## Accessibility
- **Emoji + words, never color alone:** topics, status chips, watched vs skipped in the feed, the +/− pills.
  (The avatar reactions are the one exception: they are `aria-hidden` pictures, and the speech bubble says it.)
- **Text is at least 16px** everywhere (body text is 18px), with at least 4.5:1 contrast. The status
  colors `--good` and `--bad` were darkened to meet it.
- **Keyboard:** Esc pauses and resumes; ← → move through the results; pop-ups put focus on their main
  button, and the page behind them is inert.
- **Screen readers:** the radar is a picture (`aria-hidden`), so each topic button says it in words
  ("Show Sports to Maya. They like it about 9 times in 10."). Only the big tutorial card announces speech
  bubbles; four cards talking at once would be noise.
- **Motion:** everything respects `prefers-reduced-motion`. The avatar reactions then neither float nor swipe:
  they show in place and fade in `REACTION_STILL_SEC`.

## Where the words live
| Words | File | Tested? |
|---|---|---|
| People, topics, speech bubbles | `js/content.js` | yes |
| Results sentences | `DS.revealText` in `js/reveal.js` | yes |
| Tutorial header and pop-ups, the "ready?" card, pause | `js/game.js` | the tutorial's key lines, per version, in `tests/e2e.js`; otherwise follow the rules by hand |
| Card labels and status chips ("Waiting", "Needs a post!", "AFK — closed the app"), the avatar reactions | `js/ui.js` | the reactions, in `tests/e2e.js` |
| Results labels, captions and legends | the drawing half of `js/reveal.js` | no |
| The leaderboard's sentences, the "saved in data/…" line | `DS.revealText` in `js/reveal.js` | yes |
| Title screen, and the name screen's labels | `index.html` | the name screen, in `tests/e2e.js` |
| The name screen's messages and the saving program's status, the Log out pop-ups | `askName()`, `serverStatus()`, `logOut()` in `js/game.js` | the messages, status and "Could not save", in `tests/e2e.js` |
| Refused gamer-tag words | `DS.BLOCKED_TAG_WORDS` in `js/content.js` | yes |
