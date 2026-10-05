/*
 * tests/tests.js — tiny test runner + tests for the model (vp.js, metrics.js).
 *
 * Open tests.html in Chrome to see the results. It also runs headlessly in
 * Node, because the model never touches the DOM.
 *
 * Most tests force the dice with DS.rng.use(() => 0) ("always liked") or
 * DS.rng.use(() => 0.999999) ("always disliked"), turn jitter off, and
 * set config values to round numbers, so the expected answers can be worked
 * out by hand. Every test starts from a fresh copy of the real config.
 */
(function () {
  'use strict';

  var DS = window.DS;
  var C = DS.CONFIG;
  // The tests below check hand-worked numbers ("60 + 15 = 75"), so they run against these
  // PINNED values, not whatever is live in config.js. That way tuning config.js (for
  // example applying a sim.html preset) can never break them. Everything not listed here
  // (SIM_*, UI timing) comes from the live config.
  var PINNED = {
    ATTENTION_START: 60, ATTENTION_MAX: 100, LIKE_GAIN: 15, DISLIKE_PENALTY: 12,
    IDLE_DRAIN_PER_SEC: 2, POST_DURATION_SEC: 5, ROUND_SEC: 90,
    TUTORIAL_DRAIN_MULT: 0.5, TUTORIAL1_GOAL: 90,
    FATIGUE_WINDOW: 3, FATIGUE_MULTIPLIERS: [1, 0.7, 0.45, 0.3], FATIGUE_LIKE_PENALTY: 0.1,
    DRIFT_UP: 0.08, DRIFT_DOWN: 0.04, TASTE_MIN: 0.05, TASTE_MAX: 0.95,
    TASTE_FAVORITE: 0.85, TASTE_MEH: 0.5, TASTE_DISLIKED: 0.15, TASTE_JITTER: 0.04,
    LOW_ATTENTION_THRESHOLD: 25, FATIGUE_MESSAGE_MIN_COUNT: 2,
    HOOKED_WINDOW: 6, HOOKED_SHARE: 0.8, HOOKED_MESSAGE_CHANCE: 0.6,
    ENJOY_THRESHOLD: 0.45, LIKED_LOCKS_BUTTONS: true, RNG_SEED: null
  };
  var DEFAULTS = Object.assign(JSON.parse(JSON.stringify(C)), JSON.parse(JSON.stringify(PINNED)));

  // ---------------------------------------------------------------- Runner
  var tests = [];
  function test(name, fn) { tests.push({ name: name, fn: fn }); }

  function fail(msg) { throw new Error(msg); }
  function ok(cond, msg) { if (!cond) fail(msg || 'expected true'); }
  function eq(actual, expected, msg) {
    if (actual !== expected) fail((msg || 'not equal') + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
  function approx(actual, expected, eps, msg) {
    if (typeof actual !== 'number' || Math.abs(actual - expected) > (eps === undefined ? 1e-6 : eps)) {
      fail((msg || 'not close') + ': expected ~' + expected + ', got ' + actual);
    }
  }

  function resetEnvironment() {
    Object.keys(C).forEach(function (k) { delete C[k]; });
    Object.assign(C, JSON.parse(JSON.stringify(DEFAULTS)));
    DS.rng.reset();
  }

  // -------------------------------------------------------------- Helpers
  var LIKE = function () { return 0; };            // random() = 0        -> always under like-chance
  var DISLIKE = function () { return 0.999999; };  // random() near 1     -> always over like-chance

  // A VP with exactly known tastes: sports 0.85, food 0.5, everything else 0.15.
  function makeVP() {
    C.TASTE_JITTER = 0;
    return DS.createVP({ id: 't', name: 'Test', avatar: '🧪', bio: 'test',
                         favorites: ['sports'], meh: ['food'] });
  }

  // Advance a VP by `seconds` in small steps (integer step count avoids float drift).
  function run(vp, seconds, dt) {
    dt = dt || 0.1;
    var steps = Math.round(seconds / dt);
    for (var i = 0; i < steps; i++) vp.tick(dt);
  }

  function record(vp) {
    var events = [];
    vp.onEvent(function (e) { events.push(e); });
    return events;
  }

  // ----------------------------------------------------------- Content / setup
  test('content: every VP has 1-2 favorites, in-range tastes, and a different mix', function () {
    var defs = DS.VP_DEFS.concat([DS.TUTORIAL_VP_DEF]);
    var seen = {};
    defs.forEach(function (def) {
      var vp = DS.createVP(def);
      var favorites = 0;
      DS.TOPIC_IDS.forEach(function (id) {
        var p = vp.tastes[id];
        ok(p >= C.TASTE_MIN && p <= C.TASTE_MAX, def.name + ' ' + id + ' out of range: ' + p);
        if (p >= 0.8) favorites++;
      });
      ok(favorites >= 1 && favorites <= 2, def.name + ' should have 1-2 favorites, has ' + favorites);
      var signature = def.favorites.slice().sort() + '|' + def.meh.slice().sort();
      ok(!seen[signature], def.name + ' has the same mix as ' + seen[signature]);
      seen[signature] = def.name;
    });
  });

  test('content: every topic is a favorite of at least one main VP', function () {
    DS.TOPIC_IDS.forEach(function (id) {
      ok(DS.VP_DEFS.some(function (d) { return d.favorites.indexOf(id) !== -1; }),
         'nobody in the cast loves ' + id);
    });
  });

  test('content: every message category has 8+ lines and uses only known {tokens}', function () {
    ['liked', 'disliked', 'fatigued', 'lowAttention', 'afk', 'hooked'].forEach(function (cat) {
      var lines = DS.MESSAGES[cat];
      ok(lines && lines.length >= 8, cat + ' needs at least 8 lines');
      lines.forEach(function (l) {
        var tokens = l.match(/\{[^}]*\}/g) || [];
        tokens.forEach(function (t) { eq(t, '{topic}', 'unknown token in "' + l + '"'); });
      });
    });
  });

  test('content: a VP naming an unknown topic fails loudly', function () {
    var threw = false;
    try { DS.createVP({ id: 'x', name: 'X', avatar: '?', bio: '', favorites: ['nope'], meh: [] }); }
    catch (e) { threw = true; }
    ok(threw, 'should throw');
  });

  test('new VP starts idle at ATTENTION_START and snapshots its tastes', function () {
    var vp = makeVP();
    eq(vp.attention, C.ATTENTION_START);
    eq(vp.state, 'idle');
    eq(vp.history.length, 0);
    approx(vp.tasteSnapshotStart.sports, 0.85);
    ok(vp.tasteSnapshotStart !== vp.tastes, 'snapshot must be a copy, not the same object');
  });

  // --------------------------------------------------------- Like / dislike
  test('liked post: starts watching, attention rises gradually, total = LIKE_GAIN', function () {
    var vp = makeVP();
    DS.rng.use(LIKE);
    var r = vp.push('sports');
    ok(r.ok && r.liked, 'should be liked');
    eq(vp.state, 'watching');
    eq(vp.attention, 60, 'no instant jump');
    run(vp, 2.5);
    approx(vp.attention, 60 + 7.5, 1e-6, 'half way through');
    approx(vp.watchProgress(), 0.5, 1e-6);
    run(vp, 2.5);
    approx(vp.attention, 75, 1e-6, 'full gain');
    eq(vp.state, 'idle', 'watch is over');
  });

  test('disliked post: instant penalty, stays idle, can push again right away', function () {
    var vp = makeVP();
    DS.rng.use(DISLIKE);
    var r = vp.push('sports');
    ok(r.ok && !r.liked, 'should be disliked');
    eq(vp.attention, 60 - C.DISLIKE_PENALTY);
    eq(vp.state, 'idle');
    ok(vp.canPush(), 'buttons stay live after a skip');
    ok(vp.push('food').ok, 'second push accepted');
  });

  test('like chance follows the taste (roll just under/over the taste value)', function () {
    var vp = makeVP();                       // sports = 0.85
    DS.rng.use(function () { return 0.84; });
    ok(vp.push('sports').liked, '0.84 < 0.85 -> liked');
    vp = makeVP();
    DS.rng.use(function () { return 0.86; });
    ok(!vp.push('sports').liked, '0.86 >= 0.85 -> disliked');
  });

  test('likes are probabilistic: a 0.85 topic is liked ~85% of the time', function () {
    DS.rng.seed(123);
    var likes = 0, n = 2000;
    for (var i = 0; i < n; i++) {
      var vp = makeVP(); // fresh VP each time so fatigue and drift can't interfere
      if (vp.push('sports').liked) likes++;
    }
    approx(likes / n, 0.85, 0.03, 'like rate');
  });

  test('history records every push with topic, liked and time', function () {
    var vp = makeVP();
    DS.rng.use(DISLIKE);
    vp.push('sports'); run(vp, 1); vp.push('food');
    eq(vp.history.length, 2);
    eq(vp.history[0].topic, 'sports');
    eq(vp.history[0].liked, false);
    approx(vp.history[1].t, 1, 1e-6, 'timestamp is the VP clock');
  });

  // ------------------------------------------------------------ Lock flag
  test('LIKED_LOCKS_BUTTONS = true: pushes are refused while watching', function () {
    var vp = makeVP();
    C.LIKED_LOCKS_BUTTONS = true;
    DS.rng.use(LIKE);
    vp.push('sports');
    eq(vp.canPush(), false);
    var r = vp.push('food');
    eq(r.ok, false);
    eq(r.reason, 'watching');
    eq(vp.history.length, 1, 'refused push must not enter history');
    run(vp, 5);
    ok(vp.canPush(), 'unlocked once the watch ends');
  });

  test('LIKED_LOCKS_BUTTONS = false: a new push interrupts the watch and forfeits the rest', function () {
    var vp = makeVP();
    C.LIKED_LOCKS_BUTTONS = false;
    var events = record(vp);
    DS.rng.use(LIKE);
    vp.push('sports');
    run(vp, 2.5);                            // +7.5 so far
    ok(vp.canPush(), 'buttons stay live');
    ok(vp.push('food').ok, 'second push accepted');
    run(vp, 5);                              // food is a fresh topic: full +15
    approx(vp.attention, 60 + 7.5 + 15, 1e-6, 'unused 7.5 of the first watch is lost');
    var interrupted = events.filter(function (e) { return e.event === 'watch_end' && e.category === 'interrupted'; });
    eq(interrupted.length, 1, 'one interrupted watch_end event');
  });

  // ------------------------------------------------------------ Idle drain
  test('idle drain: IDLE_DRAIN_PER_SEC, scaled by drainMult', function () {
    var vp = makeVP();
    run(vp, 10);
    approx(vp.attention, 60 - 20, 1e-6);
    var slow = makeVP();
    slow.drainMult = C.TUTORIAL_DRAIN_MULT;
    run(slow, 10);
    approx(slow.attention, 60 - 20 * C.TUTORIAL_DRAIN_MULT, 1e-6, 'tutorial drain');
  });

  test('no idle drain while watching', function () {
    var vp = makeVP();
    DS.rng.use(LIKE);
    vp.push('sports');
    run(vp, 5);
    approx(vp.attention, 75, 1e-6, '+15 with nothing taken off');
  });

  test('attention never goes above ATTENTION_MAX', function () {
    var vp = makeVP();
    C.ATTENTION_START = 95;
    vp = makeVP();
    DS.rng.use(LIKE);
    vp.push('sports');
    run(vp, 5);
    eq(vp.attention, C.ATTENTION_MAX);
  });

  // ------------------------------------------------------------------ AFK
  test('AFK by idle drain: at 0 the VP goes AFK, permanently, with one afk event', function () {
    var vp = makeVP();
    var events = record(vp);
    run(vp, 31);                              // 60 / 2 per sec = 30 s
    eq(vp.state, 'afk');
    eq(vp.attention, 0);
    eq(vp.canPush(), false);
    var r = vp.push('sports');
    eq(r.ok, false);
    eq(r.reason, 'afk');
    run(vp, 5);
    eq(vp.attention, 0, 'stays at 0');
    eq(events.filter(function (e) { return e.event === 'afk'; }).length, 1, 'exactly one afk event');
  });

  test('AFK by dislikes: 5 skips from 60 reaches 0; result and events say afk', function () {
    var vp = makeVP();
    var events = record(vp);
    DS.rng.use(DISLIKE);
    var last;
    for (var i = 0; i < 5; i++) last = vp.push(DS.TOPIC_IDS[i]);
    eq(vp.state, 'afk');
    ok(last.wentAfk, 'result flags afk');
    eq(last.category, 'afk');
    var names = events.map(function (e) { return e.event; });
    eq(names.slice(-2).join(','), 'push,afk', 'push event comes before afk event');
  });

  // -------------------------------------------------------------- Fatigue
  test('fatigue: counts repeats in the last 3 pushes; like chance drops 0.1 per repeat', function () {
    var vp = makeVP();
    C.ATTENTION_START = 100; C.DISLIKE_PENALTY = 1;      // keep the VP alive for the whole test
    vp = makeVP();
    DS.rng.use(DISLIKE);                                 // dislikes don't drift tastes, so chances are clean
    var rs = [1, 2, 3, 4].map(function () { return vp.push('sports'); });
    eq(rs.map(function (r) { return r.fatigueCount; }).join(','), '0,1,2,3');
    eq(rs.map(function (r) { return r.fatigueMult; }).join(','), '1,0.7,0.45,0.3');
    [0.85, 0.75, 0.65, 0.55].forEach(function (p, i) { approx(rs[i].likeChance, p, 1e-9, 'like chance #' + i); });
  });

  test('fatigue: gain is scaled by the multiplier', function () {
    C.ATTENTION_START = 10; C.IDLE_DRAIN_PER_SEC = 0;
    var vp = makeVP();
    DS.rng.use(LIKE);
    var gains = [];
    for (var i = 0; i < 4; i++) {
      var before = vp.attention;
      vp.push('sports');
      run(vp, 5);
      gains.push(vp.attention - before);
    }
    [15, 10.5, 6.75, 4.5].forEach(function (g, i) { approx(gains[i], g, 1e-6, 'gain #' + i); });
  });

  test('fatigue: only the last 3 pushes count (it recovers when you change topics)', function () {
    C.ATTENTION_START = 100; C.DISLIKE_PENALTY = 1;
    var vp = makeVP();
    DS.rng.use(DISLIKE);
    ['sports', 'sports', 'sports', 'food', 'dance', 'music'].forEach(function (t) { vp.push(t); });
    eq(vp.fatigueCountFor('sports'), 0, 'three pushes of other topics wash it out');
    ['sports', 'food', 'sports'].forEach(function (t) { vp.push(t); });
    eq(vp.fatigueCountFor('sports'), 2, 'repeats need not be back-to-back');
  });

  test('fatigue does not change the dislike penalty', function () {
    C.ATTENTION_START = 100;
    var vp = makeVP();
    DS.rng.use(DISLIKE);
    vp.push('sports'); vp.push('sports'); vp.push('sports');
    eq(vp.attention, 100 - 3 * C.DISLIKE_PENALTY);
  });

  // ---------------------------------------------------------------- Drift
  test('drift: liked topic moves toward TASTE_MAX, every other toward TASTE_MIN (exact formula)', function () {
    var vp = makeVP();
    var before = Object.assign({}, vp.tastes);
    DS.rng.use(LIKE);
    vp.push('sports');
    DS.TOPIC_IDS.forEach(function (id) {
      var expected = id === 'sports'
        ? before[id] + C.DRIFT_UP * (C.TASTE_MAX - before[id])
        : before[id] - C.DRIFT_DOWN * (before[id] - C.TASTE_MIN);
      approx(vp.tastes[id], expected, 1e-12, id);
    });
    approx(vp.tastes.sports, 0.858, 1e-9, 'hand check: 0.85 + 0.08 * 0.10');
  });

  test('drift: a disliked post changes no tastes', function () {
    var vp = makeVP();
    var before = JSON.stringify(vp.tastes);
    DS.rng.use(DISLIKE);
    vp.push('sports');
    eq(JSON.stringify(vp.tastes), before);
  });

  test('drift: spamming a topic narrows tastes, stays inside bounds, and leaves the start snapshot alone', function () {
    C.LIKED_LOCKS_BUTTONS = false;                // allow rapid pushes
    var vp = makeVP();
    var snapshot = JSON.stringify(vp.tasteSnapshotStart);
    DS.rng.use(LIKE);
    for (var i = 0; i < 300; i++) vp.push('sports');
    DS.TOPIC_IDS.forEach(function (id) {
      ok(vp.tastes[id] >= C.TASTE_MIN - 1e-12 && vp.tastes[id] <= C.TASTE_MAX + 1e-12, id + ' escaped the bounds');
    });
    ok(vp.tastes.sports > 0.94, 'favorite -> near max, got ' + vp.tastes.sports);
    ok(vp.tastes.food < 0.06, 'meh topic -> near min, got ' + vp.tastes.food);
    eq(JSON.stringify(vp.tasteSnapshotStart), snapshot, 'snapshot unchanged');
    eq(DS.metrics.enjoyedTopics(vp.tastes).join(','), 'sports', 'now enjoys only one topic');
  });

  // ------------------------------------------------------------- Messages
  test('messages: the same line never appears twice in a row for a VP', function () {
    C.LIKED_LOCKS_BUTTONS = false; C.DISLIKE_PENALTY = 0; C.IDLE_DRAIN_PER_SEC = 0;
    DS.rng.seed(7);
    var vp = makeVP();
    var last = null;
    for (var i = 0; i < 500; i++) {
      var r = vp.push(DS.TOPIC_IDS[i % 6]);
      ok(r.message !== last, 'repeated "' + r.message + '" at push ' + i);
      last = r.message;
    }
  });

  test('messages: {topic} is filled in and no braces leak out', function () {
    C.LIKED_LOCKS_BUTTONS = false; C.DISLIKE_PENALTY = 0;
    DS.rng.seed(9);
    var vp = makeVP();
    for (var i = 0; i < 300; i++) ok(vp.push(DS.TOPIC_IDS[i % 6]).message.indexOf('{') === -1, 'unfilled token');
  });

  test('messages: category priority (liked/disliked, fatigued, lowAttention, hooked, afk)', function () {
    // liked and disliked
    var vp = makeVP();
    DS.rng.use(LIKE);    eq(vp.push('sports').category, 'liked');
    vp = makeVP();
    DS.rng.use(DISLIKE); eq(vp.push('sports').category, 'disliked');

    // lowAttention only on a skip (attention 30 -> 18)
    C.ATTENTION_START = 30;
    vp = makeVP();
    DS.rng.use(DISLIKE); eq(vp.push('sports').category, 'lowAttention');
    // ...but a LIKED post at low attention is still a liked reaction
    vp = makeVP();
    DS.rng.use(LIKE);    eq(vp.push('sports').category, 'liked');
    C.ATTENTION_START = 60;

    // fatigued from the 3rd repeat (count 2); hooked beats fatigued once 6 liked posts are one topic
    C.LIKED_LOCKS_BUTTONS = false; C.HOOKED_MESSAGE_CHANCE = 1;
    vp = makeVP();
    DS.rng.use(LIKE);
    var cats = [];
    for (var i = 0; i < 6; i++) cats.push(vp.push('sports').category);
    eq(cats.join(','), 'liked,liked,fatigued,fatigued,fatigued,hooked');

    // hooked respects its chance roll: with chance 0 it never fires
    C.HOOKED_MESSAGE_CHANCE = 0;
    for (i = 0; i < 5; i++) ok(vp.push('sports').category !== 'hooked', 'hooked should be off');
  });

  test('messages: a low-attention nudge fires once per dip and re-arms after recovery', function () {
    C.ATTENTION_START = 30;
    var vp = makeVP();
    var events = record(vp);
    var lows = function () { return events.filter(function (e) { return e.category === 'lowAttention'; }).length; };
    run(vp, 3);                               // 30 -> 24
    eq(lows(), 1, 'fires when crossing under 25');
    run(vp, 2);                               // 24 -> 20
    eq(lows(), 1, 'does not repeat while still low');
    DS.rng.use(LIKE);
    vp.push('sports'); run(vp, 5);            // +15 -> ~35, back over the threshold
    run(vp, 6);                               // ~35 -> ~23, dips again
    eq(lows(), 2, 'fires again after recovering and dipping');
  });

  // --------------------------------------------------------------- Events
  test('events: push and watch_end carry the fields the logger needs; tastes are a copy', function () {
    var vp = makeVP();
    var events = record(vp);
    DS.rng.use(LIKE);
    vp.push('sports');
    run(vp, 5);
    eq(events.length, 2);
    var push = events[0], end = events[1];
    eq(push.event, 'push'); eq(push.vpId, 't'); eq(push.topic, 'sports'); eq(push.liked, true);
    eq(push.fatigueMult, 1);
    eq(end.event, 'watch_end');
    approx(end.attentionBefore, 60, 1e-9); approx(end.attentionAfter, 75, 1e-6);
    var tastesAtPush = JSON.stringify(push.tastes);
    vp.push('sports');                        // drifts tastes again
    eq(JSON.stringify(push.tastes), tastesAtPush, 'old record must not change when tastes drift later');
  });

  test('events: offEvent stops a listener (cards use this when they are removed)', function () {
    var vp = makeVP();
    var n = 0, fn = function () { n++; };
    vp.onEvent(fn);
    DS.rng.use(DISLIKE);
    vp.push('sports');
    eq(n, 1);
    vp.offEvent(fn);
    vp.push('food');
    eq(n, 1, 'no more calls after offEvent');
  });

  // ----------------------------------------------------------- Time & seeds
  test('time steps: 0.1 s, 0.37 s and 1 s ticks agree (a watch can end mid-tick)', function () {
    var finals = [0.1, 0.37, 1].map(function (dt) {
      var vp = makeVP();
      DS.rng.use(LIKE);
      vp.push('sports');
      var t = 0;
      while (t < 12 - 1e-9) { var step = Math.min(dt, 12 - t); vp.tick(step); t += step; }
      return { attention: vp.attention, area: vp.attentionTime, clock: vp.clock };
    });
    // 60 + 15 (watch) - 2/s * 7 s idle = 61
    finals.forEach(function (f) { approx(f.attention, 61, 1e-6, 'final attention'); approx(f.clock, 12, 1e-9); });
    finals.forEach(function (f) { approx(f.area, finals[0].area, 1.5, 'attention-seconds'); });
  });

  test('seeding: the same seed replays the same game', function () {
    function play() {
      DS.rng.seed(42);
      var cast = DS.createCast();
      var log = [];
      for (var i = 0; i < 40; i++) {
        var vp = cast[i % 6];
        var r = vp.push(DS.TOPIC_IDS[(i * 5) % 6]);
        log.push(r.ok ? r.liked + r.message : 'x');
        vp.tick(1);
      }
      return JSON.stringify([log, cast.map(function (v) { return v.tastes; })]);
    }
    eq(play(), play());
  });

  // -------------------------------------------------------------- Metrics
  function bruteForceDiversity(topics) {
    var sum = 0, pairs = 0;
    for (var i = 0; i < topics.length; i++)
      for (var j = i + 1; j < topics.length; j++) { sum += topics[i] === topics[j] ? 0 : 1; pairs++; }
    return sum / pairs;
  }

  test('diversity: hand-checked values', function () {
    eq(DS.metrics.diversity(['sports', 'sports', 'sports']), 0, 'all the same');
    eq(DS.metrics.diversity(['sports', 'food']), 1, 'all different');
    approx(DS.metrics.diversity(['a', 'a', 'b']), 2 / 3, 1e-12, 'AA=0, AB=1, AB=1 -> 2/3');
    eq(DS.metrics.diversity(['sports']), null, 'one post: no pairs');
    eq(DS.metrics.diversity([]), null, 'no posts');
  });

  test('diversity: the fast formula equals the brute-force pairwise average', function () {
    DS.rng.seed(5);
    for (var trial = 0; trial < 200; trial++) {
      var n = 2 + Math.floor(DS.rng.random() * 25);
      var topics = [];
      for (var i = 0; i < n; i++) topics.push(DS.TOPIC_IDS[Math.floor(DS.rng.random() * 6)]);
      approx(DS.metrics.diversity(topics), bruteForceDiversity(topics), 1e-12, 'trial ' + trial);
    }
  });

  test('diversityByHalf: splits liked posts by time and ignores skipped ones', function () {
    var h = [
      { topic: 'sports', liked: true,  t: 1 },
      { topic: 'sports', liked: true,  t: 2 },
      { topic: 'music',  liked: true,  t: 3 },
      { topic: 'food',   liked: false, t: 4 },   // skipped: not "consumed"
      { topic: 'music',  liked: true,  t: 50 },
      { topic: 'food',   liked: true,  t: 60 }
    ];
    var d = DS.metrics.diversityByHalf(h, 90);
    approx(d.first, 2 / 3, 1e-12);
    eq(d.firstCount, 3);
    eq(d.second, 1);
    eq(d.secondCount, 2);
    // A round that ended early at 20 s: halves are 0-10 and 10-20. Only one liked
    // post lands in the second half, so that half is "not enough data".
    var early = DS.metrics.diversityByHalf(h.slice(0, 4).concat([{ topic: 'food', liked: true, t: 15 }]), 20);
    eq(early.firstCount, 3);
    eq(early.secondCount, 1);
    eq(early.second, null, 'one post -> null, not 0');
  });

  test('stillScrolling and averageAttention (AFK counts as 0)', function () {
    C.IDLE_DRAIN_PER_SEC = 0;                 // constant attention, so the average is easy to predict
    var alive = makeVP();
    var gone = makeVP();
    DS.rng.use(DISLIKE);
    for (var i = 0; i < 5; i++) gone.push(DS.TOPIC_IDS[i]);   // 60 - 5*12 -> AFK at clock 0
    eq(gone.state, 'afk');
    run(alive, 10); run(gone, 10);
    eq(DS.metrics.stillScrolling([alive, gone]), 1);
    approx(DS.metrics.averageAttention([alive, gone]), (60 + 0) / 2, 1e-6);
    eq(DS.metrics.averageAttention([]), 0);
  });

  test('feedSummary counts posts per topic; enjoyedTopics uses ENJOY_THRESHOLD', function () {
    var s = DS.metrics.feedSummary([
      { topic: 'sports', liked: true, t: 0 }, { topic: 'sports', liked: false, t: 1 },
      { topic: 'music', liked: true, t: 2 }
    ]);
    eq(s.total, 3); eq(s.likedCount, 2); eq(s.topTopic, 'sports'); eq(s.topCount, 2); eq(s.byTopic.food, 0);
    var vp = makeVP();   // sports .85, food .5, rest .15, threshold .45
    eq(DS.metrics.enjoyedTopics(vp.tastes).join(','), 'sports,food');
  });

  // ------------------------------------------------------------- Simulator
  test('sim: same seeds give identical results, and config is restored afterwards', function () {
    var before = JSON.stringify(C);
    var a = JSON.stringify(DS.sim.runAll({ runs: 6, overrides: { LIKE_GAIN: 20 } }));
    eq(JSON.stringify(C), before, 'runAll must put DS.CONFIG back exactly as it was');
    var b = JSON.stringify(DS.sim.runAll({ runs: 6, overrides: { LIKE_GAIN: 20 } }));
    eq(a, b, 'repeatable');
  });

  test('sim: overrides really reach the model (more gain -> more attention)', function () {
    var lo = DS.sim.runAll({ runs: 20, overrides: { LIKE_GAIN: 10 } }).results[1].avgAttention.mean;
    var hi = DS.sim.runAll({ runs: 20, overrides: { LIKE_GAIN: 30 } }).results[1].avgAttention.mean;
    ok(hi > lo + 5, 'LIKE_GAIN 30 should beat LIKE_GAIN 10 clearly: ' + lo + ' vs ' + hi);
  });

  test('sim: spam-favorite only ever shows one topic; random does not', function () {
    var out = DS.sim.runAll({ runs: 20 });
    var by = {}; out.results.forEach(function (r) { by[r.id] = r; });
    eq(by.spam.topShare, 1);
    ok(by.random.topShare < 0.7, 'random should spread across topics');
  });

  test('sim: the lock flag only matters to a bot that clicks open-but-watching VPs', function () {
    var on = DS.sim.runAll({ runs: 40, lockButtons: true }).results;
    var off = DS.sim.runAll({ runs: 40, lockButtons: false }).results;
    var get = function (rs, id) { return rs.filter(function (r) { return r.id === id; })[0].avgAttention.mean; };
    approx(get(on, 'spam'), get(off, 'spam'), 1e-9, 'patient bot is unaffected');
    approx(get(on, 'eager'), get(on, 'spam'), 1e-9, 'with locks on, eager == spam');
    ok(get(off, 'eager') < get(off, 'spam') - 3, 'with locks off, eager clicking cuts its own watches short');
  });

  // ------------------------------------------------------------ Run & report
  function runAll() {
    var results = tests.map(function (t) {
      resetEnvironment();
      try { t.fn(); return { name: t.name, pass: true }; }
      catch (e) { return { name: t.name, pass: false, error: e.message }; }
    });
    resetEnvironment();
    report(results);
    return results;
  }

  function report(results) {
    var failed = results.filter(function (r) { return !r.pass; });
    var summary = (results.length - failed.length) + ' / ' + results.length + ' passed';
    results.forEach(function (r) {
      console.log((r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.pass ? '' : '\n        ' + r.error));
    });
    console.log(summary);

    if (typeof document !== 'undefined' && document.getElementById('results')) {
      document.getElementById('summary').textContent = summary;
      document.getElementById('summary').className = failed.length ? 'bad' : 'good';
      document.getElementById('results').innerHTML = results.map(function (r) {
        var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
        return '<li class="' + (r.pass ? 'pass' : 'fail') + '">' + (r.pass ? '✔ ' : '✘ ') + esc(r.name) +
               (r.pass ? '' : '<div class="err">' + esc(r.error) + '</div>') + '</li>';
      }).join('');
    }
  }

  DS.runTests = runAll;
  runAll();
})();
