/*
 * game.js — the conductor. It owns the clock, the phases, and what a click MEANS.
 *
 *   title -> tutorial1 ("Hook them") -> tutorial2 ("Lose them") -> main -> reveal
 *
 * Built so far: title, both tutorials, and the main game (6 VPs, round timer, pause,
 * live score). The reveal screen and logging come next; the places they plug in are
 * marked "Phase 5".
 *
 * How it fits together:
 *   vp.js     the rules (no DOM)       game.js asks it to tick and to push
 *   ui.js     the screen               game.js tells it what to show
 *   game.js   this file                glue: loop, phase changes, win/lose checks
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var C = DS.CONFIG;
  var ui = DS.ui;

  // What is being played right now. Phases fill this in:
  //   vps       the models to tick every frame
  //   cards     the UI cards to refresh every frame
  //   frozen    true while a pop-up is up (or paused), so nothing changes behind it
  //   elapsed   seconds of un-frozen play so far (the round timer counts this)
  //   limitSec  optional hard stop. The main game sets it to ROUND_SEC; tutorials have none.
  //   check     called after each tick to look for "goal reached" / "lost them" / "time's up"
  var active = null;

  // ---------------------------------------------------------------- Game loop
  // One requestAnimationFrame loop for the whole game. We measure REAL elapsed time
  // and pass it to vp.tick(dt), so timing is right even if frames are slow.
  var lastTs = null;
  function frame(now) {
    if (lastTs === null) lastTs = now;
    // Cap the step. When a tab is hidden the browser stops calling us; without a cap,
    // the first frame back would be one giant dt and drain everyone's attention at once.
    var dt = Math.min((now - lastTs) / 1000, C.MAX_FRAME_DT_SEC);
    lastTs = now;

    if (active) {
      if (!active.frozen) {
        // Stop the last step exactly at the time limit. Otherwise the final frame could run
        // up to MAX_FRAME_DT_SEC past the end, and every VP's clock (which the average-attention
        // score divides by) would be a hair longer than the round.
        if (active.limitSec) dt = Math.min(dt, Math.max(0, active.limitSec - active.elapsed));
        active.vps.forEach(function (vp) { vp.tick(dt); });
        active.elapsed += dt;
        if (active.check) active.check();
      }
      active.cards.forEach(function (card) { card.update(); });
    }
    requestAnimationFrame(frame);
  }

  function freeze() {
    active.frozen = true;
    active.cards.forEach(function (c) { c.setLocked(true); });
  }
  function unfreeze() {
    active.frozen = false;
    active.cards.forEach(function (c) { c.setLocked(false); });
  }

  // Freeze the action, let the player see what just happened for a moment, THEN show the
  // pop-up. Without the pause the text would cover the exact moment we want them to notice.
  // `token` is the game state we started from. If the player skipped ahead or restarted in
  // the meantime, active is a different object and this stale pop-up is dropped.
  function showResultAfterDelay(popup, delaySec) {
    var token = active;
    freeze();
    setTimeout(function () {
      if (active === token && token.frozen) ui.showOverlay(popup);
    }, (delaySec === undefined ? C.TUTORIAL_RESULT_DELAY_SEC : delaySec) * 1000);
  }

  // What a click means: show this topic to this VP. (Phase 5 adds logging here.)
  function pushTo(vp, topicId) { vp.push(topicId); }

  // ------------------------------------------------------------- Tutorial 1
  // Goal: raise Alex's attention to TUTORIAL1_GOAL. Alex has real hidden tastes, so the
  // player has to try topics and watch the reactions. That is "learning from clicks".
  function startTutorial1() {
    game.phase = 'tutorial1';
    if (active) active.cards.forEach(function (c) { c.destroy(); });

    var vp = DS.createTutorialVP();           // slower idle drain (TUTORIAL_DRAIN_MULT)
    var card = ui.createCard(vp, {
      size: 'large',
      showHistory: true,
      goalMarker: C.TUTORIAL1_GOAL,
      onPush: function (topicId) { pushTo(vp, topicId); }
    });
    ui.mountCard('tut-card-slot', card);

    ui.setTutorialHeader({
      step: 'Tutorial 1 of 2',
      title: 'Hook them',
      text: 'This is Alex\'s For You page. Pick posts to show them. Watch how they react.',
      goal: 'Goal: get Alex\'s attention up to ' + C.TUTORIAL1_GOAL
    });
    ui.showScreen('tutorial');

    active = {
      vps: [vp], cards: [card], frozen: false, elapsed: 0,
      check: function () {
        if (vp.attention >= C.TUTORIAL1_GOAL) {
          showResultAfterDelay({
            title: 'You did it!',
            text: 'You figured out what Alex likes. That\'s what a recommender algorithm does. ' +
                  'It learns from what you click.',
            buttons: [{ label: 'Next', primary: true, onClick: startTutorial2 }]
          });
        } else if (vp.state === 'afk') {
          // Pushed too many posts they hate. Let them try again with a fresh Alex.
          showResultAfterDelay({
            title: 'Alex left!',
            text: 'Alex got bored and closed the app. Try again. Look for the posts Alex likes.',
            buttons: [{ label: 'Try again', primary: true, onClick: startTutorial1 }]
          });
        }
      }
    };
  }

  // ------------------------------------------------------------- Tutorial 2
  // Same Alex, same card. Now the goal is the opposite: make them leave. This is the point
  // of the whole game: a platform measures success by attention, and 0 attention is failure.
  function startTutorial2() {
    game.phase = 'tutorial2';
    var vp = active.vps[0];
    var card = active.cards[0];

    card.setGoalMarker(null);                 // the goal is now "0", the left edge
    ui.setTutorialHeader({
      step: 'Tutorial 2 of 2',
      title: 'Lose them',
      text: 'Now do the opposite. Show Alex posts they don\'t like until they leave.',
      goal: 'Goal: drop Alex\'s attention to 0'
    });

    active.check = function () {
      if (vp.state === 'afk') {
        showResultAfterDelay({
          title: 'Alex closed the app.',
          text: 'For the platform, that\'s the worst outcome. No attention, no ads.',
          buttons: [{ label: 'Start the game', primary: true, onClick: startMain }]
        });
      }
    };
    unfreeze();
  }

  // -------------------------------------------------------------- Main game
  // Six VPs, one shared clock. The player has to spread attention across all of them:
  // every idle VP drains, so pushing to one means the other five are getting closer to AFK.
  // That juggling is what makes "just keep them hooked" feel like a real job.
  function startMain() {
    game.phase = 'main';
    ui.hideOverlay();                       // e.g. the tutorial's "Start the game" pop-up
    if (active) active.cards.forEach(function (c) { c.destroy(); });

    var vps = DS.createCast();
    var cards = vps.map(function (vp) {
      return ui.createCard(vp, {
        size: 'compact',
        onPush: function (topicId) { pushTo(vp, topicId); }
      });
    });
    ui.mountCards('main-grid', cards);
    ui.showScreen('main');

    var round = active = {
      vps: vps, cards: cards,
      frozen: false, ended: false,
      elapsed: 0, limitSec: C.ROUND_SEC,
      check: function () {
        updateHud();
        if (round.ended) return;
        var allGone = DS.metrics.stillScrolling(vps) === 0;
        var timeUp = round.elapsed >= C.ROUND_SEC - 1e-9;
        if (allGone || timeUp) endRound(allGone ? 'all_afk' : 'time_up');
      }
    };
    updateHud();

    // Start frozen behind a "ready?" card. Without it, the clock and the drain would start
    // the instant the tutorial's last button was clicked, before anyone saw the six cards.
    freeze();
    ui.showOverlay({
      title: 'Keep everyone scrolling',
      text: 'Six people are on their feeds. Show each one posts they like. ' +
            'If you ignore someone, their attention drains. At 0, they leave for good. ' +
            'You have ' + C.ROUND_SEC + ' seconds.',
      buttons: [{
        label: 'Go!', primary: true,
        // The check guards against a stale click if the player somehow restarted meanwhile.
        onClick: function () { if (active === round && !round.ended) unfreeze(); }
        // Phase 5: log 'round_start' here, when the clock actually starts.
      }]
    });
  }

  // The scoreboard. Uses the same metrics functions as the final score, so what the
  // player watches live is exactly what they get at the end.
  function updateHud() {
    ui.updateHud({
      remainingSec: Math.max(0, C.ROUND_SEC - active.elapsed),
      totalSec: C.ROUND_SEC,
      still: DS.metrics.stillScrolling(active.vps),
      total: active.vps.length,
      // averageAttention divides by elapsed time, so before the first tick it has nothing
      // to average. Show the starting value instead of a misleading 0.
      avg: active.elapsed > 0 ? DS.metrics.averageAttention(active.vps) : C.ATTENTION_START
    });
  }

  // Two ways a round ends: the timer runs out, or every VP has left.
  function endRound(reason) {
    var round = active;
    round.ended = true;

    // If everyone left early, the round isn't over for scoring purposes: "AFK counts as 0"
    // means the rest of the round counts as 0 too. Otherwise losing everyone at second 40
    // would be averaged over 40 seconds and look better than it should. They're all AFK,
    // so this tick only advances each VP's clock; it adds no attention.
    if (reason === 'all_afk') {
      round.vps.forEach(function (vp) { vp.tick(Math.max(0, C.ROUND_SEC - round.elapsed)); });
    }
    updateHud();

    var still = DS.metrics.stillScrolling(round.vps);
    var avg = Math.round(DS.metrics.averageAttention(round.vps));
    // Phase 5 replaces this simple pop-up with the reveal screen (and logs 'round_end').
    showResultAfterDelay({
      title: reason === 'all_afk' ? 'Everyone left!' : 'Time\'s up!',
      text: 'Still scrolling: ' + still + ' / ' + round.vps.length + '. ' +
            'Average attention: ' + avg + '.',
      buttons: [
        { label: 'Play again', primary: true, onClick: startMain },
        { label: 'Replay tutorial', onClick: startTutorial1 }
      ]
    }, C.ROUND_END_DELAY_SEC);
  }

  // ------------------------------------------------------------------ Pause
  // For classroom use: the teacher can stop everything to talk. Pausing is just "freeze":
  // the loop stops ticking the VPs and the clock, and the cards lock their buttons.
  // Nothing about the game state changes, so resuming picks up exactly where it stopped.
  function pause() {
    // frozen also covers "ready?", "round over" and already-paused, so those can't be paused.
    if (!active || game.phase !== 'main' || active.frozen) return;
    freeze();
    // Phase 5: log 'pause' here.
    ui.showOverlay({
      title: 'Paused',
      text: 'Nothing changes until you resume.',
      buttons: [{ label: 'Resume', primary: true, onClick: resume }]
    });
  }
  function resume() {
    if (!active || game.phase !== 'main' || active.ended) return;
    // Phase 5: log 'resume' here.
    unfreeze();
  }

  // ---------------------------------------------------------------- Start-up
  var game = {
    phase: 'title',
    startTutorial1: startTutorial1,
    startTutorial2: startTutorial2,
    startMain: startMain,
    pause: pause,
    resume: resume,

    // Dev helper for the browser console: DS.game.current() -> { vps, cards, frozen, ... }
    current: function () { return active; },

    init: function () {
      document.getElementById('btn-start').addEventListener('click', startTutorial1);
      document.getElementById('btn-skip').addEventListener('click', function () { ui.hideOverlay(); startMain(); });
      document.getElementById('btn-pause').addEventListener('click', pause);
      // If the player switches tabs, pause. When a tab is hidden the browser stops our loop,
      // so time already stops; without this the game would silently restart the moment they
      // came back, mid-action. (pause() ignores the call if a pop-up is already showing.)
      document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
      ui.showScreen('title');
      requestAnimationFrame(frame);
    }
  };

  DS.game = game;
  game.init();
})();
