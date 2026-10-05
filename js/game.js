/*
 * game.js — the conductor. It owns the clock, the phases, and what a click MEANS.
 *
 *   title -> tutorial1 ("Hook them") -> tutorial2 ("Lose them") -> main -> reveal
 *
 * Phases 3 builds title + both tutorials. main and reveal come in later phases.
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
  //   vps      the models to tick every frame
  //   cards    the UI cards to refresh every frame
  //   frozen   true while a pop-up is up, so nothing changes behind it
  //   check    called after each tick to look for "goal reached" / "lost them"
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
        active.vps.forEach(function (vp) { vp.tick(dt); });
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
  function showResultAfterDelay(popup) {
    var token = active;
    freeze();
    setTimeout(function () {
      if (active === token && token.frozen) ui.showOverlay(popup);
    }, C.TUTORIAL_RESULT_DELAY_SEC * 1000);
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
      vps: [vp], cards: [card], frozen: false,
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
  // Placeholder until Phase 4.
  function startMain() {
    game.phase = 'main';
    if (active) active.cards.forEach(function (c) { c.destroy(); });
    active = null;
    ui.showScreen('main');
  }

  // ---------------------------------------------------------------- Start-up
  var game = {
    phase: 'title',
    startTutorial1: startTutorial1,
    startTutorial2: startTutorial2,
    startMain: startMain,

    // Dev helper for the browser console: DS.game.current() -> { vps, cards, frozen, ... }
    current: function () { return active; },

    init: function () {
      document.getElementById('btn-start').addEventListener('click', startTutorial1);
      document.getElementById('btn-skip').addEventListener('click', function () { ui.hideOverlay(); startMain(); });
      document.getElementById('btn-replay-tutorial').addEventListener('click', startTutorial1);
      ui.showScreen('title');
      requestAnimationFrame(frame);
    }
  };

  DS.game = game;
  game.init();
})();
