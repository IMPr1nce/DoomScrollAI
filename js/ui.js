/*
 * ui.js — everything that touches the page: screens, the pop-up, the scoreboard, banner and
 * the profile card. (The results screen is in reveal.js.)
 *
 * It only DISPLAYS the model (vp.js) and reports clicks upward. It never decides
 * game rules. The card asks the model "can I push?" and "what's the attention?" every
 * frame, and the game (game.js) decides what a click means.
 *
 * Important: the card must NEVER show vp.tastes. Those are hidden until the reveal.
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var C = DS.CONFIG;

  // Tiny helper so building elements isn't 4 lines each. Uses textContent, never
  // innerHTML, so text can't be mistaken for markup.
  function h(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function $(id) { return document.getElementById(id); }

  var ui = {};
  ui.h = h;          // reveal.js builds its elements with the same helper
  ui.$ = $;

  // ------------------------------------------------------------ Click guard
  // Frantic clicking is the normal way to play this game, so when a pop-up or the results
  // screen appears, a click that was aimed at a topic button can land on whatever just
  // appeared (a double-click on "Play again" would hit "Go!" and skip the instructions; the
  // last clicks of a round could skip the whole results screen). So: for CLICK_GUARD_MS after
  // something appears, guarded buttons ignore clicks. We check in the click handler rather than
  // disabling the buttons, because that also stops key-repeat from Enter/Space.
  var guardUntil = 0;
  ui.armGuard = function () {
    if (!C.CLICK_GUARD_MS) return;
    guardUntil = performance.now() + C.CLICK_GUARD_MS;
    document.body.classList.add('guarded');       // buttons look slightly faded: "not ready yet"
    setTimeout(function () {
      if (performance.now() >= guardUntil) document.body.classList.remove('guarded');
    }, C.CLICK_GUARD_MS + 20);
  };
  ui.guardActive = function () { return performance.now() < guardUntil; };
  // Wrap a click handler so it is ignored while the guard is up.
  ui.guarded = function (fn) {
    return function (e) { if (!ui.guardActive()) fn(e); };
  };

  // ------------------------------------------------------------------ Screens
  ui.showScreen = function (name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('screen--active');
    $('screen-' + name).classList.add('screen--active');
    document.body.setAttribute('data-screen', name);   // lets CSS tweak the page per screen
    window.scrollTo(0, 0);
  };

  // ------------------------------------------------------------------ Pop-up
  // opts: { title, text, buttons: [{ label, primary, onClick }] }
  ui.showOverlay = function (opts) {
    $('overlay-title').textContent = opts.title;
    $('overlay-text').textContent = opts.text;
    var box = $('overlay-buttons');
    box.innerHTML = '';
    (opts.buttons || []).forEach(function (b) {
      var btn = h('button', 'btn btn--big ' + (b.primary ? 'btn--primary' : 'btn--ghost'), b.label);
      btn.type = 'button';
      btn.addEventListener('click', ui.guarded(function () { ui.hideOverlay(); if (b.onClick) b.onClick(); }));
      box.appendChild(btn);
    });
    $('overlay').hidden = false;
    // Make the page behind the pop-up "inert": Tab can't reach it and clicks can't hit it.
    // Without this, a keyboard user could Tab behind the pop-up and press Pause or Skip.
    $('app').inert = true;
    ui.armGuard();
    // Keyboard users: put focus on the main button so Enter/Space continues.
    var first = box.querySelector('button');
    if (first) first.focus();
  };
  ui.hideOverlay = function () {
    $('overlay').hidden = true;
    $('app').inert = false;
  };
  ui.overlayShown = function () { return !$('overlay').hidden; };

  // ------------------------------------------------------------------ Banner
  // A big message over the board ("Time's up!") while the final board is still visible.
  ui.showBanner = function (text) {
    var b = $('banner');
    $('banner-text').textContent = text;
    b.hidden = false;
    b.classList.remove('banner--pop');
    void b.offsetWidth;                  // restart the animation
    b.classList.add('banner--pop');
  };
  ui.hideBanner = function () { $('banner').hidden = true; };

  // ---------------------------------------------------------------- Tutorial
  ui.setTutorialHeader = function (o) {
    $('tut-step').textContent = o.step;
    $('tut-title').textContent = o.title;
    $('tut-text').textContent = o.text;
    $('tut-goal').textContent = o.goal;
  };
  ui.mountCard = function (slotId, card) {
    var slot = $(slotId);
    slot.innerHTML = '';
    slot.appendChild(card.el);
  };

  // ------------------------------------------------------------- Main-game board
  // Fill the 3x2 grid. Order = the order of the array (left to right, top to bottom).
  ui.mountCards = function (slotId, cards) {
    var slot = $(slotId);
    slot.innerHTML = '';
    cards.forEach(function (c, i) {
      c.el.style.setProperty('--i', i);            // CSS delays each card a little, so they pop in one by one
      c.el.classList.add('card--enter');
      slot.appendChild(c.el);
    });
  };

  // The scoreboard bar. game.js calls this every frame, so each value is only written
  // to the page when it changed. (Writing to the DOM 60 times a second is wasted work.)
  // s: { remainingSec, totalSec, still, total, avg }
  var hudLast = {};
  ui.updateHud = function (s) {
    // ceil so the clock shows 0:01 until time has truly run out (never "0:00" early).
    // The 1e-6 forgives tiny floating-point crumbs from adding up many small frame steps.
    var secs = Math.max(0, Math.ceil(s.remainingSec - 1e-6));
    if (secs !== hudLast.secs) {
      hudLast.secs = secs;
      $('hud-time').textContent = Math.floor(secs / 60) + ':' + (secs % 60 < 10 ? '0' : '') + (secs % 60);
      // Urgency is shown by color AND by the pulsing, and the number itself keeps counting.
      $('hud-clock').classList.toggle('hud__timer--urgent', secs <= C.TIMER_URGENT_SEC && secs > 0);
    }

    var pct = Math.round(1000 * (1 - s.remainingSec / s.totalSec)) / 10;
    if (pct !== hudLast.pct) {
      hudLast.pct = pct;
      $('hud-timebar').style.width = Math.min(100, Math.max(0, pct)) + '%';
    }

    var still = s.still + ' / ' + s.total;
    if (still !== hudLast.still) { hudLast.still = still; $('hud-still').textContent = still; }

    var avg = String(Math.round(s.avg));
    if (avg !== hudLast.avg) { hudLast.avg = avg; $('hud-avg').textContent = avg; }
  };

  // ------------------------------------------------------------ Attention color
  // Green when high, yellow in the middle, red when low. Hue 0 = red, 60 = yellow,
  // 120 = green, so one number gives the whole ramp. Color is only a bonus: the bar
  // length and the number show the same thing, so colorblind players lose nothing.
  function attentionColor(a) {
    var t = Math.max(0, Math.min(1, a / C.ATTENTION_MAX));
    return 'hsl(' + Math.round(t * 120) + ', 78%, 42%)';
  }

  // What the status chip says. In the 6-card game, an idle VP with low attention says so,
  // because the player is juggling six cards and needs to spot who is about to leave.
  // It's text, not just a red outline, so it doesn't depend on seeing color.
  function statusText(vp, low) {
    if (vp.state === 'afk') return 'Gone';
    if (vp.state === 'watching') return 'Watching…';
    return low ? 'Needs a post!' : 'Waiting for a post';
  }

  // -------------------------------------------------------------- Profile card
  // One VP's card. Same DOM for the big tutorial card and the six small ones in the
  // main game; only the CSS size class differs.
  //
  // opts: size ('large' | 'compact'), showHistory (bool), goalMarker (number | null),
  //       onPush(topicId)  — called when a topic button is clicked
  ui.createCard = function (vp, opts) {
    opts = opts || {};
    var compact = opts.size === 'compact';
    var locked = false;          // game.js sets this while a pop-up is showing
    var bubbleTimer = null;
    var last = {};               // last values written, so we only touch the DOM when something changed

    var root = h('article', 'card card--' + (opts.size || 'large'));

    // Header: avatar, name + bio, status pill
    var head = h('header', 'card__head');
    head.appendChild(h('div', 'card__avatar', vp.avatar));
    var who = h('div', 'card__who');
    who.appendChild(h('h3', 'card__name', vp.name));
    who.appendChild(h('p', 'card__bio', vp.bio));
    head.appendChild(who);
    var status = h('div', 'card__status', statusText(vp, false));
    // Compact cards are short, so the chip sits in the meter row (added below) instead.
    if (!compact) head.appendChild(status);
    root.appendChild(head);

    // Speech bubble. Its space is always reserved, so the card doesn't jump around
    // when a message appears or fades. Only the big tutorial card announces messages
    // to screen readers: six cards all announcing at once would be noise.
    var bubble = h('div', 'bubble bubble--empty');
    if (!compact) bubble.setAttribute('aria-live', 'polite');
    root.appendChild(bubble);

    // Attention meter
    var meter = h('div', 'meter');
    var label = h('div', 'meter__label');
    label.appendChild(h('span', null, 'Attention'));
    var value = h('strong', 'meter__value', String(Math.round(vp.attention)));
    label.appendChild(value);
    if (compact) label.appendChild(status);
    meter.appendChild(label);
    var bar = h('div', 'meter__bar');
    var track = h('div', 'meter__track');
    var fill = h('div', 'meter__fill');
    track.appendChild(fill);
    bar.appendChild(track);
    var goal = h('div', 'meter__goal');
    goal.appendChild(h('span', null, 'Goal'));
    bar.appendChild(goal);
    meter.appendChild(bar);
    var watch = h('div', 'watch');
    var watchFill = h('div', 'watch__fill');
    watch.appendChild(watchFill);
    meter.appendChild(watch);
    root.appendChild(meter);

    // Recent reactions (tutorial card only). Emoji + thumb, so it doesn't rely on color.
    var history = null;
    if (opts.showHistory) {
      history = h('div', 'history');
      history.appendChild(h('span', 'history__title', 'You showed:'));
      root.appendChild(history);
    }

    // Topic buttons: emoji + word, so color is never the only clue.
    var buttonsBox = h('div', 'topics');
    var buttons = [];
    DS.TOPICS.forEach(function (t) {
      var b = h('button', 'topic-btn');
      b.type = 'button';
      b.style.setProperty('--topic-color', t.color);
      b.setAttribute('aria-label', 'Show ' + t.label + ' to ' + vp.name);
      b.appendChild(h('span', 'topic-btn__emoji', t.emoji));
      b.appendChild(h('span', 'topic-btn__label', t.label));
      b.addEventListener('click', function () {
        if (locked || !opts.onPush) return;
        opts.onPush(t.id);
        update(); // don't wait for the next frame: the buttons should lock right away
      });
      buttons.push(b);
      buttonsBox.appendChild(b);
    });
    root.appendChild(buttonsBox);

    // "AFK" cover, shown over the whole card once the VP has left.
    var afk = h('div', 'card__afk');
    afk.appendChild(h('div', 'card__afk-label', 'AFK — closed the app'));
    root.appendChild(afk);

    // ---- helpers -----------------------------------------------------------
    function flash(cls) {
      // Remove, force a reflow, add: this restarts the CSS animation even if it's already running.
      root.classList.remove(cls);
      void root.offsetWidth;
      root.classList.add(cls);
    }

    function say(text, category) {
      clearTimeout(bubbleTimer);
      bubble.textContent = text;
      bubble.className = 'bubble bubble--' + category;
      void bubble.offsetWidth;               // restart the pop-in animation
      bubble.classList.add('bubble--pop');
      // An AFK message stays: it's the last thing this VP will ever say.
      if (category !== 'afk') {
        bubbleTimer = setTimeout(function () {
          bubble.classList.add('bubble--fading');
        }, C.BUBBLE_VISIBLE_SEC * 1000);
      }
    }

    // A little "+17" / "−12" that floats up beside the attention number. A liked post's gain
    // arrives slowly over the watch, so this tells the player what that post is worth; a skip's
    // penalty lands at once. The sign is part of the text, so it isn't color-only.
    var deltaTimers = [];
    function showDelta(amount) {
      if (!amount) return;
      var pill = h('span', 'delta ' + (amount > 0 ? 'delta--up' : 'delta--down'),
                   (amount > 0 ? '+' : '−') + Math.abs(amount));
      pill.setAttribute('aria-hidden', 'true');
      pill.style.left = (value.offsetLeft + value.offsetWidth + 10) + 'px';
      label.appendChild(pill);
      // Remove it ourselves (not on animationend) so it also goes away when animations are off.
      deltaTimers.push(setTimeout(function () { if (pill.parentNode) pill.parentNode.removeChild(pill); }, 1100));
    }

    function addHistory(topicId, liked) {
      var t = DS.TOPIC_BY_ID[topicId];
      var chip = h('span', 'history__chip history__chip--' + (liked ? 'yes' : 'no'),
                   t.emoji + (liked ? '👍' : '👎'));
      chip.setAttribute('aria-label', t.label + ', ' + (liked ? 'liked' : 'skipped'));
      history.appendChild(chip);
      // Keep only the newest few (+1 because the title span is also a child).
      while (history.children.length > C.HISTORY_STRIP_MAX + 1) history.removeChild(history.children[1]);
    }

    // The model tells us what happened; we only decide how it looks.
    function onVPEvent(e) {
      if (e.event === 'push') {
        say(e.message, e.category);
        flash(e.liked ? 'card--like' : 'card--skip');
        if (history) addHistory(e.topic, e.liked);
        showDelta(e.liked
          ? Math.min(Math.round(C.LIKE_GAIN * e.fatigueMult), Math.round(C.ATTENTION_MAX - e.attentionBefore))
          : Math.round(e.attentionAfter - e.attentionBefore));
      } else if (e.event === 'message') {
        say(e.message, e.category);          // a low-attention nudge while idle
      } else if (e.event === 'afk') {
        // A skip that ends in AFK already showed this exact line via the 'push' event.
        if (bubble.textContent !== e.message) say(e.message, 'afk');
      }
    }
    vp.onEvent(onVPEvent);

    // ---- per-frame refresh ---------------------------------------------------
    // Cheap on purpose: game.js calls this ~60 times a second for every card.
    function update() {
      var a = vp.attention;
      if (a !== last.attention) {
        last.attention = a;
        fill.style.width = (100 * a / C.ATTENTION_MAX) + '%';
        fill.style.background = attentionColor(a);
        value.textContent = String(Math.round(a));
      }

      // "Low" only matters in the 6-card game, where the player has to choose who to help.
      var low = compact && vp.state !== 'afk' && a < C.LOW_ATTENTION_THRESHOLD;
      if (vp.state !== last.state || low !== last.low) {
        last.state = vp.state;
        last.low = low;
        status.textContent = statusText(vp, low);
        root.classList.toggle('card--watching', vp.state === 'watching');
        root.classList.toggle('card--gone', vp.state === 'afk');
        root.classList.toggle('card--low', low);
      }

      var p = vp.watchProgress();
      if (p !== last.progress) {
        last.progress = p;
        watchFill.style.width = (100 * p) + '%';
        watch.classList.toggle('watch--on', vp.state === 'watching');
      }

      // The model is the single source of truth for whether a push is allowed.
      // (It also covers LIKED_LOCKS_BUTTONS, so the flag works without any UI code.)
      var disabled = locked || !vp.canPush();
      if (disabled !== last.disabled) {
        last.disabled = disabled;
        buttons.forEach(function (b) { b.disabled = disabled; });
      }
    }

    function setGoalMarker(v) {
      goal.hidden = (v === null || v === undefined);
      if (!goal.hidden) goal.style.left = (100 * v / C.ATTENTION_MAX) + '%';
    }
    setGoalMarker(opts.goalMarker);
    update();

    return {
      el: root,
      vp: vp,
      update: update,
      setGoalMarker: setGoalMarker,
      setLocked: function (v) { locked = v; update(); },
      destroy: function () {
        clearTimeout(bubbleTimer);
        deltaTimers.forEach(clearTimeout);
        vp.offEvent(onVPEvent);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  };

  DS.ui = ui;
})();
