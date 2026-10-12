/*
 * guess.js — "Guess the profile", the bonus puzzle on the last results step. The player is the
 * recommender again, but this time they BUILD the profile: a random person is picked, and the player
 * shares GUESS_POINTS points across the six topics on a radar by dragging each point out or in. Simulate
 * shows that person a feed with one post per point. They watch the posts of a topic up to how much they
 * really want it and skip the rest. The player reads the watches and skips, moves points, and tries
 * again until the radar matches the person exactly.
 *
 * Why it fits the lesson: this is how a recommender learns a profile, from watches and skips. A skip says
 * "too much of this". A topic that was never shown teaches nothing, so the player has to explore. And the
 * perfect radar is never one spike: every person's ideal feed mixes several topics.
 *
 * Two halves, like reveal.js:
 *   DS.guessModel  pure (no DOM): the hidden profile, the simulation and the wording. Unit-tested in Node.
 *   DS.guess       the screen: the draggable radar and the results panel.
 *
 * The points cap (GUESS_POINTS) is what makes it a puzzle: without it, the player would drag every topic
 * to the top and learn nothing.
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var C = DS.CONFIG;

  // ================================================================== Model (pure)
  var model = {};

  // A random person's hidden profile: how many of the GUESS_POINTS posts they'd want of each topic.
  // Built from the same favorites / meh lists as the game, so their bio is a fair first clue:
  //   favorites start at 4 (3 each when there are two), "meh" topics at 1, the rest at 0.
  // The points left over go one at a time to a favorite (twice as likely) or a meh topic, with two rules:
  // nothing goes over GUESS_MAX_PER_TOPIC, and a meh topic always stays below every favorite, so the
  // favorites the bio hints at really are the biggest spikes.
  model.makeTarget = function (def) {
    var points = {};
    DS.TOPIC_IDS.forEach(function (id) { points[id] = 0; });
    var favBase = def.favorites.length === 1 ? 4 : 3;
    def.favorites.forEach(function (id) { points[id] = favBase; });
    def.meh.forEach(function (id) { points[id] = 1; });

    var left = C.GUESS_POINTS - sum(points);
    while (left > 0) {
      var minFav = Math.min.apply(null, def.favorites.map(function (id) { return points[id]; }));
      var pool = [];
      def.favorites.forEach(function (id) { if (points[id] < C.GUESS_MAX_PER_TOPIC) pool.push(id, id); });
      def.meh.forEach(function (id) { if (points[id] < Math.min(C.GUESS_MAX_PER_TOPIC, minFav - 1)) pool.push(id); });
      if (!pool.length) break;              // can't happen with the content we ship; never loop forever
      points[pool[Math.floor(DS.rng.random() * pool.length)]]++;
      left--;
    }
    return points;
  };

  function sum(points) {
    return DS.TOPIC_IDS.reduce(function (s, id) { return s + (points[id] || 0); }, 0);
  }
  model.sum = sum;
  model.pointsLeft = function (guess) { return C.GUESS_POINTS - sum(guess); };

  // Can this topic take one more point? (The budget and the per-topic cap.)
  model.canAdd = function (guess, id) {
    return guess[id] < C.GUESS_MAX_PER_TOPIC && model.pointsLeft(guess) > 0;
  };

  // Show the person the feed this radar asks for: one post per point. For each topic they watch up to the
  // number they want and skip the rest. Deterministic on purpose: the puzzle is about reading the signal,
  // not about the dice, so the same radar always gets the same answer.
  //   score    watched posts as a share of GUESS_POINTS, 0..100 (unused points count as nothing watched)
  //   perfect  the radar is exactly the person's profile
  model.simulate = function (guess, target) {
    var topics = DS.TOPIC_IDS.map(function (id) {
      var shown = guess[id] || 0;
      var watched = Math.min(shown, target[id]);
      return { id: id, shown: shown, watched: watched, skipped: shown - watched };
    });
    var watched = topics.reduce(function (s, t) { return s + t.watched; }, 0);
    var skipped = topics.reduce(function (s, t) { return s + t.skipped; }, 0);
    return {
      topics: topics,
      shown: watched + skipped,
      watched: watched,
      skipped: skipped,
      score: Math.round(100 * watched / C.GUESS_POINTS),
      perfect: DS.TOPIC_IDS.every(function (id) { return (guess[id] || 0) === target[id]; })
    };
  };

  // The feed as the person saw it: posts interleaved across topics (Sports, Dance, Sports, ...) so it reads
  // like a real feed, each marked watched or skipped. A topic's watched posts come before its skipped ones:
  // a person gets tired of a topic after they've had enough of it.
  model.feed = function (result) {
    var queues = result.topics.map(function (t) {
      var q = [];
      for (var i = 0; i < t.shown; i++) q.push({ id: t.id, watched: i < t.watched });
      return q;
    });
    var out = [], more = true;
    while (more) {
      more = false;
      queues.forEach(function (q) { if (q.length) { out.push(q.shift()); more = true; } });
    }
    return out;
  };

  // ---- Wording. Short sentences, "they", never he/she (tested like the results wording).
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  model.text = {
    intro: function (name) {
      return 'Build ' + name + '\'s profile. Share ' + C.GUESS_POINTS + ' points across the topics, then press Simulate.';
    },
    pointsLeft: function (left) {
      return left === 0 ? 'All ' + C.GUESS_POINTS + ' points placed' : plural(left, 'point', 'points') + ' left';
    },
    noPointsLeft: 'No points left. Take one from another topic first.',
    // One line per topic that was shown.
    topicLine: function (t) {
      var label = DS.TOPIC_BY_ID[t.id].label;
      if (!t.shown) return label + ': not shown, so no clue.';
      if (!t.skipped) return label + ': watched all ' + t.shown + '.';
      if (!t.watched) return label + ': skipped all ' + t.shown + '.';
      return label + ': watched ' + t.watched + ', skipped ' + t.skipped + '.';
    },
    summary: function (name, r) {
      if (r.perfect) return 'Perfect! ' + name + ' watched every post.';
      if (!r.shown) return 'Drag some points out first.';
      return name + ' watched ' + r.watched + ' of your ' + plural(r.shown, 'post', 'posts') + '.';
    },
    // The nudge says what the signal means, never where the answer is.
    hint: function (r) {
      if (r.perfect) return '';
      if (r.skipped > 0) return 'A skip means too much of that topic. Move those points somewhere else.';
      if (r.shown < C.GUESS_POINTS) return 'Every post was watched. Place your other points too.';
      return '';
    },
    win: function (name, tries, mixed) {
      return 'You built ' + name + '\'s profile in ' + plural(tries, 'try', 'tries') + '. ' +
             'Their perfect feed mixes ' + mixed + ' topics. Real apps learn profiles like this from every watch and skip.';
    },
    answer: function (name) { return 'The dashed shape is ' + name + '\'s real profile.'; }
  };

  DS.guessModel = model;

  // ================================================================== Screen
  // Everything below touches the page, so it only runs when the guess screen opens (the tests load this
  // file without a page).
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var UNIT = 20;                 // viewBox units per point; 5 points reach 100

  var guess = {};
  var ui = null;
  var st = null;                 // { def, target, values, tries, scores, done, handlers, els }

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // Same axis directions as every other radar in the game (DS.radar), so Sports is always upper left.
  function dir(i) { return DS.radar.direction(i, DS.TOPIC_IDS.length); }
  function at(i, v) { var d = dir(i); return { x: d.x * UNIT * v, y: d.y * UNIT * v }; }
  function pts(values) {
    return values.map(function (v, i) { var p = at(i, v); return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  }

  // A different person from the last one, so "New person" always means a new puzzle.
  function pickPerson() {
    var pool = DS.VP_DEFS.filter(function (d) { return !st || d.id !== st.def.id; });
    return pool[Math.floor(DS.rng.random() * pool.length)];
  }

  // ---- The radar the player drags
  function buildEditor() {
    var h = ui.h;
    var box = h('div', 'panel guess__editor');
    var svg = svgEl('svg', { viewBox: '-182 -128 364 256', 'class': 'guess__svg' });
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Profile radar. Each topic is a slider from 0 to ' + C.GUESS_MAX_PER_TOPIC + '.');

    var n = DS.TOPIC_IDS.length, ring;
    for (ring = 1; ring <= C.GUESS_MAX_PER_TOPIC; ring++) {
      var r = [];
      for (var k = 0; k < n; k++) r.push(ring);
      svg.appendChild(svgEl('polygon', { points: pts(r), 'class': 'guess__ring' + (ring === C.GUESS_MAX_PER_TOPIC ? ' guess__ring--outer' : '') }));
    }
    DS.TOPIC_IDS.forEach(function (id, i) {
      var end = at(i, C.GUESS_MAX_PER_TOPIC);
      svg.appendChild(svgEl('line', { x1: 0, y1: 0, x2: end.x.toFixed(1), y2: end.y.toFixed(1), 'class': 'guess__spoke' }));
    });
    var answer = svgEl('polygon', { 'class': 'guess__answer' });
    answer.style.display = 'none';
    var shape = svgEl('polygon', { 'class': 'guess__shape' });
    svg.appendChild(shape);
    svg.appendChild(answer);

    var handles = [], valueTexts = [];
    DS.TOPICS.forEach(function (t, i) {
      // The label (and the points under it) sits just outside the outer ring: above the top corners, below
      // the bottom ones, beside the side ones, so no label ever covers the radar.
      var d = dir(i), tip = at(i, C.GUESS_MAX_PER_TOPIC);
      var side = Math.abs(d.y) < 0.3;
      var anchor = !side ? 'middle' : d.x > 0 ? 'start' : 'end';
      var lx = side ? tip.x + (d.x > 0 ? 14 : -14) : tip.x;
      var ly = side ? -2 : d.y < 0 ? tip.y - 26 : tip.y + 22;
      var label = svgEl('text', { x: lx.toFixed(1), y: ly.toFixed(1), 'text-anchor': anchor, 'class': 'guess__label' });
      label.textContent = t.emoji + ' ' + t.label;
      var value = svgEl('text', { x: lx.toFixed(1), y: (ly + 16).toFixed(1), 'text-anchor': anchor, 'class': 'guess__value' });
      svg.appendChild(label);
      svg.appendChild(value);
      valueTexts.push(value);

      // The handle is the keyboard's way in: a slider per topic (arrow keys move it one point).
      var handle = svgEl('circle', { r: 9, 'class': 'guess__handle', tabindex: '0', role: 'slider' });
      handle.style.stroke = t.color;
      handle.setAttribute('aria-label', t.label + ' points');
      handle.setAttribute('aria-valuemin', '0');
      handle.setAttribute('aria-valuemax', String(C.GUESS_MAX_PER_TOPIC));
      handle.addEventListener('keydown', function (e) {
        var step = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        e.stopPropagation();
        setValue(i, st.values[t.id] + step);
      });
      svg.appendChild(handle);
      handles.push(handle);
    });

    // Dragging. A press anywhere on the radar picks the topic whose spoke points closest to the pointer,
    // so a topic at 0 (all six dots would sit in the middle) can still be grabbed: press toward it and drag
    // out. The value is how far along that spoke the pointer is, in whole points.
    var dragging = null;
    function toSvg(e) {
      var p = svg.createSVGPoint();
      p.x = e.clientX; p.y = e.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    }
    function nearestAxis(p) {
      var best = 0, bestDot = -Infinity;
      for (var i = 0; i < n; i++) { var d = dir(i), dot = d.x * p.x + d.y * p.y; if (dot > bestDot) { bestDot = dot; best = i; } }
      return best;
    }
    function dragTo(i, p) {
      var d = dir(i);
      setValue(i, Math.round((d.x * p.x + d.y * p.y) / UNIT));
    }
    svg.addEventListener('pointerdown', function (e) {
      if (st.done || ui.guardActive()) return;
      var p = toSvg(e);
      dragging = nearestAxis(p);
      svg.setPointerCapture(e.pointerId);
      handles[dragging].focus({ preventScroll: true });
      dragTo(dragging, p);
      e.preventDefault();
    });
    svg.addEventListener('pointermove', function (e) { if (dragging !== null) dragTo(dragging, toSvg(e)); });
    // Let go of the pointer explicitly, so the next click lands on whatever is under it (e.g. Simulate).
    function stop(e) {
      dragging = null;
      if (e && svg.hasPointerCapture && svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    }
    svg.addEventListener('pointerup', stop);
    svg.addEventListener('pointercancel', stop);
    svg.addEventListener('lostpointercapture', function () { dragging = null; });

    box.appendChild(svg);

    var bar = h('div', 'guess__bar');
    var left = h('p', 'guess__left');
    left.setAttribute('aria-live', 'polite');
    var reset = h('button', 'btn btn--ghost', 'Reset');
    reset.type = 'button';
    reset.addEventListener('click', ui.guarded(function () {
      if (st.done) return;
      DS.TOPIC_IDS.forEach(function (id) { st.values[id] = 0; });
      redraw();
    }));
    var sim = h('button', 'btn btn--primary', '▶ Simulate');
    sim.type = 'button';
    sim.addEventListener('click', ui.guarded(simulate));
    bar.appendChild(left);
    bar.appendChild(reset);
    bar.appendChild(sim);
    box.appendChild(bar);

    st.els.svg = svg; st.els.shape = shape; st.els.answer = answer; st.els.handles = handles;
    st.els.valueTexts = valueTexts; st.els.left = left; st.els.sim = sim; st.els.reset = reset;
    return box;
  }

  // Set one topic, within the cap and the budget. Asking for more than the budget allows gives as much as
  // is left and says why, so the cap is felt rather than silently ignored.
  function setValue(i, v) {
    if (st.done) return;
    var id = DS.TOPIC_IDS[i];
    var room = st.values[id] + model.pointsLeft(st.values);
    var want = Math.max(0, Math.min(C.GUESS_MAX_PER_TOPIC, v));
    var next = Math.min(want, room);
    if (want > room) flashBudget();
    if (next === st.values[id]) return;
    st.values[id] = next;
    redraw();
  }

  function flashBudget() {
    var left = st.els.left;
    left.textContent = model.text.noPointsLeft;
    left.classList.remove('guess__left--flash');
    void left.offsetWidth;
    left.classList.add('guess__left--flash');
    clearTimeout(st.flashTimer);
    st.flashTimer = setTimeout(function () { if (st) redrawLeft(); }, 1800);
  }

  function redrawLeft() {
    var left = model.pointsLeft(st.values);
    st.els.left.textContent = model.text.pointsLeft(left);
    st.els.left.classList.toggle('guess__left--done', left === 0);
    st.els.left.classList.remove('guess__left--flash');
  }

  function redraw() {
    var values = DS.TOPIC_IDS.map(function (id) { return st.values[id]; });
    st.els.shape.setAttribute('points', pts(values));
    DS.TOPIC_IDS.forEach(function (id, i) {
      // A topic at 0 keeps a small dashed dot a little way out along its spoke, so the six stay apart,
      // visible and grabbable instead of piling up in the middle.
      var v = st.values[id];
      var p = at(i, v || 0.7);
      var hd = st.els.handles[i];
      hd.setAttribute('r', v ? 9 : 6);
      hd.setAttribute('cx', p.x.toFixed(1));
      hd.setAttribute('cy', p.y.toFixed(1));
      hd.classList.toggle('guess__handle--zero', !v);
      hd.setAttribute('aria-valuenow', String(v));
      st.els.valueTexts[i].textContent = v + (v === 1 ? ' point' : ' points');
    });
    redrawLeft();
    st.els.sim.disabled = st.done || model.sum(st.values) === 0;
  }

  // ---- Simulate and show what happened
  function simulate() {
    if (st.done || model.sum(st.values) === 0) return;
    var r = model.simulate(st.values, st.target);
    st.tries++;
    st.scores.push(r.score);
    if (r.perfect) st.done = true;
    renderResult(r);
    redraw();
  }

  function renderResult(r) {
    var h = ui.h, name = st.def.name, box = st.els.result;
    box.innerHTML = '';

    var head = h('div', 'guess__score');
    head.appendChild(h('span', 'guess__try', 'Try ' + st.tries));
    head.appendChild(h('strong', 'guess__pct', r.score + '%'));
    head.appendChild(h('span', 'guess__pct-label', 'watched'));
    box.appendChild(head);
    var meter = h('div', 'guess__meter');
    var fill = h('div', 'guess__meter-fill');
    fill.style.width = r.score + '%';
    meter.appendChild(fill);
    box.appendChild(meter);

    // The feed, post by post: emoji plus a word, never color alone.
    var feed = h('ol', 'guess__feed');
    feed.setAttribute('aria-label', 'The feed you built');
    model.feed(r).forEach(function (post, i) {
      var li = h('li', 'guess__post ' + (post.watched ? 'guess__post--watched' : 'guess__post--skipped'));
      li.style.setProperty('--i', i);
      li.appendChild(h('span', 'guess__post-emoji', DS.TOPIC_BY_ID[post.id].emoji));
      li.appendChild(h('span', 'guess__post-mark', post.watched ? '✓' : '✗'));
      li.title = DS.TOPIC_BY_ID[post.id].label + (post.watched ? ': watched' : ': skipped');
      feed.appendChild(li);
    });
    box.appendChild(feed);

    box.appendChild(h('p', 'guess__summary', model.text.summary(name, r)));
    var list = h('ul', 'guess__topics');
    r.topics.forEach(function (t) {
      var li = h('li', 'guess__topic' + (t.skipped ? ' guess__topic--skips' : !t.shown ? ' guess__topic--none' : ''));
      li.appendChild(h('span', 'guess__topic-emoji', DS.TOPIC_BY_ID[t.id].emoji));
      li.appendChild(h('span', null, model.text.topicLine(t)));
      list.appendChild(li);
    });
    box.appendChild(list);

    var hint = model.text.hint(r);
    if (hint) box.appendChild(h('p', 'guess__hint', hint));
    if (r.perfect) {
      var mixed = DS.TOPIC_IDS.filter(function (id) { return st.target[id] > 0; }).length;
      box.appendChild(h('p', 'guess__win', model.text.win(name, st.tries, mixed)));
    }
    if (st.scores.length > 1) box.appendChild(h('p', 'guess__history', 'Your tries: ' + st.scores.map(function (s) { return s + '%'; }).join(' → ')));

    // After a few tries, offer the answer, so a stuck student (or a class watching the clock) can finish.
    if (!r.perfect && st.tries >= C.GUESS_ANSWER_AFTER) {
      var show = h('button', 'link-btn guess__show', 'Show me the answer');
      show.type = 'button';
      show.addEventListener('click', ui.guarded(showAnswer));
      box.appendChild(show);
    }
    updateFooter();
  }

  function showAnswer() {
    st.done = true;
    var a = st.els.answer;
    a.setAttribute('points', pts(DS.TOPIC_IDS.map(function (id) { return st.target[id]; })));
    a.style.display = '';
    var p = ui.h('p', 'guess__hint', model.text.answer(st.def.name));
    var old = st.els.result.querySelector('.guess__show');
    if (old) old.parentNode.replaceChild(p, old);
    redraw();
    updateFooter();
  }

  // "New person" is the main button once the puzzle is over.
  function updateFooter() {
    st.els.next.className = 'btn ' + (st.done ? 'btn--primary' : 'btn--ghost');
  }

  // ---- The screen
  function render() {
    var h = ui.h, screen = ui.$('screen-guess');
    screen.innerHTML = '';
    st.els = {};
    var wrap = h('div', 'guess');

    var head = h('header', 'panel guess__head');
    head.appendChild(h('div', 'who__avatar', st.def.avatar));
    var who = h('div', 'guess__who');
    who.appendChild(h('h2', 'guess__name', 'Guess ' + st.def.name + '\'s profile'));
    who.appendChild(h('p', 'guess__bio', st.def.bio + ' · ' + model.text.intro(st.def.name)));
    head.appendChild(who);
    wrap.appendChild(head);

    var body = h('div', 'guess__body');
    body.appendChild(buildEditor());
    var result = h('section', 'panel guess__result');
    result.setAttribute('aria-live', 'polite');
    result.appendChild(h('h3', 'panel__title', 'How it works'));
    var how = h('ul', 'guess__how');
    ['Each point is one post of that topic in ' + st.def.name + '\'s feed.',
     'Drag a dot out for more posts, in for fewer.',
     'Simulate shows which posts ' + st.def.name + ' watched and skipped.',
     'Keep moving points until every post gets watched.'].forEach(function (line) { how.appendChild(h('li', null, line)); });
    result.appendChild(how);
    st.els.result = result;
    body.appendChild(result);
    wrap.appendChild(body);

    var foot = h('footer', 'guess__foot');
    var back = h('button', 'btn btn--ghost', '← Back to results');
    back.type = 'button';
    back.addEventListener('click', ui.guarded(function () { st.handlers.onBack(); }));
    var next = h('button', 'btn btn--ghost', '🔀 New person');
    next.type = 'button';
    next.addEventListener('click', ui.guarded(function () { start(); }));
    st.els.next = next;
    foot.appendChild(back);
    foot.appendChild(next);
    wrap.appendChild(foot);

    screen.appendChild(wrap);
    redraw();
  }

  // A fresh puzzle: a new person, an empty radar. `handlers` carries over from the last puzzle if not given.
  function start(handlers) {
    var def = pickPerson();
    if (st) clearTimeout(st.flashTimer);
    st = { def: def, target: model.makeTarget(def), values: {}, tries: 0, scores: [], done: false,
           handlers: handlers || st.handlers, els: {}, flashTimer: null };
    DS.TOPIC_IDS.forEach(function (id) { st.values[id] = 0; });
    render();
    ui.armGuard();
  }

  // handlers: { onBack() }
  guess.show = function (handlers) {
    ui = DS.ui;
    ui.showScreen('guess');
    start(handlers);
  };

  DS.guess = guess;
})();
