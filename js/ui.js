/*
 * ui.js — everything that touches the page: screens, the pop-up, and the profile card.
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

  // ------------------------------------------------------------------ Screens
  ui.showScreen = function (name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('screen--active');
    $('screen-' + name).classList.add('screen--active');
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
      btn.addEventListener('click', function () { ui.hideOverlay(); if (b.onClick) b.onClick(); });
      box.appendChild(btn);
    });
    $('overlay').hidden = false;
    // Keyboard users: put focus on the main button so Enter/Space continues.
    var first = box.querySelector('button');
    if (first) first.focus();
  };
  ui.hideOverlay = function () { $('overlay').hidden = true; };

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

  // ------------------------------------------------------------ Attention color
  // Green when high, yellow in the middle, red when low. Hue 0 = red, 60 = yellow,
  // 120 = green, so one number gives the whole ramp. Color is only a bonus: the bar
  // length and the number show the same thing, so colorblind players lose nothing.
  function attentionColor(a) {
    var t = Math.max(0, Math.min(1, a / C.ATTENTION_MAX));
    return 'hsl(' + Math.round(t * 120) + ', 78%, 42%)';
  }

  var STATUS_TEXT = { idle: 'Waiting for a post', watching: 'Watching…', afk: 'Gone' };

  // -------------------------------------------------------------- Profile card
  // One VP's card. Same DOM for the big tutorial card and (Phase 4) the six small ones;
  // only the CSS size class differs.
  //
  // opts: size ('large' | 'compact'), showHistory (bool), goalMarker (number | null),
  //       onPush(topicId)  — called when a topic button is clicked
  ui.createCard = function (vp, opts) {
    opts = opts || {};
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
    var status = h('div', 'card__status', STATUS_TEXT.idle);
    head.appendChild(status);
    root.appendChild(head);

    // Speech bubble. Its space is always reserved, so the card doesn't jump around
    // when a message appears or fades.
    var bubble = h('div', 'bubble bubble--empty');
    bubble.setAttribute('aria-live', 'polite');
    root.appendChild(bubble);

    // Attention meter
    var meter = h('div', 'meter');
    var label = h('div', 'meter__label');
    label.appendChild(h('span', null, 'Attention'));
    var value = h('strong', 'meter__value', String(Math.round(vp.attention)));
    label.appendChild(value);
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

      if (vp.state !== last.state) {
        last.state = vp.state;
        status.textContent = STATUS_TEXT[vp.state];
        root.classList.toggle('card--watching', vp.state === 'watching');
        root.classList.toggle('card--gone', vp.state === 'afk');
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
        vp.offEvent(onVPEvent);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  };

  DS.ui = ui;
})();
