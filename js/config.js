/*
 * config.js — every tunable number and feature flag in the game lives here.
 *
 * Rule: no other file hard-codes a balance value. If you want the game
 * easier, harder, faster or more "addictive", change it here.
 *
 * Other files read DS.CONFIG *live* (not a copy), so sim.html and tests can
 * temporarily override values with Object.assign(DS.CONFIG, {...}). Never
 * replace the DS.CONFIG object itself, only change its keys.
 */
window.DS = window.DS || {};

DS.CONFIG = {
  // ---------------------------------------------------------------- Attention
  ATTENTION_START: 60,        // every VP starts a round here
  ATTENTION_MAX: 100,         // the bar is capped here (it's a 0–100 scale)
  LIKE_GAIN: 20,              // TOTAL attention gained over one watch (before fatigue). Was 15.
  DISLIKE_PENALTY: 12,        // instant loss when a VP skips a post
  IDLE_DRAIN_PER_SEC: 1.5,    // loss per second while idle. This is what forces juggling. Was 2.
  POST_DURATION_SEC: 5,       // how long a VP watches a liked post

  // -------------------------------------------------------------------- Round
  ROUND_SEC: 90,              // main game length
  ROUND_END_DELAY_SEC: 1.5,   // after the round ends, the final board stays up this long (with a
                              // "Time's up!" banner) before the results screen, so the player sees
                              // who left and who stayed
  TIMER_URGENT_SEC: 10,       // the clock turns red and pulses for the last N seconds

  // ----------------------------------------------------------------- Tutorial
  TUTORIAL_DRAIN_MULT: 0.5,   // idle drain is multiplied by this in the tutorials
  TUTORIAL1_GOAL: 90,         // attention needed to pass tutorial 1

  // ------------------------------------------------------------------ Fatigue
  // Look at the VP's last FATIGUE_WINDOW pushes; count how many were the same
  // topic as the one being pushed now (0..FATIGUE_WINDOW). That count indexes
  // FATIGUE_MULTIPLIERS, so the array needs FATIGUE_WINDOW + 1 entries.
  // Softened from [1, 0.7, 0.45, 0.3] / 0.1 after the balance simulator showed the original
  // made spamming a favorite LOSE to mixing topics (which flips the lesson).
  FATIGUE_WINDOW: 3,
  FATIGUE_MULTIPLIERS: [1, 0.85, 0.7, 0.6],
  FATIGUE_LIKE_PENALTY: 0.05, // subtracted from like-chance for each repeat in the window

  // -------------------------------------------------------------------- Drift
  // The filter-bubble mechanic. Each LIKED post pulls that topic's taste toward
  // TASTE_MAX and every other topic's taste toward TASTE_MIN.
  DRIFT_UP: 0.12,             // was 0.08. Stronger = a more visible bubble on the reveal screen
  DRIFT_DOWN: 0.05,           // was 0.04. Above ~0.06, even a "mix it up" player gets squeezed
  TASTE_MIN: 0.05,
  TASTE_MAX: 0.95,

  // ------------------------------------------------- Starting tastes (content.js
  // says WHICH topics are favorite / meh; these say HOW MUCH)
  TASTE_FAVORITE: 0.85,
  TASTE_MEH: 0.5,
  TASTE_DISLIKED: 0.15,
  TASTE_JITTER: 0.04,         // +/- random wobble so two "favorites" aren't identical

  // ----------------------------------------------------------------- Messages
  LOW_ATTENTION_THRESHOLD: 25,    // below this, VPs start to complain
  FATIGUE_MESSAGE_MIN_COUNT: 2,   // "Sports again?" lines appear at this many repeats
  HOOKED_WINDOW: 6,               // look at the VP's last N liked posts...
  HOOKED_SHARE: 0.8,              // ...if this share are one topic, the VP is "hooked"
  HOOKED_MESSAGE_CHANCE: 0.6,     // how often a hooked VP says a hooked line (else normal)
  MESSAGE_NO_REPEAT: 4,           // a VP won't repeat any of its last N lines (so never the same line twice in a row)
  TOPIC_MESSAGE_CHANCE: 0.4,      // how often a liked/disliked reaction is flavored by the topic ("What a play!")

  // ------------------------------------------------------------------ Metrics
  ENJOY_THRESHOLD: 0.45,      // a topic counts as "still enjoys it" at/above this taste

  // ------------------------------------------------------------------- Reveal
  // The reveal screen only claims "variety dropped" if it really did. A change smaller than
  // this (on the 0..1 diversity scale) is reported as "about the same". Applies to each VP and
  // to the average across all six.
  REVEAL_TREND_DELTA: 0.15,
  // A feed whose variety is at or below this is "narrow", even if it didn't drop. Without this, a
  // player who spams one topic from the very first post (variety 0.00 in BOTH halves) would be told
  // their feeds "stayed mixed", which would be false.
  REVEAL_LOW_VARIETY: 0.25,
  REVEAL_FEED_MAX: 160,       // most emoji drawn in one person's feed row (a safety cap; a normal round is far below it)

  // --------------------------------------------------------- Game loop / screen
  MAX_FRAME_DT_SEC: 0.25,     // longest step the game loop will take at once. If the tab was
                              // hidden or the laptop stalled, time does NOT jump ahead and
                              // unfairly drain attention.
  BUBBLE_VISIBLE_SEC: 3.5,    // how long a speech bubble stays before fading
  HISTORY_STRIP_MAX: 10,      // how many recent reactions the big tutorial card shows
  TUTORIAL_RESULT_DELAY_SEC: 1.2, // pause before the tutorial pop-up, so the player SEES the moment
                              // (the bar hitting the goal, or the AFK cover) before the text covers it

  // Frantic clicking is normal in this game. After any pop-up or new screen appears, buttons
  // ignore clicks for this long, so a click meant for the game can't accidentally dismiss
  // "Time's up" or skip the results. 0 turns the guard off.
  CLICK_GUARD_MS: 500,

  // -------------------------------------------------------------- Feature flags
  // true  = a VP's buttons are disabled while they watch a liked post.
  // false = buttons stay live; a new push cuts the current watch short
  //         (the unused part of the gain is lost).
  LIKED_LOCKS_BUTTONS: true,

  // --------------------------------------------------------------------- Dev
  RNG_SEED: null,             // null = different every play. A number = same game every time.

  // false = "play mode" (what students get): the hidden tastes aren't reachable from the browser
  // console, and the settings can't be changed while the game runs. true (or open index.html?dev)
  // keeps everything open for debugging. This is a speed bump for curious kids, not real
  // security: anything that runs in the browser can be changed by someone determined.
  DEV_MODE: false,

  // ------------------------------------------------- Balance simulator (sim.html)
  // These describe the simulated PLAYER, not the game. The real game ignores them.
  SIM_RUNS: 200,              // rounds played per strategy (more = steadier averages)
  SIM_SEED: 1000,             // run i uses seed SIM_SEED + i, so results are repeatable
  SIM_TICK_SEC: 0.1,          // simulated time step
  SIM_CLICK_INTERVAL_SEC: 1.0, // how fast the bot "clicks": one push per this many seconds.
                              // This is the big knob: a kid who needs 2 s per click is a very
                              // different player than one who needs 0.7 s.

  // What "good balance" means, as checked by the simulator's goal list.
  SIM_GOALS: {
    randomMinAfk: 3,          // random play should lose at least this many of 6 VPs
    spamMaxAfk: 1,            // spam-favorite should lose at most this many
    spamMinAttention: 55,     // ...and keep average attention at least this high
    spamMaxDiversity: 0.25,   // ...while its 2nd-half diversity is at most this (narrow feed)
    mixMinDiversity: 0.5      // mix-it-up keeps 2nd-half diversity at least this high
  }
};
