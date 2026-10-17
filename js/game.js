/*
 * game.js — the conductor. It owns the clock, the phases, and what a click MEANS.
 *
 *   (name screen) -> title -> tutorial1 (explore, then exploit) -> main -> reveal
 *         ^                                                        ^        |
 *         |                                                        +--------+  "Play again"
 *         +---------------------------------------------------------------+  "Log out" (the next player)
 *
 * The name screen comes first but isn't a phase: nothing is played or logged there. It asks for the
 * player's name (it names their folder and CSV files, logger.fileName), their grade (a CSV column), a gamer
 * tag (the leaderboard only) and, once per visit, the data folder the files are saved in (datafolder.js).
 *
 * Saving: each part of the session is written as soon as it ends (logger.saveFinished): the tutorial when the
 * game starts, each round when it ends. The round's leaderboard row is saved at the same moment.
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
  var gamerTag = '';      // from the name screen; only the leaderboard sees it (never the data rows)

  // The phase also goes to the logger, so every logged row says which phase and round it is from.
  // Tutorial rows are round 0 even when the tutorial is replayed after a round: they go in the tutorial's file.
  function setPhase(name) {
    game.phase = name;
    logger.setContext({ phase: name, round: name === 'main' ? roundNo : 0 });
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
  // One tutorial, one person (Alex), in two steps that introduce the idea the results come back to:
  //   Step 1, EXPLORE  Alex is a new user, so their profile starts empty. Push random topics as tests ("watch or
  //                    skip?") until every topic is tried. Some get skipped: that's the cost of exploring.
  //   Step 2, EXPLOIT  show what passed the tests, because the algorithm's job is keeping Alex on the app. Get
  //                    TUTORIAL_EXPLOIT_STREAK watches in a row; a skip starts the count again.
  // The opening pop-up says that job first ("You are the algorithm..."), so both steps have a reason.
  // The radar is a profile built from watches (radarShows 'profile'): each watched post moves that topic out
  // one ring, so the player sees the profile being built. It shows only what the player saw, never the tastes.
  // Pop-ups teach in three layers: an intro chain before anything moves, a one-time hint the first time
  // something happens (a like, a skip, a repeat), and a pop-up at the end of each step. None of it mentions
  // the narrowing of tastes: that stays hidden until the results screen. The round never names the two words.
  //
  // The tutorial's words follow its own card (a profile radar, or the grid's counts), never
  // ui.showsInterests(). Only the last pop-up asks about the round, to say what comes next.
  var TUTORIAL_RADAR_SHOWS = 'profile';

  // The topics not shown to this person yet (the radar's "?"s).
  function untriedTopics(vp) {
    return DS.TOPIC_IDS.filter(function (id) { return !vp.history.some(function (h) { return h.topic === id; }); });
  }
  // ['music'] -> "Music", two -> "Music and Food", more -> "Music, Food and Movies"
  function topicWords(ids) {
    var names = ids.map(function (id) { return DS.TOPIC_BY_ID[id].label; });
    return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
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
  // game state we started from: if the player skipped the tutorial meanwhile, the chain stops. A page's
  // optional onShow runs as it appears (the header behind it can change with it).
  function showPopupChain(pages, token, done) {
    function show(i) {
      if (active !== token) return;
      var last = i === pages.length - 1;
      if (pages[i].onShow) pages[i].onShow();
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

  // Run fn once the screen is free: after delaySec (so the player first SEES what just happened, the bubble
  // and the +/- pill), and after any pop-up that is already up, rather than dropping it. Once the player
  // leaves the tutorial, active changes and fn never runs.
  function whenFree(token, delaySec, fn) {
    function go() {
      if (active !== token) return;
      if (token.frozen) { setTimeout(go, 300); return; }
      fn();
    }
    setTimeout(go, delaySec * 1000);
  }

  // The intro: each page points at the thing it talks about and says it in a line or two, so the player
  // looks at the card instead of reading a wall of text. `profileRadar` = the card has the profile radar;
  // otherwise it is the grid, whose buttons count what was tried.
  function introPages(vp, profileRadar) {
    var pages = [
      { title: 'Meet ' + vp.name, text: vp.name + ' just joined the app. You are the algorithm: your job is to keep ' +
        vp.name + ' on the app as long as possible.',
        target: cardPart('.card__head') },
      { title: 'This is attention', text: 'Likes raise it. Skips drop it. At 0, ' + vp.name + ' leaves for good.',
        target: cardPart('.meter') }
    ];
    if (profileRadar) {
      // How the rings work is left to the first-watch hint ("That topic grew one ring"), when the player sees one grow.
      pages.push({ title: 'This is ' + vp.name + '\'s Interest radar!',
        text: 'Each post helps reveal what ' + vp.name + ' likes. Watch the radar fill in as you learn more about them.',
        target: cardPart('.radar') });
    } else {
      pages.push({ title: 'These are the topics',
        text: 'Each badge counts how often ' + vp.name + ' watched that topic, out of how often you showed it.',
        target: cardPart('.topics') });
    }
    pages.push({ title: 'Step 1: Explore',
      text: DS.revealText.exploring + '\nPush random topics as tests: does ' + vp.name + ' watch, or skip? Test all ' +
            DS.TOPIC_IDS.length + '. Skips are the cost.',
      target: cardPart(profileRadar ? '.radar' : '.topics') });
    return pages;
  }

  // The pop-ups between the steps: what exploring found (only what the player saw: watches), then step 2.
  function exploredPages(vp, profileRadar) {
    var seen = DS.metrics.observed(vp.history);
    var watched = DS.TOPIC_IDS.filter(function (id) { return seen[id].likes > 0; })
                              .sort(function (a, b) { return seen[b].likes - seen[a].likes; });
    var skips = vp.history.some(function (h) { return !h.liked; });
    var where = cardPart(profileRadar ? '.radar' : '.topics');
    return [
      // A milestone with more to say than a spotlight panel holds, so it's the centered card (no target).
      { title: 'You explored!',
        text: 'Your tests are done. ' +
              (watched.length ? vp.name + ' watched ' + topicWords(watched) + '.' : vp.name + ' hasn\'t watched anything yet.') +
              (skips ? ' The skips were the price of finding out.' : '') +
              '\nEvery new user starts empty like this, so apps explore to learn them.' },
      { title: 'Step 2: Exploit',
        text: DS.revealText.exploiting + '\nNow show only topics that passed your tests. Get ' + C.TUTORIAL_EXPLOIT_STREAK +
              ' watches in a row: a skip starts the count again.',
        target: where }
    ];
  }

  // One-time hints while Alex is being played. `seen` makes each fire once per tutorial run. Each points at
  // what just happened: the radar for a watch, the button that was pressed for a skip or a repeat. The like
  // and the skip are said as signals ("interested", "not interested"), because that is all an app learns from.
  function attachHints(vp, token, profileRadar) {
    var seen = {};
    function hint(key, title, text, target) {
      if (seen[key]) return;
      seen[key] = true;
      whenFree(token, C.TUTORIAL_HINT_DELAY_SEC, function () {
        freeze();
        ui.showOverlay({ title: title, text: text, target: target, buttons: [{
          label: 'Got it', primary: true,
          onClick: function () { if (active === token && !token.ended) unfreeze(); }
        }] });
      });
    }
    vp.onEvent(function (e) {
      if (e.event !== 'push') return;
      if (e.fatigueMult !== null && e.fatigueMult < 1) {
        hint('repeat', 'Same topic again',
             'Repeats gain less, so the + is smaller. Mix it up!', topicButton(e.topic));
      } else if (e.liked) {
        hint('liked', vp.name + ' watched it!',
             (profileRadar ? 'That topic grew one ring on the radar.' : 'So attention goes up.') + ' Apps count a watch as "interested".',
             cardPart(profileRadar ? '.radar' : '.meter'));
      } else {
        hint('skipped', vp.name + ' skipped it',
             (profileRadar ? 'No ring, and attention drops.' : 'Attention drops.') + ' A skip is a signal too: "not interested".',
             topicButton(e.topic));
      }
    });
  }

  // The win pop-up. Each line is only said when it is true for the version being played: the ROUND's
  // radars decide the second (never promise filled-in radars to ?radar=learned or the grid), and the last says
  // the other way a round ends, since no tutorial shows it.
  function winText(vp) {
    var lines = ['You explored: random topics tested what ' + vp.name + ' likes. Then you exploited what passed, to keep ' +
                 vp.name + ' on the app. Real apps do both with every user.'];
    if (ui.showsInterests()) {
      lines.push('Now the radars come filled in. Can you keep ' +
                 String(NUMBER_WORDS[C.PROFILE_COUNT] || C.PROFILE_COUNT).toLowerCase() + ' people hooked?');
    }
    lines.push('In the game, an ignored person leaves at 0. For a platform, that\'s the worst outcome: no attention, no ads.');
    return lines.join('\n');
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
      radarShows: TUTORIAL_RADAR_SHOWS,       // an empty profile, whatever the round's radars show
      onPush: function (topicId) { vp.push(topicId); }
    });
    ui.mountCard('tut-card-slot', card);

    var profileRadar = C.TOPIC_LAYOUT === 'radar';
    var step = 1, step2From = 0, exploredShown = false;
    // Watches in a row since step 2 began (a skip ends the run).
    function streak() {
      var n = 0;
      for (var i = vp.history.length - 1; i >= step2From && vp.history[i].liked; i--) n++;
      return n;
    }
    // The header and the goal, which counts what is left of the step ("3/6", "1/3") after every post.
    function header() {
      var all = DS.TOPIC_IDS.length, need = C.TUTORIAL_EXPLOIT_STREAK;
      ui.setTutorialHeader(step === 1 ? {
        step: 'Step 1 of 2 · Explore',
        title: 'Test what ' + vp.name + ' likes',
        text: 'You know nothing about ' + vp.name + ' yet. Push random topics to test them, and watch the ' +
              (profileRadar ? 'radar' : 'counts') + ' fill in.',
        goal: 'Goal: test all ' + all + ' topics (' + (all - untriedTopics(vp).length) + '/' + all + ')'
      } : {
        step: 'Step 2 of 2 · Exploit',
        title: 'Keep ' + vp.name + ' on the app',
        text: 'You\'re the algorithm: show what passed your tests, so ' + vp.name + ' stays as long as possible.',
        goal: 'Goal: ' + need + ' watches in a row (' + Math.min(streak(), need) + '/' + need + ')'
      });
    }
    header();
    vp.onEvent(function (e) { if (e.event === 'push') header(); });
    ui.showScreen('tutorial');

    var tutorial = active = {
      vps: [vp], cards: [card], frozen: false, elapsed: 0,
      check: function () {
        if (step === 2 && streak() >= C.TUTORIAL_EXPLOIT_STREAK) {
          showResultAfterDelay({
            title: 'You did it!',
            text: winText(vp),
            buttons: [{ label: 'Start the game', primary: true, onClick: startMain },
                      { label: 'Replay the tutorial', onClick: startTutorial1 }]
          });
        } else if (vp.state === 'afk') {
          // Too many skips, or left waiting. Let them try again with a fresh Alex.
          showResultAfterDelay({
            title: vp.name + ' left!',
            text: vp.name + ' got bored and closed the app. Each skip costs attention, and waiting drains it. Try again.',
            buttons: [{ label: 'Try again', primary: true, onClick: startTutorial1 }]
          });
        } else if (step === 1 && !exploredShown && !untriedTopics(vp).length) {
          // Every topic tried: say what exploring found, then start step 2 once the player has read it.
          exploredShown = true;
          whenFree(tutorial, C.TUTORIAL_HINT_DELAY_SEC, function () {
            freeze();
            var pages = exploredPages(vp, profileRadar);
            // Step 2 begins as its pop-up appears, so the header behind it already says so. Nothing can be
            // pushed while the pop-ups are up, so its run counts from here.
            pages[1].onShow = function () { step = 2; step2From = vp.history.length; header(); };
            showPopupChain(pages, tutorial, function () { if (active === tutorial) unfreeze(); });
          });
        }
      }
    };

    // Nothing moves until the intro has been read (Alex's attention would drain behind the pop-ups).
    freeze();
    attachHints(vp, tutorial, profileRadar);
    showPopupChain(introPages(vp, profileRadar), tutorial, function () {
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
    saveFinished();                         // the tutorial has ended: its file can be written now
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

  // ----------------------------------------------------------------- Saving
  // What the big picture says about the player's files ({ where: 'folder' | 'pending' | 'failed' | 'none' }).
  // Each call replaces it, so an older save that finishes late can't overwrite a newer answer.
  var saving = { where: 'none' };
  function saveFinished() {
    if (!logger.hasFolder()) { saving = { where: 'none' }; return; }
    var mine = saving = { where: 'pending' };
    Promise.resolve().then(function () { return logger.saveFinished(); }).then(function () {
      if (saving === mine) saving = { where: 'folder', folder: logger.folderName() };
    }, function () {
      // A failed part stays unsaved, so the next save (or "Log out") tries it again.
      if (saving === mine) saving = { where: 'failed' };
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

    // The round is over, so its rows may leave the log now: their hidden tastes are what the results are about
    // to show. 'reveal' unseals the log, and the round's file is written while the banner is up.
    setPhase('reveal');
    saveFinished();
    // The halves of the round are halves of the time that REALLY passed (round.elapsed),
    // which is shorter than ROUND_SEC when everyone left early.
    var data = DS.metrics.buildReveal(round.vps, round.elapsed);
    // Its leaderboard row, saved now too, so the board is usually ready long before its step comes up.
    var entry = DS.leaderboard.entry(gamerTag || 'Player', data.points, roundNo, versionLabel());
    Promise.resolve().then(function () { return DS.leaderboard.add(entry, versionLabel()); }).then(function (board) {
      round.board = board;
      DS.reveal.setBoard(data, board);       // in case the results are already up
    });

    // Let the player see the final board (who left, who stayed) for a moment first.
    ui.showBanner(reason === 'all_afk' ? 'Everyone left!' : 'Time\'s up!');
    setTimeout(function () {
      if (active !== round) return;          // they restarted in the meantime: drop this
      ui.hideBanner();
      DS.reveal.show(data, {
        onPlayAgain: startMain,
        onReplayTutorial: startTutorial1,
        onLogOut: logOut,
        saveStatus: function () { return saving; }
      }, round.board);
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
    Object.freeze(DS.leaderboard);
    Object.freeze(DS.dataFolder);
    Object.freeze(DS);          // last: nobody can replace DS.rng, DS.metrics, ... with their own
  }

  // ---------------------------------------------------------------- Log out
  // From the results screen: the player is done, and the laptop goes to the next student. Their files are
  // saved first (the parts not saved yet; usually none, as each part saves when it ends), because a new session
  // starts with an empty log. Then everything about this player is forgotten: the round count, the session id,
  // the name, grade and gamer tag. The data folder stays chosen: it's the laptop's, not the player's.
  function logOut() {
    var result = logger.saveUnsaved();
    if (!result || typeof result.then !== 'function') { forgetPlayer(); return; }
    // Writing takes a moment: nothing can be clicked meanwhile (a "Play again" would start a round that the
    // log-out then throws away).
    ui.showOverlay({ title: 'Saving your files…', text: 'One moment.', buttons: [] });
    result.then(forgetPlayer, function () {
      ui.showOverlay({
        title: 'Could not save',
        text: 'Your files didn\'t reach the data folder. Check that it is still there, then try again.\nOr download them instead.',
        buttons: [{ label: 'Try again', primary: true, onClick: logOut },
                  { label: 'Download them', onClick: function () { logger.downloadUnsaved(); forgetPlayer(); } }]
      });
    });
  }
  function forgetPlayer() {
    retire();
    roundNo = 0;
    gamerTag = '';
    saving = { where: 'none' };
    logger.reset();
    game.phase = 'title';
    ui.hideOverlay();
    ui.hideBanner();
    showNameScreen();
  }

  // ---------------------------------------------------------------- Start-up
  // The first screen: who is playing. Everything is needed: both names (the teacher sorts the folders by them),
  // a grade (8th, or typed), a gamer tag, and the data folder (in a browser that can write to one).
  // The checks use the CLEANED values, so "???" counts as an empty name instead of making a folder called "_".
  var form = null;                           // the first screen's fields, found once (askName)

  function folderStatus() {
    var folder = DS.dataFolder;
    form.folderBtn.hidden = !folder.supported();
    form.folderStatus.textContent = !folder.supported()
      ? 'This browser can\'t save to a folder. Your files will download when you log out.'
      : folder.ready() ? '✓ Saving to the data folder.' : 'Not chosen yet.';
    form.folderStatus.classList.toggle('folder__status--ok', folder.ready());
  }

  function showNameScreen() {
    [form.first, form.last, form.gradeOther, form.tag].forEach(function (input) { input.value = ''; input.removeAttribute('aria-invalid'); });
    form.grade8.checked = false;
    form.grade.classList.remove('grade--invalid');
    form.error.textContent = '';
    folderStatus();
    ui.showScreen('name');
    form.first.focus();
  }

  function askName() {
    var $ = function (id) { return document.getElementById(id); };
    form = {
      el: $('name-form'), first: $('name-first'), last: $('name-last'),
      grade: $('grade'), grade8: $('grade-8th'), gradeOther: $('grade-other'), tag: $('gamer-tag'),
      folderBtn: $('btn-folder'), folderStatus: $('folder-status'), error: $('name-error')
    };
    form.tag.maxLength = C.GAMER_TAG_MAX;
    form.gradeOther.maxLength = C.GRADE_MAX;
    // One grade or the other: ticking 8th clears a typed grade, and typing one unticks 8th.
    form.grade8.addEventListener('change', function () { if (form.grade8.checked) form.gradeOther.value = ''; });
    form.gradeOther.addEventListener('input', function () { if (form.gradeOther.value) form.grade8.checked = false; });

    form.folderBtn.addEventListener('click', function () {
      DS.dataFolder.choose().then(folderStatus, function () {
        form.folderStatus.textContent = 'That folder can\'t be used. Pick the game\'s data folder.';
      });
    });

    // Says what is missing (the first thing only), marks it and puts the cursor there.
    function problem(message, focus, invalid) {
      form.error.textContent = message;
      (invalid || []).forEach(function (input) { input.setAttribute('aria-invalid', 'true'); });
      focus.focus();
    }

    form.el.addEventListener('submit', function (e) {
      e.preventDefault();                    // a real submit would reload the page
      var names = [form.first, form.last];
      var missing = names.filter(function (input) { return !logger.cleanName(input.value); });
      [form.first, form.last, form.gradeOther, form.tag].forEach(function (input) { input.setAttribute('aria-invalid', 'false'); });
      names.forEach(function (input) { input.setAttribute('aria-invalid', String(missing.indexOf(input) !== -1)); });
      var grade = form.grade8.checked ? '8th' : logger.cleanGrade(form.gradeOther.value);
      form.grade.classList.toggle('grade--invalid', !missing.length && !grade);
      var tag = DS.leaderboard.cleanTag(form.tag.value);

      if (missing.length) return problem('Type your first and last name.', missing[0]);
      if (!grade) return problem('Tick 8th grade, or type your grade.', form.grade8, [form.gradeOther]);
      if (!tag) return problem('Pick a gamer tag for the leaderboard.', form.tag, [form.tag]);
      if (!DS.leaderboard.tagAllowed(tag)) return problem('Pick a different gamer tag.', form.tag, [form.tag]);
      if (DS.dataFolder.supported() && !DS.dataFolder.ready()) {
        return problem('Choose the data folder first (ask your teacher).', form.folderBtn);
      }
      form.error.textContent = '';
      logger.setPlayer(form.first.value, form.last.value, grade);
      gamerTag = tag;
      ui.showScreen('title');
      // A double-click (or a held Enter) on Continue must not land on Start and skip the title.
      ui.armGuard();
      document.getElementById('btn-start').focus();
    });
    showNameScreen();
  }

  var game = {
    phase: 'title',
    startTutorial1: startTutorial1,
    startMain: startMain,
    logOut: logOut,
    pause: pause,
    resume: resume,

    init: function () {
      document.getElementById('btn-start').addEventListener('click', ui.guarded(startTutorial1));
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

      askName();
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
