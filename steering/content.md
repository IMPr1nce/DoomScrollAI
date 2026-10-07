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
- **Tastes:** 1–2 favorites and 2 "meh" topics; everything else is disliked. No two people share a mix.
- **`clue`:** the topic their bio hints at, always one of their favorites (the ★ in `?radar=learned`).
  Alex, the tutorial person, has none.
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
- **A new outcome needs** a sentence in `DS.revealText` and a "reveal text: …" test in `tests/tests.js`.
- **The discussion questions ask; they don't preach.**

## Accessibility
- **Emoji + words, never color alone:** topics, status chips, watched vs skipped in the feed, the +/− pills.
- **Text is at least 16px** everywhere (body text is 18px), with at least 4.5:1 contrast. The status
  colors `--good` and `--bad` were darkened to meet it.
- **Keyboard:** Esc pauses and resumes; ← → move through the results; pop-ups put focus on their main
  button, and the page behind them is inert.
- **Screen readers:** the radar is a picture (`aria-hidden`), so each topic button says it in words
  ("Show Sports to Maya. They like it about 9 times in 10."). Only the big tutorial card announces speech
  bubbles; four cards talking at once would be noise.
- **Motion:** everything respects `prefers-reduced-motion`.

## Where the words live
| Words | File | Tested? |
|---|---|---|
| People, topics, speech bubbles | `js/content.js` | yes |
| Results sentences | `DS.revealText` in `js/reveal.js` | yes |
| Tutorial header and pop-ups, the "ready?" card, pause | `js/game.js` | no: follow the rules by hand |
| Card labels and status chips ("Waiting", "Needs a post!", "AFK — closed the app") | `js/ui.js` | no |
| Results labels, captions and legends | the drawing half of `js/reveal.js` | no |
| Title screen | `index.html` | no |
