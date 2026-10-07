/*
 * tests/dev-helpers.js — console shortcuts for developers.
 *
 * Loaded ONLY when index.html is opened in dev mode (index.html?dev, or DEV_MODE in config.js).
 * Students never get these. Open the browser console (F12) and try:
 *
 *   DS.dev.play()                 skip the tutorials, play a whole 90 s round in an instant with a
 *                                 robot, and land on the results screen
 *   DS.dev.play({ bot: 'spam' })  bots: 'learner' (default: explores, then sticks, like a real player),
 *                                 'spam' (always the VP's favorite), 'mix' (rotates favorites), 'random',
 *                                 'none' (never clicks: everyone drifts away, which tests the empty results)
 *   DS.dev.measureReveal()        click through every results step and report whether each one fits the
 *                                 window without scrolling (resize the window first to test a height)
 *   DS.dev.round()                the round being played (VPs, cards, clock). Includes the hidden tastes!
 *
 * How play() works: instead of waiting 90 real seconds, it advances the model by hand in small steps,
 * exactly like the balance simulator (sim/sim.js), while the real UI watches. The game's own rules,
 * round-end check and results screen all run for real.
 */
(function () {
  'use strict';

  var DS = window.DS;
  var C = DS.CONFIG;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function button(label) {
    return Array.prototype.slice.call(document.querySelectorAll('button'))
      .filter(function (b) { return b.textContent.trim() === label; })[0];
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // ---- robot topic choosers (the same ideas as sim/sim.js) ----------------------------------
  var BOTS = {
    random: function () { return pick(DS.TOPIC_IDS); },
    // Uses only what a real player can see: which of its own posts were liked.
    learner: function (vp) {
      var best = [], bestScore = -1;
      DS.TOPIC_IDS.forEach(function (id) {
        var pushes = 0, likes = 0;
        vp.history.forEach(function (h) { if (h.topic === id) { pushes++; if (h.liked) likes++; } });
        var score = (likes + 1) / (pushes + 2);
        if (score > bestScore + 1e-9) { bestScore = score; best = [id]; }
        else if (Math.abs(score - bestScore) <= 1e-9) best.push(id);
      });
      return pick(best);
    },
    // These two peek at the tastes: "a player who follows the interests radar" (or already knows everyone).
    spam: function (vp) {
      var best = DS.TOPIC_IDS[0];
      DS.TOPIC_IDS.forEach(function (id) { if (vp.tastes[id] > vp.tastes[best]) best = id; });
      return best;
    },
    mix: function (vp) {
      var pool = DS.TOPIC_IDS.filter(function (id) { return vp.tastes[id] >= C.ENJOY_THRESHOLD; });
      if (!pool.length) return BOTS.spam(vp);
      pool.sort(function (a, b) { return vp.fatigueCountFor(a) - vp.fatigueCountFor(b); });
      return pool[0];
    }
  };

  var dev = {};

  dev.round = function () { return DS.game.current(); };

  // Resolves with the phase it ended in ('reveal' when everything worked).
  dev.play = function (opts) {
    opts = opts || {};
    var chooser = opts.bot === 'none' ? null : BOTS[opts.bot || 'learner'];   // null = never click
    var clickEvery = opts.clickEverySec || 1;

    return Promise.resolve().then(function () {
      if (DS.game.phase === 'title') { document.getElementById('btn-start').click(); return sleep(150); }
    }).then(function () {
      if (DS.game.phase === 'tutorial1' || DS.game.phase === 'tutorial2') { document.getElementById('btn-skip').click(); return sleep(150); }
    }).then(function () {
      return sleep(C.CLICK_GUARD_MS + 100);                       // wait out the click guard on the "ready?" card
    }).then(function () {
      var go = button('Go!');
      if (go) go.click();
      return sleep(100);
    }).then(function () {
      var round = DS.game.current();
      var next = 0, safety = 0;
      while (!round.ended && safety++ < 20000) {
        if (round.elapsed >= next - 1e-9) {
          var idle = round.vps.filter(function (v) { return v.state === 'idle'; });
          if (idle.length && chooser) {
            var neediest = idle.reduce(function (a, b) { return a.attention <= b.attention ? a : b; });
            neediest.push(chooser(neediest));
            next = round.elapsed + clickEvery;
          }
        }
        var dt = Math.min(0.1, C.ROUND_SEC - round.elapsed);
        round.vps.forEach(function (v) { v.tick(dt); });
        round.elapsed += dt;
        round.check();
      }
      return sleep((C.ROUND_END_DELAY_SEC + 0.8) * 1000);          // the banner, then the results screen
    }).then(function () { return DS.game.phase; });
  };

  // For each results step: does it fit in the window without scrolling the page?
  dev.measureReveal = function () {
    var steps = Array.prototype.slice.call(document.querySelectorAll('#reveal-steps .step'));
    var out = [];
    return steps.reduce(function (chain, step) {
      return chain.then(function () { step.click(); return sleep(1100); }).then(function () {
        var over = document.documentElement.scrollHeight - window.innerHeight;
        out.push(step.textContent.replace('AFK', '').trim() + ': ' + (over <= 0 ? 'fits' : 'OVER by ' + over + 'px'));
      });
    }, sleep(C.CLICK_GUARD_MS + 100)).then(function () { return out; });
  };

  DS.dev = dev;
})();
