/*
 * reveal.js — the results screen: the part of the game that teaches the lesson.
 *
 * It walks the player through 8 steps, one at a time:
 *
 *   1. Score         "the win": still scrolling + average attention. (They did well!)
 *   2-7. One per VP  what you showed them, how their tastes changed, how their variety changed.
 *   8. Big picture   the average story, a verdict, the question, and 3 discussion prompts.
 *
 * Two layers in this file:
 *   DS.revealText   PURE functions that turn numbers into sentences. No DOM, so tests.html can
 *                   check them. This is where the screen's honesty lives: every sentence has a
 *                   branch for "it didn't happen" (variety didn't drop, nobody left, no data).
 *   DS.reveal       draws the screen with those sentences. Numbers come from
 *                   DS.metrics.buildReveal() and are never recomputed here.
 *
 * Wording note: the six people are given animal avatars on purpose, so no sentence uses he/she.
 * They are "they", or just their name.
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var C = DS.CONFIG;

  // ================================================================== The words
  function two(x) { return x.toFixed(2); }
  function mmss(sec) {
    var s = Math.max(0, Math.round(sec));
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function topicLabel(id) { return DS.TOPIC_BY_ID[id].label; }
  // ['Sports'] -> "Sports", two -> "Sports and Music", more -> "Sports, Music and Food"
  function joinLabels(ids) {
    var names = ids.map(topicLabel);
    return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  var text = {
    // ---- Step 1: the win
    winTitle: function (still, total) {
      if (still === total) return 'Perfect. Nobody left!';
      if (still >= Math.ceil(total * 2 / 3)) return 'Nice work. Most people stayed.';
      if (still >= 1) return 'Some people left. Some stayed.';
      return 'Everyone left.';
    },
    winTease: function (still) {
      return still > 0
        ? 'You kept people scrolling. Now let\'s look at what you actually showed them.'
        : 'Everyone closed the app. Let\'s look at what you showed them anyway.';
    },

    // ---- Steps 2-7: one person
    statusLine: function (p) {
      return p.gone
        ? 'Left the app after ' + mmss(p.afkAt === null ? 0 : p.afkAt) + '.'
        : 'Still scrolling (attention ' + Math.round(p.finalAttention) + ').';
    },

    // "You showed Maya 14 posts. 12 were Sports."  (counts every post shown, watched or skipped)
    // Ties are said as ties: naming one winner would be a made-up fact.
    feedLine: function (p) {
      if (p.total === 0) return 'You didn\'t show ' + p.name + ' anything.';
      if (p.total === 1) return 'You showed ' + p.name + ' 1 post. It was ' + topicLabel(p.topTopic) + '.';
      var head = 'You showed ' + p.name + ' ' + p.total + ' posts. ';
      if (p.topTopics.length === 1) {
        var count = p.topCount === p.total ? 'All ' + p.total : String(p.topCount);
        return head + count + ' were ' + topicLabel(p.topTopics[0]) + '.';
      }
      if (p.topCount === 1) return head + 'No topic was shown more than once.';
      return head + joinLabels(p.topTopics) + ' were each shown ' + p.topCount + ' times.';
    },
    feedLegend: function (p) {
      return 'Bright = they watched it (' + p.likedCount + '). Faded = they skipped it (' + (p.total - p.likedCount) + ').';
    },

    // The headline number. It only says "dropped" if variety really dropped.
    varietyLine: function (v) {
      if (v.trend === 'dropped') return 'Variety dropped from ' + two(v.first) + ' → ' + two(v.second) + '.';
      if (v.trend === 'low')     return 'Variety stayed low: ' + two(v.first) + ' → ' + two(v.second) + '.';
      if (v.trend === 'rose')    return 'Variety went up from ' + two(v.first) + ' → ' + two(v.second) + '.';
      if (v.trend === 'steady')  return 'Variety stayed about the same: ' + two(v.first) + ' → ' + two(v.second) + '.';
      // unknown: say which half was too thin, instead of inventing a number
      // (Kept short on purpose: a 2-line sentence here pushes the screen past a 600px-tall window.)
      if (v.first === null && v.second === null) return 'Too few watched posts to measure variety.';
      return v.second === null
        ? 'Too few watched posts in the second half.'
        : 'Too few watched posts in the first half.';
    },
    varietyHint: '0 = all the same. 1 = all different.',

    // "enjoys" = a taste of at least ENJOY_THRESHOLD, i.e. they'd like it close to half the time or more.
    tasteLine: function (p) {
      return 'At the start, ' + p.name + ' enjoyed ' + plural(p.enjoyedStart, 'topic') +
             '. At the end: ' + p.enjoyedEnd + '.';
    },

    // ---- Step 8: the big picture
    closingTitle: function (still, total) {
      if (still >= Math.ceil(total / 2)) return 'You kept their attention. Was that good for them?';
      if (still >= 1) return 'You kept some of their attention. Was that good for them?';
      return 'You lost everyone. What would a real app try next?';
    },

    // The verdict is chosen from the data. It must never claim a bubble that didn't form.
    verdict: function (overall) {
      if (overall.trend === 'dropped') {
        return 'Their feeds got narrower. Each time you showed a post someone liked, they liked that topic more ' +
               'and everything else less. That is how a filter bubble forms.';
      }
      if (overall.trend === 'low') {
        // Narrow from the start: there was no "drop" to point at, but it is the same lesson, so say what happened.
        return 'Their feeds were narrow all round. Most of what each person watched was the same topic. ' +
               'That is a filter bubble, and it forms fast when an app only chases attention.';
      }
      if (overall.trend === 'rose') {
        return 'Variety went up this time. Apps that only chase attention can end up doing the opposite.';
      }
      if (overall.trend === 'steady') {
        return 'Feeds stayed fairly mixed this time. Play again and only show what each person already likes. What changes?';
      }
      return 'There weren\'t enough watched posts to measure variety. Play again and keep people watching longer.';
    },
    varietyTile: function (o, total) {
      if (o.varietyFirst === null) return { value: '—', sub: 'not enough watched posts' };
      var sub = 'first half → second half';
      if (o.varietyPeople < total) sub += ' (' + o.varietyPeople + ' of ' + total + ' people)';
      return { value: two(o.varietyFirst) + ' → ' + two(o.varietySecond), sub: sub };
    },
    enjoyTile: function (o) {
      return { value: o.enjoyedStart.toFixed(1) + ' → ' + o.enjoyedEnd.toFixed(1), sub: 'per person, start → end' };
    },

    questions: [
      'Did anyone\'s feed get narrower? What did you do that caused it?',
      'The game only gave you points for attention. What did it never reward?',
      'How could a real app keep people interested without trapping them in one topic?'
    ]
  };
  DS.revealText = text;

  // ================================================================ The drawing
  var reveal = {};
  var ui;                                     // DS.ui, looked up when first needed (script order)
  var h = function () { return ui.h.apply(null, arguments); };

  var state = null;                           // { data, handlers, steps, step }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Count a number up from 0 so the score feels earned. Skipped if the person asked for less motion.
  function countUp(el, to, render) {
    if (reducedMotion() || to <= 0) { el.textContent = render(to); return; }
    var start = null, ms = 700;
    function tick(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / ms);
      el.textContent = render(Math.round(to * (1 - Math.pow(1 - t, 3))));   // ease-out
      if (t < 1) requestAnimationFrame(tick);
    }
    el.textContent = render(0);
    requestAnimationFrame(tick);
  }

  // ---- Step 1: the win
  function renderScore(data) {
    var box = h('div', 'win');
    box.appendChild(h('p', 'win__eyebrow', 'Round over'));
    box.appendChild(h('h2', 'win__title', text.winTitle(data.stillScrolling, data.total)));

    var stats = h('div', 'win__stats');
    function stat(label, valueEl) {
      var s = h('div', 'bigstat');
      s.appendChild(valueEl);
      s.appendChild(h('span', 'bigstat__label', label));
      return s;
    }
    var still = h('strong', 'bigstat__value');
    var avg = h('strong', 'bigstat__value');
    stats.appendChild(stat('still scrolling', still));
    stats.appendChild(stat('average attention', avg));
    box.appendChild(stats);
    countUp(still, data.stillScrolling, function (n) { return n + ' / ' + data.total; });
    countUp(avg, Math.round(data.averageAttention), String);

    // Who stayed and who left, at a glance. Words, not just color.
    var row = h('ul', 'chips');
    data.vps.forEach(function (p) {
      var chip = h('li', 'chip' + (p.gone ? ' chip--gone' : ''));
      chip.appendChild(h('span', 'chip__avatar', p.avatar));
      chip.appendChild(h('span', 'chip__name', p.name));
      chip.appendChild(h('span', 'chip__state', p.gone ? 'Left at ' + mmss(p.afkAt === null ? 0 : p.afkAt)
                                                      : 'Here · ' + Math.round(p.finalAttention)));
      row.appendChild(chip);
    });
    box.appendChild(row);

    box.appendChild(h('p', 'win__tease', text.winTease(data.stillScrolling)));
    return box;
  }

  // ---- Steps 2-7: one person
  function renderFeed(p) {
    var box = h('section', 'panel feedbox');
    box.appendChild(h('h3', 'panel__title', 'What you showed ' + p.name));
    box.appendChild(h('p', 'panel__line', text.feedLine(p)));

    var row = h('div', 'feed');
    // The row is a picture for sighted users; give everyone else the summary instead of 40 emoji.
    row.setAttribute('role', 'img');
    var parts = [];
    DS.TOPIC_IDS.forEach(function (id) {
      var n = p.feed.filter(function (f) { return f.topic === id; }).length;
      if (n) parts.push(n + ' ' + topicLabel(id));
    });
    row.setAttribute('aria-label', parts.length ? 'Posts shown: ' + parts.join(', ') : 'No posts shown');

    var shown = p.feed.slice(-C.REVEAL_FEED_MAX);          // a safety cap; a normal round is far below it
    if (shown.length < p.feed.length) row.appendChild(h('span', 'feed__more', '+' + (p.feed.length - shown.length) + ' earlier'));
    shown.forEach(function (f, i) {
      var item = h('span', 'feed__item ' + (f.liked ? 'feed__item--yes' : 'feed__item--no'), DS.TOPIC_BY_ID[f.topic].emoji);
      item.style.animationDelay = Math.min(i * 18, 700) + 'ms';          // they appear in order, like a feed
      row.appendChild(item);
    });
    if (!p.feed.length) row.appendChild(h('span', 'feed__none', '—'));
    box.appendChild(row);

    if (p.total) box.appendChild(h('p', 'panel__hint', text.feedLegend(p)));
    return box;
  }

  // A radar's corner labels: HTML placed around the SVG with the same cqmin rule (see style.css).
  function cornerLabel(i, n, top, emoji, text) {
    var d = DS.radar.direction(i, n);
    var lab = h('div', 'rchart__label' + (top ? ' rchart__label--top' : ''));
    lab.style.setProperty('--dx', d.x.toFixed(4));
    lab.style.setProperty('--dy', d.y.toFixed(4));
    lab.appendChild(h('span', 'rchart__emoji', emoji));
    lab.appendChild(h('span', 'rchart__nums', text));
    return lab;
  }

  // One radar drawn like the radar on the card: a spike per topic, and the % at each corner.
  function spikeChart(tastes, caption, highlight, ariaLabel) {
    var n = DS.TOPICS.length;
    var wrap = h('div', 'rchart-wrap');
    var chart = h('div', 'rchart');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', ariaLabel + ': ' + DS.TOPICS.map(function (t) {
      return t.label + ' ' + Math.round(100 * tastes[t.id]) + ' percent';
    }).join(', '));
    var f = DS.radar.frame(n);
    var layer = DS.radar.group('radar__learned-layer');
    f.svg.appendChild(layer);
    DS.radar.spikes(layer, DS.TOPICS.map(function (t) { return tastes[t.id]; }),
                           DS.TOPICS.map(function (t) { return t.color; }));
    chart.appendChild(f.svg);
    DS.TOPICS.forEach(function (t, i) {
      chart.appendChild(cornerLabel(i, n, highlight.indexOf(t.id) !== -1, t.emoji, String(Math.round(100 * tastes[t.id]))));
    });
    wrap.appendChild(chart);
    wrap.appendChild(h('p', 'rchart__caption', caption));
    return wrap;
  }

  // The person's REAL tastes, start vs end: the filter-bubble picture. Drawn one of two ways, to match
  // what the radar on the card showed during play (RADAR_SHOWS):
  //   interests  two radars drawn exactly like the card's: the start (the radar the player used) and the
  //              end. The same picture, before and after, so the player can see that their own feed
  //              shrank the shape into one spike.
  //   learned    start (dashed) vs end (filled) in one radar, and beside it what the player learned: the
  //              same spikes they saw on the card. "Your profile of Maya said Sports only... and your
  //              feed made it true."
  function renderTastes(p) {
    var box = h('section', 'panel tastebox');
    box.appendChild(h('h3', 'panel__title', 'What ' + p.name + ' likes'));
    box.appendChild(h('p', 'panel__hint', 'Chance they\'d like each topic, in %.'));

    var n = DS.TOPICS.length;
    // Highlight what was shown most, but only if something really stood out (shown 2+ times).
    // Several topics tied is fine, they all light up. If every post was a different topic,
    // nothing was "most shown", so nothing is highlighted.
    var highlight = p.topCount >= 2 ? p.topTopics : [];
    var row = h('div', 'tastes__row');

    if (ui.showsInterests()) {
      row.classList.add('tastes__row--pair');
      row.appendChild(spikeChart(p.tastesStart, 'Start (your radar)', [], 'Chance ' + p.name + ' would like each topic at the start'));
      row.appendChild(spikeChart(p.tastesEnd, 'End of round', highlight, 'Chance ' + p.name + ' would like each topic at the end'));
      box.appendChild(row);
      if (highlight.length) box.appendChild(h('p', 'legend', 'Highlighted: what you showed most.'));
      box.appendChild(h('p', 'panel__line', text.tasteLine(p)));
      return box;
    }

    // ---- the real tastes
    var realWrap = h('div', 'rchart-wrap');
    var real = h('div', 'rchart');
    real.setAttribute('role', 'img');
    real.setAttribute('aria-label', 'Chance ' + p.name + ' would like each topic, start to end: ' + DS.TOPICS.map(function (t) {
      return t.label + ' ' + Math.round(100 * p.tastesStart[t.id]) + ' to ' + Math.round(100 * p.tastesEnd[t.id]) + ' percent';
    }).join(', '));
    var realFrame = DS.radar.frame(n);
    realFrame.svg.appendChild(DS.radar.shape(DS.TOPICS.map(function (t) { return p.tastesStart[t.id]; }), 'radar__start'));
    realFrame.svg.appendChild(DS.radar.shape(DS.TOPICS.map(function (t) { return p.tastesEnd[t.id]; }), 'radar__end'));
    real.appendChild(realFrame.svg);
    DS.TOPICS.forEach(function (t, i) {
      real.appendChild(cornerLabel(i, n, highlight.indexOf(t.id) !== -1, t.emoji,
        Math.round(100 * p.tastesStart[t.id]) + ' → ' + Math.round(100 * p.tastesEnd[t.id])));
    });
    realWrap.appendChild(real);
    realWrap.appendChild(h('p', 'rchart__caption', 'Their real tastes'));
    row.appendChild(realWrap);

    // ---- what the player learned (their own pushes): spikes, "?" for never tried
    var seenWrap = h('div', 'rchart-wrap');
    var seen = h('div', 'rchart');
    seen.setAttribute('role', 'img');
    seen.setAttribute('aria-label', 'What you learned about ' + p.name + ': ' + DS.TOPICS.map(function (t) {
      var o = p.observed[t.id];
      return t.label + (o.tries ? ' liked ' + o.likes + ' of ' + o.tries : ' not tried');
    }).join(', '));
    var seenFrame = DS.radar.frame(n);
    var layer = DS.radar.group('radar__learned-layer');
    seenFrame.svg.appendChild(layer);
    DS.radar.spikes(layer, DS.TOPICS.map(function (t) { return p.observed[t.id].estimate; }),
                           DS.TOPICS.map(function (t) { return t.color; }));
    DS.TOPICS.forEach(function (t, i) {
      if (!p.observed[t.id].tries) seenFrame.spokes[i].classList.add('radar__spoke--untried');
    });
    seen.appendChild(seenFrame.svg);
    DS.TOPICS.forEach(function (t, i) {
      var o = p.observed[t.id];
      seen.appendChild(cornerLabel(i, n, false, t.emoji, o.tries ? o.likes + '/' + o.tries : '?'));
    });
    seenWrap.appendChild(seen);
    seenWrap.appendChild(h('p', 'rchart__caption', 'What you learned'));
    row.appendChild(seenWrap);
    box.appendChild(row);

    var legend = h('p', 'legend');
    legend.appendChild(h('span', 'legend__swatch legend__swatch--start'));
    legend.appendChild(document.createTextNode(' start of round   '));
    legend.appendChild(h('span', 'legend__swatch legend__swatch--end'));
    legend.appendChild(document.createTextNode(' end of round'));
    if (highlight.length) legend.appendChild(document.createTextNode('   ·   Highlighted: what you showed most.'));
    box.appendChild(legend);
    box.appendChild(h('p', 'panel__line', text.tasteLine(p)));
    return box;
  }

  function renderVariety(p) {
    var box = h('section', 'panel varietybox');
    box.appendChild(h('h3', 'panel__title', 'Variety of what they watched'));
    box.appendChild(h('p', 'panel__line panel__line--big', text.varietyLine(p.variety)));

    function row(label, value, count) {
      var r = h('div', 'vrow');
      r.appendChild(h('span', 'vrow__label', label));
      var track = h('div', 'vrow__track');
      var fill = h('div', 'vrow__fill');
      fill.style.setProperty('--v', value === null ? 0 : value);
      track.appendChild(fill);
      r.appendChild(track);
      r.appendChild(h('span', 'vrow__value', value === null ? '—' : two(value)));
      r.appendChild(h('span', 'vrow__count', plural(count, 'watched post')));
      return r;
    }
    box.appendChild(row('First half', p.variety.first, p.variety.firstCount));
    box.appendChild(row('Second half', p.variety.second, p.variety.secondCount));
    box.appendChild(h('p', 'panel__hint', text.varietyHint));
    return box;
  }

  function renderVP(p) {
    var wrap = h('div', 'vpstage');

    var left = h('div', 'vpstage__col');
    var who = h('header', 'panel who' + (p.gone ? ' who--gone' : ''));
    who.appendChild(h('div', 'who__avatar', p.avatar));
    var names = h('div', 'who__text');
    names.appendChild(h('h2', 'who__name', p.name));
    names.appendChild(h('p', 'who__bio', p.bio));
    who.appendChild(names);
    who.appendChild(h('p', 'who__status', text.statusLine(p)));
    left.appendChild(who);
    left.appendChild(renderFeed(p));
    left.appendChild(renderVariety(p));

    var right = h('div', 'vpstage__col');
    right.appendChild(renderTastes(p));

    wrap.appendChild(left);
    wrap.appendChild(right);
    return wrap;
  }

  // ---- Step 8: the big picture
  // Left: the two averages and the verdict. Right: questions for the class. Bottom: the buttons.
  function renderBig(data) {
    var box = h('div', 'big');
    box.appendChild(h('h2', 'big__title', text.closingTitle(data.stillScrolling, data.total)));

    var left = h('div', 'big__left');
    var tiles = h('div', 'tiles');
    function tile(title, t) {
      var el = h('div', 'tile');
      el.appendChild(h('span', 'tile__title', title));
      el.appendChild(h('strong', 'tile__value', t.value));
      el.appendChild(h('span', 'tile__sub', t.sub));
      return el;
    }
    tiles.appendChild(tile('Average variety', text.varietyTile(data.overall, data.total)));
    tiles.appendChild(tile('Topics people enjoy', text.enjoyTile(data.overall)));
    left.appendChild(tiles);
    left.appendChild(h('p', 'big__verdict', text.verdict(data.overall)));
    box.appendChild(left);

    var talk = h('section', 'panel talk');
    talk.appendChild(h('h3', 'panel__title', 'Talk about it'));
    var list = h('ol', 'talk__list');
    text.questions.forEach(function (q) { list.appendChild(h('li', null, q)); });
    talk.appendChild(list);
    box.appendChild(talk);

    var actions = h('div', 'big__actions');
    var dl = h('button', 'btn btn--ghost btn--big', '⬇ Download data (CSV)');
    dl.type = 'button';
    dl.addEventListener('click', ui.guarded(function () {
      var name = state.handlers.onDownload();          // null if the log refused (it is sealed during play)
      dl.textContent = name ? '✓ Saved ' + name : 'Could not save. Try again.';
      setTimeout(function () { dl.textContent = '⬇ Download data (CSV)'; }, 3000);
    }));
    var again = h('button', 'btn btn--primary btn--big', '▶ Play again');
    again.type = 'button';
    again.addEventListener('click', ui.guarded(function () { state.handlers.onPlayAgain(); }));
    actions.appendChild(dl);
    actions.appendChild(again);
    box.appendChild(actions);

    var tut = h('button', 'link-btn', 'Replay the tutorial');
    tut.type = 'button';
    tut.addEventListener('click', ui.guarded(function () { state.handlers.onReplayTutorial(); }));
    box.appendChild(tut);
    return box;
  }

  // ---- The frame around the steps
  function buildSteps(data) {
    var steps = [{ kind: 'score', label: 'Score', short: 'Score' }];
    data.vps.forEach(function (p, i) {
      steps.push({ kind: 'vp', index: i, label: p.avatar + ' ' + p.name, short: p.name, gone: p.gone });
    });
    steps.push({ kind: 'big', label: 'Big picture', short: 'Big picture' });
    return steps;
  }

  function renderStepper() {
    var nav = ui.$('reveal-steps');
    nav.innerHTML = '';
    state.steps.forEach(function (st, i) {
      var b = h('button', 'step', st.label);
      b.type = 'button';
      if (st.gone) b.appendChild(h('span', 'step__tag', 'AFK'));
      b.addEventListener('click', ui.guarded(function () { goTo(i); }));
      nav.appendChild(b);
    });
  }

  function goTo(i) {
    var steps = state.steps;
    i = Math.max(0, Math.min(steps.length - 1, i));
    state.step = i;
    var st = steps[i];

    // stepper highlight
    var buttons = ui.$('reveal-steps').children;
    for (var k = 0; k < buttons.length; k++) {
      buttons[k].classList.toggle('step--current', k === i);
      buttons[k].classList.toggle('step--seen', k < i);
      if (k === i) buttons[k].setAttribute('aria-current', 'step'); else buttons[k].removeAttribute('aria-current');
    }

    // the content
    var stage = ui.$('reveal-stage');
    stage.innerHTML = '';
    stage.appendChild(st.kind === 'score' ? renderScore(state.data)
                    : st.kind === 'big'   ? renderBig(state.data)
                    :                       renderVP(state.data.vps[st.index]));
    stage.classList.remove('stage--in');
    void stage.offsetWidth;
    stage.classList.add('stage--in');

    // back / next
    var back = ui.$('reveal-back'), next = ui.$('reveal-next');
    back.disabled = i === 0;
    next.hidden = i === steps.length - 1;
    var following = steps[i + 1];
    next.textContent = i === 0 ? 'See what happened →'
                     : following && following.kind === 'big' ? 'The big picture →'
                     : following ? 'Next: ' + following.short + ' →' : '';
    ui.$('reveal-progress').textContent = (i + 1) + ' of ' + steps.length;
    stage.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------- Public
  // data: DS.metrics.buildReveal(...)
  // handlers: { onDownload() -> file name, onPlayAgain(), onReplayTutorial() }
  reveal.show = function (data, handlers) {
    ui = DS.ui;
    state = { data: data, handlers: handlers, steps: buildSteps(data), step: 0 };
    ui.showScreen('reveal');
    ui.armGuard();                       // the player's last frantic clicks must not skip the score
    renderStepper();
    goTo(0);
  };

  reveal.init = function () {
    ui = DS.ui;
    ui.$('reveal-back').addEventListener('click', ui.guarded(function () { if (state) goTo(state.step - 1); }));
    ui.$('reveal-next').addEventListener('click', ui.guarded(function () { if (state) goTo(state.step + 1); }));
    // Left/right arrows move between steps (handy when a teacher is driving a projector).
    document.addEventListener('keydown', function (e) {
      if (!state || !ui.$('screen-reveal').classList.contains('screen--active')) return;
      if (e.key === 'ArrowRight' && !ui.guardActive()) goTo(state.step + 1);
      else if (e.key === 'ArrowLeft' && !ui.guardActive()) goTo(state.step - 1);
    });
  };

  DS.reveal = reveal;
})();
