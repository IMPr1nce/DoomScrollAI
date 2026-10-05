/*
 * vp.js — the Virtual Profile (VP) model. THIS FILE MUST NEVER TOUCH THE DOM.
 *
 * Why: the same code runs in the real game (game.js + ui.js), in tests.html,
 * and in the headless balance simulator (sim.html). If it only knows numbers
 * and events, all three can use it.
 *
 * How time works: there are no timers in here. The caller advances time by
 * calling vp.tick(dt) (dt in seconds). The real game calls it every ~100 ms
 * with the real elapsed time. The simulator calls it in a tight loop.
 *
 * How the outside world hears about things: vp.onEvent(fn). The VP calls fn
 * with a plain object for every push / watch_end / afk / message. The logger
 * and UI subscribe; the VP doesn't know they exist.
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var C = DS.CONFIG; // live reference (see config.js): changes to keys show up here

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  // --------------------------------------------------------------------- RNG
  // All randomness goes through DS.rng so tests can force outcomes ("always
  // like") and the simulator can replay the exact same game from a seed.
  // mulberry32 is a tiny, well-known seedable generator. Quality is plenty
  // for a game.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  DS.rng = {
    _fn: Math.random,
    random: function () { return DS.rng._fn(); },       // number in [0, 1)
    seed: function (n) { DS.rng._fn = mulberry32(n); },  // repeatable sequence
    use: function (fn) { DS.rng._fn = fn; },             // tests: force exact values
    reset: function () {                                 // back to config default
      if (C.RNG_SEED !== null) DS.rng.seed(C.RNG_SEED);
      else DS.rng._fn = Math.random;
    }
  };
  DS.rng.reset();

  // ------------------------------------------------------------ Taste builder
  // Turns a definition ("favorites: sports") into numbers (sports: 0.85).
  // The jitter keeps two favorites (or two VPs' favorites) from being
  // identical, so learning each VP takes a few pushes.
  function buildTastes(def) {
    var tastes = {};
    var known = DS.TOPIC_BY_ID;
    def.favorites.concat(def.meh).forEach(function (id) {
      // Fail loudly if someone renames a topic in content.js but forgets a VP.
      if (!known[id]) throw new Error('VP "' + def.id + '" references unknown topic "' + id + '"');
    });
    DS.TOPIC_IDS.forEach(function (id) {
      var base = def.favorites.indexOf(id) !== -1 ? C.TASTE_FAVORITE
               : def.meh.indexOf(id) !== -1       ? C.TASTE_MEH
               :                                    C.TASTE_DISLIKED;
      var jitter = (DS.rng.random() * 2 - 1) * C.TASTE_JITTER;
      tastes[id] = clamp(base + jitter, C.TASTE_MIN, C.TASTE_MAX);
    });
    return tastes;
  }

  // ---------------------------------------------------------------------- VP
  function VP(def) {
    this.id = def.id;
    this.name = def.name;
    this.avatar = def.avatar;
    this.bio = def.bio;

    // HIDDEN from the player during play. Only the reveal screen reads these.
    this.tastes = buildTastes(def);
    this.tasteSnapshotStart = Object.assign({}, this.tastes); // for "then vs now" on the reveal

    this.attention = C.ATTENTION_START;
    this.state = 'idle';          // 'idle' | 'watching' | 'afk'
    this.history = [];            // every push: { topic, liked, t }  (t = seconds on this VP's clock)

    this.drainMult = 1;           // game.js sets this lower in the tutorials

    // Time bookkeeping. clock keeps running even after AFK, so every VP in a
    // round has the same clock and the average below is fair.
    this.clock = 0;
    this.attentionTime = 0;       // integral of attention over time (attention x seconds)

    // State of the watch in progress (only meaningful while state === 'watching').
    this.watchRemaining = 0;
    this.watchRate = 0;           // attention gained per second during the watch
    this.watchStartAttention = 0; // for the watch_end log record

    this.lastMessage = null;      // so we never say the same line twice in a row
    this._lowShown = false;       // so the low-attention line fires once per dip, not every tick
    this._listeners = [];
  }

  // ---- events -------------------------------------------------------------
  VP.prototype.onEvent = function (fn) { this._listeners.push(fn); };
  // Needed when a UI card is thrown away (e.g. "Try again"), so the old card
  // stops listening to a VP it no longer shows.
  VP.prototype.offEvent = function (fn) {
    this._listeners = this._listeners.filter(function (l) { return l !== fn; });
  };

  // Every event has the same base fields (so the logger can write one row per
  // event); callers add whichever extras apply.
  VP.prototype._emit = function (event, extra) {
    if (!this._listeners.length) return;
    var rec = Object.assign({
      event: event,
      vpId: this.id,
      t: this.clock,
      topic: null,
      liked: null,
      attentionBefore: this.attention,
      attentionAfter: this.attention,
      fatigueMult: null,
      tastes: Object.assign({}, this.tastes), // a copy, so later drift can't rewrite the log
      message: null,
      category: null
    }, extra);
    this._listeners.forEach(function (fn) { fn(rec); });
  };

  // ---- queries ------------------------------------------------------------
  // The model itself enforces the lock flag. The UI greys out buttons by
  // asking this, but even if a click slips through, push() still refuses.
  VP.prototype.canPush = function () {
    if (this.state === 'afk') return false;
    if (this.state === 'watching' && C.LIKED_LOCKS_BUTTONS) return false;
    return true;
  };

  // 0..1, for the little progress bar on the card.
  VP.prototype.watchProgress = function () {
    return this.state === 'watching' ? 1 - this.watchRemaining / C.POST_DURATION_SEC : 0;
  };

  // How many of the last FATIGUE_WINDOW pushes were this topic? Counts every
  // push (liked or not): fatigue is about what the player SHOWED, not how the
  // VP felt. Must be called BEFORE the current push is added to history.
  VP.prototype.fatigueCountFor = function (topicId) {
    var recent = this.history.slice(-C.FATIGUE_WINDOW);
    var n = 0;
    for (var i = 0; i < recent.length; i++) if (recent[i].topic === topicId) n++;
    return n;
  };

  // "Hooked" = the last HOOKED_WINDOW liked posts were mostly one topic.
  // This looks at behavior (what they actually watched), not at the hidden
  // tastes, so it also works as a signal for how narrow the feed has become.
  VP.prototype.isHooked = function () {
    var liked = [];
    for (var i = this.history.length - 1; i >= 0 && liked.length < C.HOOKED_WINDOW; i--) {
      if (this.history[i].liked) liked.push(this.history[i].topic);
    }
    if (liked.length < C.HOOKED_WINDOW) return false;   // not enough evidence yet
    var counts = {}, top = 0;
    liked.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; top = Math.max(top, counts[t]); });
    return top / liked.length >= C.HOOKED_SHARE;
  };

  // ---- messages -----------------------------------------------------------
  VP.prototype._pickMessage = function (category, topicId) {
    var lines = DS.MESSAGES[category];
    var pool = lines.filter(function (l) { return l !== this.lastMessage; }, this);
    if (!pool.length) pool = lines; // only happens if a category has a single line
    var line = pool[Math.floor(DS.rng.random() * pool.length)];
    this.lastMessage = line; // remember the template, so the same line can't repeat
    var label = topicId ? DS.TOPIC_BY_ID[topicId].label : 'this';
    return line.replace(/\{topic\}/g, label);
  };

  // ---- pushing a post -----------------------------------------------------
  // Returns { ok:false, reason } if the push isn't allowed, otherwise a result
  // object the UI can use right away (liked, message, ...).
  VP.prototype.push = function (topicId) {
    if (!DS.TOPIC_BY_ID[topicId]) throw new Error('Unknown topic: ' + topicId);
    if (!this.canPush()) return { ok: false, reason: this.state === 'afk' ? 'afk' : 'watching' };

    // Only reachable when LIKED_LOCKS_BUTTONS is false: the new post replaces
    // the one being watched. Without this, rapid clicking would stack gains.
    if (this.state === 'watching') this._endWatch('interrupted');

    var attentionBefore = this.attention;

    // 1. Fatigue (measured before this post enters history)
    var fatigueCount = this.fatigueCountFor(topicId);
    var mults = C.FATIGUE_MULTIPLIERS;
    var fatigueMult = mults[Math.min(fatigueCount, mults.length - 1)];

    // 2. Roll for like. Repeats make even a favorite topic a bit less likely.
    var likeChance = clamp(this.tastes[topicId] - C.FATIGUE_LIKE_PENALTY * fatigueCount,
                           C.TASTE_MIN, C.TASTE_MAX);
    var liked = DS.rng.random() < likeChance;

    this.history.push({ topic: topicId, liked: liked, t: this.clock });

    var wentAfk = false;
    if (liked) {
      // Attention does NOT jump now. It rises a little each tick while they watch.
      this.state = 'watching';
      this.watchRemaining = C.POST_DURATION_SEC;
      this.watchRate = (C.LIKE_GAIN * fatigueMult) / C.POST_DURATION_SEC;
      this.watchStartAttention = this.attention;
      this._drift(topicId);
    } else {
      // Skip: instant penalty. Fatigue doesn't change the penalty, only gains.
      this.attention = Math.max(0, this.attention - C.DISLIKE_PENALTY);
      if (this.attention <= 0) { this._enterAfk(); wentAfk = true; }
    }

    // 3. Pick the speech bubble. Order matters: the most "dramatic" true thing wins.
    var category;
    if (wentAfk) category = 'afk';
    else if (liked && this.isHooked() && DS.rng.random() < C.HOOKED_MESSAGE_CHANCE) category = 'hooked';
    else if (fatigueCount >= C.FATIGUE_MESSAGE_MIN_COUNT) category = 'fatigued';
    // lowAttention only on a skip. "Anything good?" right after a liked post would feel wrong.
    else if (!liked && this.attention < C.LOW_ATTENTION_THRESHOLD) category = 'lowAttention';
    else category = liked ? 'liked' : 'disliked';
    var message = this._pickMessage(category, topicId);

    var info = {
      topic: topicId, liked: liked,
      attentionBefore: attentionBefore, attentionAfter: this.attention,
      fatigueMult: fatigueMult, message: message, category: category
    };
    this._emit('push', info);
    if (wentAfk) this._emit('afk', { message: message, category: 'afk',
                                     attentionBefore: attentionBefore, attentionAfter: 0 });

    return Object.assign({ ok: true, likeChance: likeChance, fatigueCount: fatigueCount, wentAfk: wentAfk }, info);
  };

  // The filter-bubble engine. A liked post makes that topic more likely to be
  // liked next time, and every other topic a bit less likely. Moving a
  // fraction of the REMAINING distance means tastes can never leave
  // [TASTE_MIN, TASTE_MAX], and changes get smaller near the ends.
  VP.prototype._drift = function (likedTopic) {
    var t = this.tastes;
    DS.TOPIC_IDS.forEach(function (id) {
      if (id === likedTopic) t[id] += C.DRIFT_UP * (C.TASTE_MAX - t[id]);
      else                   t[id] -= C.DRIFT_DOWN * (t[id] - C.TASTE_MIN);
    });
  };

  // ---- state changes ------------------------------------------------------
  VP.prototype._enterAfk = function () {
    this.attention = 0;
    this.state = 'afk';       // permanent for the rest of the round
    this.watchRemaining = 0;
  };

  VP.prototype._endWatch = function (reason) {
    var startedAt = this.watchStartAttention;
    this.state = 'idle';
    this.watchRemaining = 0;
    this._emit('watch_end', {
      attentionBefore: startedAt, attentionAfter: this.attention,
      category: reason          // 'complete' or 'interrupted'
    });
  };

  // ---- time ---------------------------------------------------------------
  // Advance this VP by dt seconds. Works for any dt: a watch that ends partway
  // through a tick gets the rest of the tick as idle time, so a 0.1 s loop and
  // a 1 s loop give nearly the same answer. (The simulator relies on this.)
  VP.prototype.tick = function (dt) {
    if (!(dt > 0)) return;
    var attentionAtStart = this.attention;
    this.clock += dt;

    if (this.state !== 'afk') {
      var idleDt = dt;

      if (this.state === 'watching') {
        var watchDt = Math.min(dt, this.watchRemaining);
        this.attention = Math.min(C.ATTENTION_MAX, this.attention + this.watchRate * watchDt);
        this.watchRemaining -= watchDt;
        idleDt = dt - watchDt;
        if (this.watchRemaining <= 1e-9) this._endWatch('complete');
      }

      // No drain while watching: the VP is busy. Drain only happens when idle.
      if (this.state === 'idle' && idleDt > 0) {
        this.attention -= C.IDLE_DRAIN_PER_SEC * this.drainMult * idleDt;
        if (this.attention <= 0) {
          this._enterAfk();
          var msg = this._pickMessage('afk', null);
          this._emit('afk', { message: msg, category: 'afk',
                              attentionBefore: attentionAtStart, attentionAfter: 0 });
        }
      }

      // One-time nudge when attention dips under the threshold, so the player
      // can SEE which profile needs help. Re-arms once attention recovers.
      if (this.state !== 'afk') {
        if (this.attention < C.LOW_ATTENTION_THRESHOLD && !this._lowShown) {
          this._lowShown = true;
          this._emit('message', { message: this._pickMessage('lowAttention', null),
                                  category: 'lowAttention' });
        } else if (this.attention >= C.LOW_ATTENTION_THRESHOLD) {
          this._lowShown = false;
        }
      }
    }

    // Trapezoid rule: average of start and end attention x dt. AFK adds 0.
    // metrics.js divides by the clock to get the time-averaged attention.
    this.attentionTime += (attentionAtStart + this.attention) / 2 * dt;
  };

  // --------------------------------------------------------------- Factories
  DS.VP = VP;
  DS.createVP = function (def) { return new VP(def); };

  // The six VPs for the main game.
  DS.createCast = function () { return DS.VP_DEFS.map(DS.createVP); };

  // Alex, with the slower drain the tutorials use.
  DS.createTutorialVP = function () {
    var vp = new VP(DS.TUTORIAL_VP_DEF);
    vp.drainMult = C.TUTORIAL_DRAIN_MULT;
    return vp;
  };
})();
