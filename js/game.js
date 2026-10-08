/*
 * game.js — the conductor. It owns the clock, the phases, and what a click MEANS.
 *
 *   title -> tutorial1 ("Hook them") -> main -> reveal
 *                                         ^        |
 *                                         +--------+  "Play again"
 *
 * How it fits together:
 *   vp.js      the rules (no DOM)        game.js asks it to tick and to push
 *   ui.js      the screen                game.js tells it what to show
 *   reveal.js  the results screen        game.js hands it the finished round
 *   logger.js  the data log              game.js tells it the phase/round and logs round events
 *   game.js    this file                 glue: loop, phase changes, win/lose checks
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var C = DS.CONFIG;
  var ui = DS.ui;
  var logger = DS.logger;

  // Dev mode keeps the console handles open (see lockDown at the bottom). Turn it on with
  // DEV_MODE in config.js, or by opening index.html?dev
  var DEV = C.DEV_MODE || /[?&]dev(=1|=true)?(&|$)/.test(window.location.search);

  // Playtest switches from the address bar, e.g. index.html?profiles=6&layout=grid or ?radar=learned, so
  // two groups can play two versions without anyone editing config.js. Only these three settings, and
  // only valid values, so a typo can't break the game. This runs before anything is built (and before
  // play mode freezes the settings).
  (function applyPlaytestSwitches() {
    var q = window.location.search;
    var profiles = /[?&]profiles=(\d+)/.exec(q);
    if (profiles && (+profiles[1] === 2 || +profiles[1] === 4 || +profiles[1] === 6)) C.PROFILE_COUNT = +profiles[1];
    var layout = /[?&]layout=(radar|grid)(&|$)/.exec(q);
    if (layout) C.TOPIC_LAYOUT = layout[1];
    var shows = /[?&]radar=(interests|learned)(&|$)/.exec(q);
    if (shows) C.RADAR_SHOWS = shows[1];
    // Six radars don't fit a laptop screen (the cards are too narrow and the buttons pile up), so six
    // people always use the grid. Decided here, once, so the tutorial and the game always match, and
    // the logged version ("grid/6") says what was really played.
    if (C.TOPIC_LAYOUT === 'radar' && C.PROFILE_COUNT > 4) C.TOPIC_LAYOUT = 'grid';
  })();

  var NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

  // Which version is being played, for the log: "radar-interests/4", "radar-learned/4" or "grid/6".
  function versionLabel() {
    return (C.TOPIC_LAYOUT === 'radar' ? 'radar-' + C.RADAR_SHOWS : 'grid') + '/' + C.PROFILE_COUNT;
  }

  // What is being played right now. Phases fill this in:
  //   vps       the models to tick every frame
  //   cards     the UI cards to refresh every frame
  //   frozen    true while a pop-up is up (or paused), so nothing changes behind it
  //   paused    true only while the player (or the tab being hidden) paused the main game.
  //             Kept apart from `frozen` so "resume" can never unfreeze the "ready?" card
  //             or a finished round.
  //   ended     the main round is over (waiting for the results screen)
  //   elapsed   seconds of un-frozen play so far (the round timer counts this)
  //   limitSec  optional hard stop. The main game sets it to ROUND_SEC; tutorials have none.
  //   check     called after each tick to look for "goal reached" / "lost them" / "time's up"
  var active = null;
  var roundNo = 0;        // counts main rounds in this sitting; 0 = still in the tutorials

  // The phase also goes to the logger, so every logged row says which phase and round it is from.
  function setPhase(name) {
    game.phase = name;
    logger.setContext({ phase: name, round: roundNo });
  }

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
  function showResultAfterDelay(popup) {
    var token = active;
    freeze();
    setTimeout(function () {
      if (active === token && token.frozen) ui.showOverlay(popup);
    }, C.TUTORIAL_RESULT_DELAY_SEC * 1000);
  }

  // Throw away whatever was on screen, so its cards stop listening to their VPs.
  function retire() {
    if (active) active.cards.forEach(function (c) { c.destroy(); });
    active = null;
  }

  // --------------------------------------------------------------- Tutorial
  // One tutorial, one person (Alex), a goal of TUTORIAL1_GOAL. It used to be two (hook them, then lose
  // them); the team lead cut it to one and asked for more pop-ups that explain what the player sees. So
  // the tutorial teaches in three layers:
  //   1. an intro chain of pop-ups before anything moves (the radar, the attention bar, "don't overdo it"),
  //   2. a one-time hint the first time each thing happens (a like, a skip, a repeat), and
  //   3. the win pop-up, which also says what happens when attention hits 0.
  // None of it mentions the narrowing of tastes: that stays hidden until the results screen.
  function topicWord(id) { return DS.TOPIC_BY_ID[id].label; }

  // The topics Alex's radar shows with the longest spikes, as words ("Music and Food"). Only used with the
  // interests radar, which draws exactly this snapshot already, so naming them tells the player nothing the
  // radar doesn't. Spikes within 0.1 of the longest count: the starting tastes carry a small random wobble,
  // so two favorites are never exactly equal, and "the longest" alone would hide a near-tie.
  function longestSpikes(vp) {
    var max = 0;
    DS.TOPIC_IDS.forEach(function (id) { max = Math.max(max, vp.tasteSnapshotStart[id]); });
    var ids = DS.TOPIC_IDS.filter(function (id) { return vp.tasteSnapshotStart[id] >= max - 0.1; });
    return { ids: ids, words: ids.map(topicWord).join(' and '), plural: ids.length > 1 };
  }

  // What a tutorial pop-up can point at. Each returns a function (not an element), because the card is
  // rebuilt on "Try again" and the pop-up looks the element up only when it is shown.
  function cardPart(selector) {
    return function () { return document.querySelector('#tut-card-slot ' + selector); };
  }
  function topicButton(topicId) {
    return function () {
      var all = document.querySelectorAll('#tut-card-slot .topic-btn');
      return all[DS.TOPIC_IDS.indexOf(topicId)] || null;
    };
  }

  // Show pop-ups one after another. Each has a "Next" button; the last one calls `done`. `token` is the
  // game state we started from: if the player skipped the tutorial meanwhile, the chain stops.
  function showPopupChain(pages, token, done) {
    function show(i) {
      if (active !== token) return;
      var last = i === pages.length - 1;
      ui.showOverlay({
        title: pages[i].title,
        text: pages[i].text,
        target: pages[i].target,
        buttons: [{
          label: last ? 'Got it' : 'Next', primary: true,
          onClick: function () { if (last) done(); else show(i + 1); }
        }]
      });
    }
    show(0);
  }

  // The intro: each page points at the thing it talks about and says it in a line or two, so the player
  // looks at the card instead of reading a wall of text.
  function introPages(vp, interests) {
    var spikes = interests ? longestSpikes(vp) : null;
    var pages = [
      { title: 'Meet ' + vp.name, text: 'Keep ' + vp.name + ' scrolling by showing posts they like.',
        target: cardPart('.card__head') },
      { title: 'This is attention', text: 'Likes raise it. Skips drop it. At 0, ' + vp.name + ' leaves for good.\nGet it to the goal line.',
        target: cardPart('.meter') }
    ];
    if (interests) {
      pages.push({ title: 'This is a radar plot',
        text: 'A longer spike means ' + vp.name + ' likes that topic more.\n' + spikes.words + (spikes.plural ? ' are' : ' is') + ' longest.',
        target: cardPart('.radar') });
      pages.push({ title: 'Don\'t overdo it',
        text: 'A long spike doesn\'t mean you can show it again and again. Each repeat gains less.',
        // point at one of the longest spikes: the button the player will be tempted to press over and over
        target: topicButton(spikes.ids[0]) });
    } else if (C.TOPIC_LAYOUT === 'radar') {
      pages.push({ title: 'This is a radar plot',
        text: 'You don\'t know what ' + vp.name + ' likes yet. Try a topic: the spike grows when they like it.',
        target: cardPart('.radar') });
      pages.push({ title: 'Don\'t overdo it',
        text: 'Even a topic ' + vp.name + ' likes gets old if you repeat it. Each repeat gains less.',
        target: cardPart('.radar') });
    } else {
      pages.push({ title: 'Find what ' + vp.name + ' likes',
        text: 'Try a topic and watch the reaction. The counts show how often it worked.',
        target: cardPart('.topics') });
      pages.push({ title: 'Don\'t overdo it',
        text: 'Even a topic ' + vp.name + ' likes gets old if you repeat it. Each repeat gains less.',
        target: cardPart('.topics') });
    }
    return pages;
  }

  // One-time hints while Alex is being played. `seen` makes each fire once per tutorial run. Each points at
  // what just happened: the meter for a like, the button that was pressed for a repeat.
  function attachHints(vp, token, interests) {
    var seen = {};
    function hint(key, title, text, target) {
      if (seen[key]) return;
      seen[key] = true;
      // Wait a moment so the player SEES the reaction (the bubble, the +/- pill) before the text covers it.
      setTimeout(function () {
        // The goal or an AFK pop-up may have taken over in the meantime, or the player may have left.
        if (active !== token || token.frozen) return;
        freeze();
        ui.showOverlay({ title: title, text: text, target: target, buttons: [{
          label: 'Got it', primary: true,
          onClick: function () { if (active === token && !token.ended) unfreeze(); }
        }] });
      }, C.TUTORIAL_HINT_DELAY_SEC * 1000);
    }
    vp.onEvent(function (e) {
      if (e.event !== 'push') return;
      if (e.fatigueMult !== null && e.fatigueMult < 1) {
        hint('repeat', 'Same topic again',
             'Repeats gain less, so the + is smaller. Mix it up!', topicButton(e.topic));
      } else if (e.liked) {
        hint('liked', vp.name + ' liked it!',
             'Attention rises while ' + vp.name + ' watches. Buttons lock until the post ends.', cardPart('.meter'));
      } else {
        hint('skipped', vp.name + ' skipped it',
             'A skip costs attention right away.' + (interests ? ' Aim for the long spikes.' : ' Try something else.'),
             cardPart('.meter'));
      }
    });
  }

  function startTutorial1() {
    setPhase('tutorial1');
    ui.hideOverlay();
    ui.hideBanner();
    retire();

    var vp = DS.createTutorialVP();           // slower idle drain (TUTORIAL_DRAIN_MULT)
    logger.watch(vp);
    var card = ui.createCard(vp, {
      size: 'large',
      showHistory: true,
      goalMarker: C.TUTORIAL1_GOAL,
      onPush: function (topicId) { vp.push(topicId); }
    });
    ui.mountCard('tut-card-slot', card);

    var interests = ui.showsInterests();
    ui.setTutorialHeader({
      step: 'Tutorial',
      title: 'Hook them',
      text: 'Pick posts to show ' + vp.name + '. Keep ' + vp.name + ' scrolling.',
      goal: 'Goal: get ' + vp.name + '\'s attention up to ' + C.TUTORIAL1_GOAL
    });
    ui.showScreen('tutorial');

    var tutorial = active = {
      vps: [vp], cards: [card], frozen: false, elapsed: 0,
      check: function () {
        if (vp.attention >= C.TUTORIAL1_GOAL) {
          showResultAfterDelay({
            title: 'You did it!',
            // With the interests radar the player didn't have to figure Alex out, so say where such a
            // radar comes from instead: that is the AI idea behind it. Then say what the other way to
            // end a round is, since there is no longer a second tutorial that makes Alex leave.
            text: (interests
              ? 'Real apps keep a profile like this radar on every user. They build it from every post you watch or skip.\n'
              : 'You figured out what Alex likes. That\'s what a recommender algorithm does. It learns from what you click.\n') +
              'In the game, an ignored person leaves at 0. For a platform, that\'s the worst outcome: no attention, no ads.',
            buttons: [{ label: 'Start the game', primary: true, onClick: startMain }]
          });
        } else if (vp.state === 'afk') {
          // Pushed too many posts they hate. Let them try again with a fresh Alex.
          showResultAfterDelay({
            title: 'Alex left!',
            text: 'Alex got bored and closed the app. Try again. ' +
                  (interests ? 'Show Alex the topics with long spikes.' : 'Look for the posts Alex likes.'),
            buttons: [{ label: 'Try again', primary: true, onClick: startTutorial1 }]
          });
        }
      }
    };

    // Nothing moves until the intro has been read (Alex's attention would drain behind the pop-ups).
    freeze();
    attachHints(vp, tutorial, interests);
    showPopupChain(introPages(vp, interests), tutorial, function () {
      if (active === tutorial) unfreeze();
    });
  }

  // -------------------------------------------------------------- Main game
  // A few VPs (PROFILE_COUNT), one shared clock. The player has to spread attention across all of them:
  // every idle VP drains, so pushing to one means the others are getting closer to AFK.
  // That juggling is what makes "just keep them hooked" feel like a real job.
  function startMain() {
    roundNo++;
    setPhase('main');
    ui.hideOverlay();                       // e.g. the tutorial's "Start the game" pop-up
    ui.hideBanner();
    retire();

    var vps = DS.createCast();
    vps.forEach(function (vp) { logger.watch(vp); });
    var cards = vps.map(function (vp) {
      return ui.createCard(vp, {
        size: 'compact',
        onPush: function (topicId) { vp.push(topicId); }
      });
    });
    ui.mountCards('main-grid', cards);
    ui.showScreen('main');

    var round = active = {
      vps: vps, cards: cards,
      frozen: false, paused: false, ended: false,
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
      // One idea per line (the pop-up keeps the line breaks): easier to read than one block.
      text: (NUMBER_WORDS[vps.length] || vps.length) + ' people are scrolling. Show each one posts they like.\n' +
            'Ignore someone and their attention drains. At 0, they leave for good.\n' +
            (ui.showsInterests() ? 'Each radar shows what that person is into. ' : '★ = a clue from their bio. ') +
            'Even favorites get skipped sometimes.\n' +
            'You have ' + C.ROUND_SEC + ' seconds.',
      buttons: [{
        label: 'Go!', primary: true,
        onClick: function () {
          // The check guards against a stale click if the player somehow restarted meanwhile.
          if (active !== round || round.ended) return;
          // The round really starts now, so this is when each person's starting state is logged.
          // The detail says which version is being played (e.g. "radar-interests/4"), so a playtest
          // that compares versions can tell the rows apart.
          vps.forEach(function (vp) { logger.logVP('round_start', vp, versionLabel()); });
          unfreeze();
        }
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
    freeze();                                // nothing can be clicked or change from here on

    // Log each person's final state BEFORE the clock-filling below, so round_time_sec is the
    // real moment the round ended.
    round.vps.forEach(function (vp) { logger.logVP('round_end', vp, reason); });
    logger.flushPending();                   // hand the whole round to flush()

    // If everyone left early, the round isn't over for scoring purposes: "AFK counts as 0"
    // means the rest of the round counts as 0 too. Otherwise losing everyone at second 40
    // would be averaged over 40 seconds and look better than it should. They're all AFK,
    // so this tick only advances each VP's clock; it adds no attention.
    if (reason === 'all_afk') {
      round.vps.forEach(function (vp) { vp.tick(Math.max(0, C.ROUND_SEC - round.elapsed)); });
    }
    updateHud();

    // Let the player see the final board (who left, who stayed) for a moment first.
    ui.showBanner(reason === 'all_afk' ? 'Everyone left!' : 'Time\'s up!');
    setTimeout(function () {
      if (active !== round) return;          // they restarted in the meantime: drop this
      ui.hideBanner();
      setPhase('reveal');
      // The halves of the round are halves of the time that REALLY passed (round.elapsed),
      // which is shorter than ROUND_SEC when everyone left early.
      DS.reveal.show(DS.metrics.buildReveal(round.vps, round.elapsed), {
        onDownload: function () { return logger.exportCSV(); },
        onPlayAgain: startMain,
        onReplayTutorial: startTutorial1
      });
    }, C.ROUND_END_DELAY_SEC * 1000);
  }

  // ------------------------------------------------------------------ Pause
  // For classroom use: the teacher can stop everything to talk. Pausing is just "freeze":
  // the loop stops ticking the VPs and the clock, and the cards lock their buttons.
  // Nothing about the game state changes, so resuming picks up exactly where it stopped.
  // `why` ends up in the log: 'button', 'key' or 'tab_hidden'.
  function pause(why) {
    // frozen also covers "ready?", "round over" and already-paused, so none of those can be paused.
    if (!active || game.phase !== 'main' || active.frozen) return;
    active.paused = true;
    freeze();
    logger.logGame('pause', active.elapsed, why || 'button');
    ui.showOverlay({
      title: 'Paused',
      text: 'Nothing changes until you resume.',
      buttons: [{ label: 'Resume', primary: true, onClick: resume }]
    });
  }
  function resume() {
    // Only a real pause can be resumed (not the "ready?" card, not a finished round).
    if (!active || game.phase !== 'main' || !active.paused || active.ended) return;
    active.paused = false;
    logger.logGame('resume', active.elapsed);
    unfreeze();
  }

  // ---------------------------------------------------------------- Lock down
  // Play mode only. A curious student can open the browser console, so we close the easy
  // doors: the live tastes aren't reachable (no DS.game.current, and the log that records them
  // is sealed during play and can't have its flush() swapped out), the settings can't be edited
  // while playing, and the dice (DS.rng.use) can't be swapped for "always liked".
  // It's a speed bump, not security: the answer key (who likes what) is in content.js, and someone
  // determined can edit the files or use the debugger. Don't use scores for grades.
  // tests.html and sim.html never load this file, so they can still change settings freely.
  function deepFreeze(o) {
    Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); });
    return Object.freeze(o);
  }
  function lockDown() {
    deepFreeze(DS.CONFIG);
    Object.freeze(DS.rng);
    Object.freeze(DS.VP.prototype);
    Object.freeze(DS.metrics);
    Object.freeze(DS.logger);   // flush() can't be replaced with a function that prints the records
    Object.freeze(DS);          // last: nobody can replace DS.rng, DS.metrics, ... with their own
  }

  // ---------------------------------------------------------------- Start-up
  var game = {
    phase: 'title',
    startTutorial1: startTutorial1,
    startMain: startMain,
    pause: pause,
    resume: resume,

    init: function () {
      document.getElementById('btn-start').addEventListener('click', startTutorial1);
      document.getElementById('btn-skip').addEventListener('click', function () { ui.hideOverlay(); startMain(); });
      document.getElementById('btn-pause').addEventListener('click', function () { pause('button'); });
      DS.reveal.init();

      // Esc pauses, and resumes if already paused.
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || e.repeat) return;
        if (active && active.paused) { if (!ui.guardActive()) { ui.hideOverlay(); resume(); } }
        else pause('key');
      });
      // If the player switches tabs, pause. When a tab is hidden the browser stops our loop,
      // so time already stops; without this the game would silently restart the moment they
      // came back, mid-action. (pause() ignores the call if a pop-up is already showing.)
      document.addEventListener('visibilitychange', function () { if (document.hidden) pause('tab_hidden'); });

      ui.showScreen('title');
      requestAnimationFrame(frame);
    }
  };

  // Dev helper for the browser console: DS.game.current() -> { vps, cards, frozen, ... }
  // It hands out the hidden tastes, so it exists only in dev mode. Dev mode also loads
  // tests/dev-helpers.js (DS.dev.play() and friends).
  if (DEV) {
    game.current = function () { return active; };
    var helpers = document.createElement('script');
    helpers.src = 'tests/dev-helpers.js';
    document.head.appendChild(helpers);
  }

  DS.game = game;
  game.init();
  if (!DEV) lockDown();
})();
