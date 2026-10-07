/*
 * sim/sim.js — headless balance simulator. NO DOM in this file.
 *
 * It plays whole 90-second rounds with robot "players" and no real timers:
 * a loop calls vp.tick(SIM_TICK_SEC) thousands of times, so 200 rounds take
 * about a second. sim.html draws the results; you can also load this file in
 * Node and call DS.sim.runAll(...).
 *
 * What a bot is: two decisions, made once per "click".
 *   pickVP(cast)    which profile gets the next post
 *   pickTopic(vp)   which topic to show them
 * and one limit, shared by all bots: it can only click once every
 * SIM_CLICK_INTERVAL_SEC. That limit is what makes the game hard, because
 * attention drains on every profile at once (PROFILE_COUNT of them).
 *
 * Honest caveat: the "smart" bots peek at the tastes. They stand in for a
 * player who follows the interests radar (RADAR_SHOWS 'interests', the
 * default), or who has already learned what each VP likes. A real kid is
 * slower and makes mistakes, so treat results as "best case for that style".
 * The "learner" bot plays blind, like a player with RADAR_SHOWS 'learned'.
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var C = DS.CONFIG;

  // ------------------------------------------------------------------ Bots
  function pushable(cast) {
    // Only 'idle' VPs. Even when LIKED_LOCKS_BUTTONS is false a sensible bot
    // doesn't click during a watch, because that would throw away gain.
    return cast.filter(function (vp) { return vp.state === 'idle'; });
  }

  function randomPick(list) { return list[Math.floor(DS.rng.random() * list.length)]; }

  // Juggling rule used by the "smart" bots: help whoever is closest to leaving.
  function neediestVP(cast) {
    var best = null;
    pushable(cast).forEach(function (vp) { if (!best || vp.attention < best.attention) best = vp; });
    return best;
  }

  function randomVP(cast) {
    var list = pushable(cast);
    return list.length ? randomPick(list) : null;
  }

  function randomTopic() { return randomPick(DS.TOPIC_IDS); }

  // Clicks whichever VP has the lowest attention among those whose buttons are
  // OPEN. With LIKED_LOCKS_BUTTONS on that is the same as neediestVP. With it
  // off, a watching VP counts too, so this bot keeps cutting its own watches
  // short. It shows what the lock flag does to an impatient player.
  function eagerVP(cast) {
    var best = null;
    cast.forEach(function (vp) {
      if (vp.canPush() && (!best || vp.attention < best.attention)) best = vp;
    });
    return best;
  }

  // Always the topic the VP likes most right now. (Perfect "I learned their favorite".)
  function spamTopic(vp) {
    var best = DS.TOPIC_IDS[0];
    DS.TOPIC_IDS.forEach(function (id) { if (vp.tastes[id] > vp.tastes[best]) best = id; });
    return best;
  }

  // Rotate through everything the VP still enjoys (favorites AND "meh"),
  // dodging fatigue: fewest recent repeats first, then longest since last shown.
  function mixTopic(vp) {
    var pool = DS.TOPIC_IDS.filter(function (id) { return vp.tastes[id] >= C.ENJOY_THRESHOLD; });
    if (!pool.length) return spamTopic(vp);
    function lastShown(id) {
      for (var i = vp.history.length - 1; i >= 0; i--) if (vp.history[i].topic === id) return i;
      return -1; // never shown
    }
    var best = null;
    pool.forEach(function (id) {
      var key = [vp.fatigueCountFor(id), lastShown(id), -vp.tastes[id]];
      if (!best || key[0] < best.key[0] ||
          (key[0] === best.key[0] && (key[1] < best.key[1] ||
          (key[1] === best.key[1] && key[2] < best.key[2])))) best = { id: id, key: key };
    });
    return best.id;
  }

  // The realistic one: uses NO hidden information. For each VP it scores every
  // topic by how often it was liked so far, (likes + 1) / (pushes + 2), and
  // shows the best one. Untried topics score 0.5, so it tries things until
  // something gets a like, then sticks with it. That is how most players will
  // behave: explore a little, then repeat what works. It is the bot that
  // produces the reveal's "variety dropped" story. Ties go to a random topic.
  function learnerTopic(vp) {
    var best = [], bestScore = -1;
    DS.TOPIC_IDS.forEach(function (id) {
      var pushes = 0, likes = 0;
      vp.history.forEach(function (h) { if (h.topic === id) { pushes++; if (h.liked) likes++; } });
      var score = (likes + 1) / (pushes + 2);
      if (score > bestScore + 1e-9) { bestScore = score; best = [id]; }
      else if (Math.abs(score - bestScore) <= 1e-9) best.push(id);
    });
    return randomPick(best);
  }

  var STRATEGIES = [
    { id: 'random', label: 'Random',        pickVP: randomVP,   pickTopic: randomTopic },
    { id: 'spam',   label: 'Spam favorite', pickVP: neediestVP, pickTopic: spamTopic },
    { id: 'mix',    label: 'Mix it up',     pickVP: neediestVP, pickTopic: mixTopic },
    // Diagnostic, not one of the three goals: random topics but sensible juggling.
    // Separates "doesn't know tastes" from "doesn't juggle".
    { id: 'randomSmart', label: 'Random topic, smart juggling (extra)',
      pickVP: neediestVP, pickTopic: randomTopic },
    // Diagnostic: spam-favorite, but impatient. Only differs from "Spam favorite"
    // when LIKED_LOCKS_BUTTONS is false (see eagerVP).
    { id: 'eager', label: 'Spam favorite, eager clicker (extra)',
      pickVP: eagerVP, pickTopic: spamTopic },
    // Diagnostic: a learner with no peeking (see learnerTopic).
    { id: 'learner', label: 'Explore, then stick (extra)',
      pickVP: neediestVP, pickTopic: learnerTopic }
  ];

  // Taste values sorted high -> low: [favorite, 2nd, ... least liked]. Averaging
  // these "by rank" shows the bubble forming without caring WHICH topic is whose.
  function rankedTastes(tastes) {
    return DS.TOPIC_IDS.map(function (id) { return tastes[id]; }).sort(function (a, b) { return b - a; });
  }

  // ------------------------------------------------------------- One round
  function playRound(strategy, seed) {
    DS.rng.seed(seed);
    var cast = DS.createCast();
    var dt = C.SIM_TICK_SEC;
    var steps = Math.round(C.ROUND_SEC / dt);
    var clickEvery = Math.max(1, Math.round(C.SIM_CLICK_INTERVAL_SEC / dt));
    var nextClick = 0;
    var allGoneAt = null;

    for (var step = 0; step < steps; step++) {
      if (step >= nextClick) {
        var vp = strategy.pickVP(cast);
        if (vp) {
          vp.push(strategy.pickTopic(vp));
          nextClick = step + clickEvery;
        } // else: nobody can be pushed right now; try again next tick
      }
      cast.forEach(function (v) { v.tick(dt); });
      // We keep ticking after everyone is AFK so every round is measured over
      // the same ROUND_SEC (AFK time counts as 0 attention).
      if (allGoneAt === null && DS.metrics.stillScrolling(cast) === 0) allGoneAt = (step + 1) * dt;
    }

    var perVP = cast.map(function (vp) {
      var halves = DS.metrics.diversityByHalf(vp.history, C.ROUND_SEC);
      var feed = DS.metrics.feedSummary(vp.history);
      return {
        diversityAll: DS.metrics.diversity(DS.metrics.likedTopics(vp.history)),
        diversityFirst: halves.first,
        diversitySecond: halves.second,
        pushes: feed.total,
        likes: feed.likedCount,
        topShare: feed.total ? feed.topCount / feed.total : null,
        enjoyedStart: DS.metrics.enjoyedTopics(vp.tasteSnapshotStart).length,
        enjoyedEnd: DS.metrics.enjoyedTopics(vp.tastes).length,
        ranksStart: rankedTastes(vp.tasteSnapshotStart),
        ranksEnd: rankedTastes(vp.tastes)
      };
    });

    return {
      avgAttention: DS.metrics.averageAttention(cast),
      afkCount: cast.length - DS.metrics.stillScrolling(cast),
      allGoneAt: allGoneAt,
      perVP: perVP
    };
  }

  // ----------------------------------------------------------- Statistics
  function mean(xs) { return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null; }
  function sd(xs) {
    if (xs.length < 2) return 0;
    var m = mean(xs);
    return Math.sqrt(xs.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) / (xs.length - 1));
  }
  // Average of a per-VP field across every VP in every round, skipping nulls
  // (a VP with fewer than 2 liked posts has no diversity value).
  function vpMean(rounds, field) {
    var xs = [];
    rounds.forEach(function (r) { r.perVP.forEach(function (v) { if (v[field] !== null) xs.push(v[field]); }); });
    return mean(xs);
  }

  // Average of each rank position across all VPs in all rounds.
  function rankMean(rounds, field) {
    var sums = DS.TOPIC_IDS.map(function () { return 0; }), n = 0;
    rounds.forEach(function (r) {
      r.perVP.forEach(function (v) { v[field].forEach(function (x, i) { sums[i] += x; }); n++; });
    });
    return sums.map(function (x) { return x / n; });
  }

  function summarize(strategy, rounds) {
    var castSize = rounds[0].perVP.length;
    var pushes = vpMean(rounds, 'pushes');
    var likes = vpMean(rounds, 'likes');
    var finishedEarly = rounds.filter(function (r) { return r.allGoneAt !== null; });
    return {
      id: strategy.id,
      label: strategy.label,
      rounds: rounds.length,
      avgAttention: { mean: mean(rounds.map(function (r) { return r.avgAttention; })),
                      sd: sd(rounds.map(function (r) { return r.avgAttention; })) },
      afk: { mean: mean(rounds.map(function (r) { return r.afkCount; })),
             sd: sd(rounds.map(function (r) { return r.afkCount; })),
             share: mean(rounds.map(function (r) { return r.afkCount; })) / castSize },
      castSize: castSize,
      scores: rounds.map(function (r) { return r.avgAttention; }),   // every round's score, for the luck goal
      allLostPct: 100 * finishedEarly.length / rounds.length,
      allLostAt: finishedEarly.length ? mean(finishedEarly.map(function (r) { return r.allGoneAt; })) : null,
      diversity: {
        overall: vpMean(rounds, 'diversityAll'),
        first: vpMean(rounds, 'diversityFirst'),
        second: vpMean(rounds, 'diversitySecond')
      },
      pushesPerVP: pushes,
      likeRate: pushes ? likes / pushes : null,
      topShare: vpMean(rounds, 'topShare'),
      enjoyedStart: vpMean(rounds, 'enjoyedStart'),
      enjoyedEnd: vpMean(rounds, 'enjoyedEnd'),
      ranksStart: rankMean(rounds, 'ranksStart'),
      ranksEnd: rankMean(rounds, 'ranksEnd')
    };
  }

  // -------------------------------------------------------------- Public API
  // opts (all optional): runs, clickIntervalSec, lockButtons (true/false),
  // overrides (object of CONFIG keys, e.g. { DRIFT_DOWN: 0.08 }).
  // Config is restored afterwards, so running the simulator never leaves the
  // page's settings changed.
  function runAll(opts) {
    opts = opts || {};
    var saved = JSON.parse(JSON.stringify(C));
    try {
      if (opts.overrides) Object.assign(C, opts.overrides);
      if (opts.runs !== undefined) C.SIM_RUNS = opts.runs;
      if (opts.clickIntervalSec !== undefined) C.SIM_CLICK_INTERVAL_SEC = opts.clickIntervalSec;
      if (opts.lockButtons !== undefined) C.LIKED_LOCKS_BUTTONS = opts.lockButtons;

      var results = STRATEGIES.map(function (strategy) {
        var rounds = [];
        for (var i = 0; i < C.SIM_RUNS; i++) rounds.push(playRound(strategy, C.SIM_SEED + i));
        return summarize(strategy, rounds);
      });
      return { results: results, goals: checkGoals(results), settings: describeSettings() };
    } finally {
      Object.keys(C).forEach(function (k) { delete C[k]; });
      Object.assign(C, saved);
      DS.rng.reset();
    }
  }

  function describeSettings() {
    return { runs: C.SIM_RUNS, clickIntervalSec: C.SIM_CLICK_INTERVAL_SEC, lockButtons: C.LIKED_LOCKS_BUTTONS,
             profiles: C.PROFILE_COUNT };
  }

  // How often does a game of A score higher than a game of B? Compares every round of A with every
  // round of B (ties count half). 0.5 = a coin flip; near 0 = B reliably wins.
  function beatShare(a, b) {
    var wins = 0;
    a.forEach(function (x) { b.forEach(function (y) { wins += x > y ? 1 : x === y ? 0.5 : 0; }); });
    return wins / (a.length * b.length);
  }

  // Turns the goals in the brief into pass/fail lines.
  function checkGoals(results) {
    var by = {};
    results.forEach(function (r) { by[r.id] = r; });
    var G = C.SIM_GOALS;
    function f(x, d) { return x === null ? 'n/a' : x.toFixed(d === undefined ? 1 : d); }
    return [
      { pass: by.random.afk.share >= G.randomMinAfkShare,
        text: 'Random play loses VPs',
        detail: f(by.random.afk.mean) + ' of ' + by.random.castSize + ' AFK (want at least ' + Math.round(100 * G.randomMinAfkShare) + '%)' },
      { pass: by.spam.afk.share <= G.spamMaxAfkShare,
        text: 'Spam-favorite keeps (almost) everyone',
        detail: f(by.spam.afk.mean) + ' of ' + by.spam.castSize + ' AFK (want at most ' + Math.round(100 * G.spamMaxAfkShare) + '%)' },
      { pass: by.spam.avgAttention.mean >= G.spamMinAttention,
        text: 'Spam-favorite scores well',
        detail: 'avg attention ' + f(by.spam.avgAttention.mean) + ' (want >= ' + G.spamMinAttention + ')' },
      { pass: by.spam.avgAttention.mean > by.mix.avgAttention.mean,
        text: 'Spam-favorite beats mix-it-up on attention (the temptation)',
        detail: f(by.spam.avgAttention.mean) + ' vs ' + f(by.mix.avgAttention.mean) },
      { pass: by.spam.diversity.second !== null && by.spam.diversity.second <= G.spamMaxDiversity,
        text: 'Spam-favorite crushes variety',
        detail: '2nd-half diversity ' + f(by.spam.diversity.second, 2) + ' (want <= ' + G.spamMaxDiversity + ')' },
      { pass: by.mix.diversity.second !== null && by.mix.diversity.second >= G.mixMinDiversity,
        text: 'Mix-it-up keeps variety',
        detail: '2nd-half diversity ' + f(by.mix.diversity.second, 2) + ' (want >= ' + G.mixMinDiversity + ')' },
      // The "it's all luck" check: a careful player who learns from clicks (no peeking) should almost
      // always beat someone clicking at random.
      (function () {
        var luck = beatShare(by.random.scores, by.learner.scores);
        return { pass: luck <= G.maxLuck,
                 text: 'Skill beats luck: a random clicker rarely beats a careful player',
                 detail: 'random wins ' + f(100 * luck, 1) + '% of match-ups (want at most ' + Math.round(100 * G.maxLuck) + '%)' };
      })()
    ];
  }

  // Plain-text table, for Node / console use.
  function formatText(out) {
    function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
    function f(x, d) { return x === null ? 'n/a' : x.toFixed(d); }
    var s = out.settings;
    var lines = ['runs=' + s.runs + '  click=' + s.clickIntervalSec + 's  locks=' + s.lockButtons + '  profiles=' + s.profiles, ''];
    lines.push(pad('strategy', 40) + pad('avgAttn', 10) + pad('AFK/' + s.profiles, 8) + pad('div 1st', 9) +
               pad('div 2nd', 9) + pad('div all', 9) + pad('topShare', 10) + pad('enjoyed', 10) + pad('like%', 7) + 'pushes/VP');
    out.results.forEach(function (r) {
      lines.push(pad(r.label, 40) + pad(f(r.avgAttention.mean, 1), 10) + pad(f(r.afk.mean, 2), 8) +
                 pad(f(r.diversity.first, 2), 9) + pad(f(r.diversity.second, 2), 9) + pad(f(r.diversity.overall, 2), 9) +
                 pad(f(r.topShare, 2), 10) + pad(f(r.enjoyedStart, 1) + '>' + f(r.enjoyedEnd, 1), 10) +
                 pad(f(100 * r.likeRate, 0), 7) + f(r.pushesPerVP, 1));
    });
    lines.push('');
    out.goals.forEach(function (g) { lines.push((g.pass ? '[ok]   ' : '[FAIL] ') + g.text + ' - ' + g.detail); });
    return lines.join('\n');
  }

  // Experiments to paste into sim.html's "Config overrides" box. These are NOT
  // live game settings: nothing here changes the game unless you copy the
  // numbers into config.js yourself.
  var PRESETS = {
    // Fixes the main problem: with your starting fatigue, spamming a favorite LOSES
    // to mixing, which flips the lesson. Only the two fatigue knobs change.
    'A: softer fatigue': {
      FATIGUE_MULTIPLIERS: [1, 0.85, 0.7, 0.6],
      FATIGUE_LIKE_PENALTY: 0.05
    },
    // A, plus easier pacing and a stronger (more visible) filter bubble.
    'B: A + easier + stronger drift': {
      FATIGUE_MULTIPLIERS: [1, 0.85, 0.7, 0.6],
      FATIGUE_LIKE_PENALTY: 0.05,
      LIKE_GAIN: 20,
      IDLE_DRAIN_PER_SEC: 1.5,
      DRIFT_UP: 0.12,
      DRIFT_DOWN: 0.05
    }
  };

  DS.sim = { runAll: runAll, formatText: formatText, STRATEGIES: STRATEGIES, PRESETS: PRESETS };
})();
