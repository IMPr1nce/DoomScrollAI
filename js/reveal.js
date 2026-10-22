/*
 * reveal.js — the results screen: the part of the game that teaches the lesson.
 *
 * It walks the player through the steps one at a time (5 with the default 2 people):
 *
 *   Score            "the win": still scrolling, average attention and points. (They did well!)
 *   One per VP       their story (what you showed them, what happened to their tastes), the feed, the radars.
 *   Leaderboard      every round on this laptop, ranked by points (leaderboard.js). Before the big
 *                    picture, so the class discussion still comes last.
 *   Big picture      the average story, a verdict, the question, and 3 discussion prompts.
 *
 * Two layers in this file:
 *   DS.revealText   PURE functions that turn numbers into sentences. No DOM, so tests.html can
 *                   check them. This is where the screen's honesty lives: every sentence has a
 *                   branch for "it didn't happen" (nothing lost, nobody left, no data).
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
    // "You tried 3 of 6 topics." How much the player explored with this person, said as a plain count (the
    // words "exploring" and "exploiting" only appear on the big-picture step). Empty when nothing was shown:
    // feedLine already says so. Someone who left gets "before Maya left", because the tries ended there.
    triedLine: function (p) {
      if (!p.total) return '';
      var all = DS.TOPIC_IDS.length;
      return (p.topicsShown === all ? 'You tried all ' + all + ' topics' : 'You tried ' + p.topicsShown + ' of ' + all + ' topics') +
             (p.gone ? ' before ' + p.name + ' left.' : '.');
    },
    feedLegend: function (p) {
      return 'Bright = they watched it (' + p.likedCount + '). Faded = they skipped it (' + (p.total - p.likedCount) + ').';
    },

    // The person's step opens with their story: what you showed them, then what happened to their tastes. Students
    // never meet the word "variety" during play, so this names topics instead of measuring them. Every fact comes from
    // buildReveal(): lostTopics / gainedTopics / focusGrew compare the percents the radars beside it print, and
    // `bubble` decides the one sentence that says "bubble" (renderVP draws the definition under exactly that one).
    // The cause is always what the player did: every watch nudges tastes, so even a mix can cost a topic, and a
    // player who mixed is told so, never "because you didn't show variety". "Enjoy" counts the "meh" topic too
    // (the start is usually 4), so never "favorites". Someone who left gets the same facts in the past tense; the
    // status pill already says when.
    story: function (p) {
      var now = !p.gone;
      var kept = 'they still ' + (now ? 'enjoy ' : 'enjoyed ') +
                 (p.enjoyedStart === 1 ? 'the 1 topic' : 'all ' + p.enjoyedStart + ' topics') + ' they started with.';
      var still = ', and ' + kept;
      var lost = joinLabels(p.lostTopics);
      var line;
      if (!p.total) return p.name + ' never saw a post, so their tastes didn\'t change.';   // tastes move only on a watch
      if (p.total < 3) {
        line = 'You showed ' + p.name + ' just ' + plural(p.total, 'post') +
               (lost ? ', but even that cost them interest in ' + lost + '.' : still);
      } else if (p.focusTopic) {
        var topic = topicLabel(p.focusTopic);
        line = 'You showed ' + p.name + (p.topCount === p.total ? ' only ' : ' mostly ') + topic;
        if (p.bubble) {
          line += ', so ' + p.name + (now ? ' is drifting' : ' drifted') + ' into a ' + topic + ' bubble and lost interest in ' + lost + '.';
        } else if (lost) {
          // No bubble with a loss means the main topic isn't one they enjoy: mostly skipped, so it didn't pull them in.
          line += ', which they ' + (now ? 'don\'t' : 'didn\'t') + ' enjoy. The posts they did watch cost them interest in ' + lost + '.';
        } else if (p.focusGrew) {
          line += '. ' + topic + ' grew on them, but ' + kept;
        } else {
          line += still;
        }
      } else {
        line = 'You mixed it up for ' + p.name +
               (lost ? ', but every watch still nudged their tastes: they lost interest in ' + lost + '.' : still);
      }
      return p.gainedTopics.length ? line + ' They also came to enjoy ' + joinLabels(p.gainedTopics) + '.' : line;
    },
    // The chips beside the radars: the same topics as the story, in words (with the emoji) for screen readers too.
    lostLabel: 'Lost interest:',
    gainedLabel: 'Gained interest:',
    noneLost: 'none',

    // ---- Step 8: the big picture
    closingTitle: function (still, total) {
      if (still >= Math.ceil(total / 2)) return 'You kept their attention. Was that good for them?';
      if (still >= 1) return 'You kept some of their attention. Was that good for them?';
      return 'You lost everyone. What would a real app try next?';
    },

    // The verdict is chosen from the data. It must never claim a bubble that didn't form. For a narrow result it
    // only says what happened; bubbleDefinition and bubbleLoop then name the idea and show the cause, so the term
    // is defined before it is used.
    verdict: function (overall) {
      if (overall.trend === 'dropped') return 'Their feeds got narrower as the round went on.';
      // Narrow from the start: there was no "drop" to point at, but it is the same lesson, so say what happened.
      if (overall.trend === 'low') return 'Their feeds were narrow from the start.';
      if (overall.trend === 'rose') {
        return 'Variety went up this time. Apps that only chase attention can end up doing the opposite.';
      }
      if (overall.trend === 'steady') {
        return 'Feeds stayed fairly mixed this time. Play again and only show what each person already likes. What changes?';
      }
      return 'There weren\'t enough watched posts to measure variety. Play again and keep people watching longer.';
    },
    // Said only where the bubble really formed (bubbleLoop is '' otherwise, and renderBig skips both).
    bubbleDefinition: 'Filter bubble = a feed so full of one thing that you rarely see anything else.',
    // The cause, as a loop a student can follow. It names a real person and topic when one fits (see loopExample in
    // metrics.js); "they like Sports more, the rest less" is the taste drift that the radars on each step show.
    bubbleLoop: function (overall) {
      if (overall.trend !== 'dropped' && overall.trend !== 'low') return '';
      var ex = overall.loopExample;
      if (!ex) return 'How it forms: you show a topic → they watch it → they like it more, the rest less → repeat.';
      var topic = topicLabel(ex.topic);
      return 'How it forms: you show ' + ex.name + ' ' + topic + ' → they watch → they like ' + topic +
             ' more, the rest less → repeat.';
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

    // The two words behind "You tried 3 of 6 topics". The tutorial introduces them (its two steps, in game.js,
    // use these same lines) and the big-picture step brings them back. They define and judge nobody: the
    // questions below do the asking. Never said during the round.
    exploring: 'Exploring = trying something new to learn more.',
    exploiting: 'Exploiting = showing what you know works.',
    exploreDefinition: 'Exploiting = showing what you know works. Exploring = trying something new to learn more.',

    // ---- The leaderboard. `view` is DS.leaderboard.view(); ties are said as ties.
    boardHint: 'Points = everyone\'s attention when the round ended. Someone who left counts as 0.',
    boardLoading: 'Loading the leaderboard…',
    boardRank: function (view) {
      if (!view.mine) return '';
      if (view.count === 1) return 'Yours is the first round on the board.';
      return 'You\'re ' + (view.mine.tied ? 'tied for ' : '') + '#' + view.mine.rank + ' of ' + view.count + ' rounds' +
             (view.mine.rank === 1 && !view.mine.tied ? '!' : '.');
    },
    // Says where the rounds come from, because without the saving program the board is only this visit's.
    boardNote: function (saved) {
      if (saved === 'folder') return 'Rounds played on this laptop.';
      if (saved === 'memory') return 'Only rounds since the game was opened: the saving program wasn\'t running.';
      return 'The leaderboard file couldn\'t be saved, so only rounds since the game was opened are shown.';
    },

    // ---- Where the player's files are, under the big picture's buttons. `s` = { where, folder } from game.js.
    savedLine: function (s) {
      if (s.where === 'folder') return '✓ Your data is saved in data/' + s.folder + '.';
      if (s.where === 'pending') return 'Saving your data…';
      if (s.where === 'failed') return 'Saving failed: is the saving program still running? Log out will try again.';
      return 'The saving program isn\'t running, so nothing is saved yet. Log out will try again.';
    },

    questions: [
      'Did anyone\'s feed get narrower? What did you do that caused it?',
      // Takes the lesson off the laptop: the student's own feed. It asks; it doesn't tell them their apps are bad.
      'Does your own TikTok or YouTube feed do this? How would you find out?',
      'If you always order your favorite food, you never find a new favorite. When should an app show something new?'
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
    var pts = h('strong', 'bigstat__value');
    stats.appendChild(stat('still scrolling', still));
    stats.appendChild(stat('average attention', avg));
    stats.appendChild(stat('points', pts));         // what the leaderboard ranks (metrics.points)
    box.appendChild(stats);
    countUp(still, data.stillScrolling, function (n) { return n + ' / ' + data.total; });
    countUp(avg, Math.round(data.averageAttention), String);
    countUp(pts, data.points, String);

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
    // The title and the sentence share one line, and the "tried" count joins the sentence: the step is a stack of
    // three panels in ~445px, and the radars get whatever height this panel doesn't take.
    var head = h('div', 'feedbox__head');
    head.appendChild(h('h3', 'panel__title', 'What you showed ' + p.name));
    var tried = text.triedLine(p);
    head.appendChild(h('p', 'panel__line', text.feedLine(p) + (tried ? ' ' + tried : '')));
    box.appendChild(head);

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
  // "Lost interest: 💥 Comics": the story's topics again, beside the radars that show them. Emoji and word, never
  // color alone. A step with nothing lost still says "none", so the column never looks half-empty.
  function topicChips(label, ids, none) {
    var line = h('p', 'tchips');
    line.appendChild(h('span', 'tchips__label', label));
    ids.forEach(function (id) { line.appendChild(h('span', 'tchip', DS.TOPIC_BY_ID[id].emoji + ' ' + topicLabel(id))); });
    if (!ids.length) line.appendChild(h('span', 'tchips__none', none));
    return line;
  }

  // The radars sit side by side, and a third column beside them holds the chips and the hints, so the row has no
  // empty space. There is no title: the captions under each radar say what it is.
  function renderTastes(p) {
    var box = h('section', 'panel tastebox');
    var side = h('div', 'tastes__side');
    side.appendChild(topicChips(text.lostLabel, p.lostTopics, text.noneLost));
    if (p.gainedTopics.length) side.appendChild(topicChips(text.gainedLabel, p.gainedTopics));
    side.appendChild(h('p', 'panel__hint', 'Chance they\'d like each topic, in %.'));

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
      if (highlight.length) side.appendChild(h('p', 'legend', 'Highlighted: what you showed most.'));
      box.appendChild(side);
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
    side.appendChild(legend);
    // A line of its own here: the side column is narrow, and a "·" joined line would wrap mid-phrase.
    if (highlight.length) side.appendChild(h('p', 'legend', 'Highlighted: what you showed most.'));
    box.appendChild(side);
    return box;
  }

  // One person's step, stacked top to bottom: who they are and their story, what you showed them, and their radars.
  // The radars take whatever height is left (flex: 1 in style.css), so a longer story makes them smaller, never the
  // page taller.
  function renderVP(p) {
    var wrap = h('div', 'vpstage');
    var who = h('header', 'panel who' + (p.gone ? ' who--gone' : ''));
    who.appendChild(h('div', 'who__avatar', p.avatar));
    var names = h('div', 'who__text');
    var line = h('div', 'who__line');
    line.appendChild(h('h2', 'who__name', p.name));
    line.appendChild(h('p', 'who__bio', p.bio));
    names.appendChild(line);
    names.appendChild(h('p', 'who__story', text.story(p)));
    // The term is defined on every step that uses it, word for word as on the big picture.
    if (p.bubble) names.appendChild(h('p', 'who__def', text.bubbleDefinition));
    who.appendChild(names);
    who.appendChild(h('p', 'who__status', text.statusLine(p)));
    wrap.appendChild(who);
    wrap.appendChild(renderFeed(p));
    wrap.appendChild(renderTastes(p));
    return wrap;
  }

  // ---- The leaderboard: the best rounds on this laptop, and where this one landed. The top rows sit in two
  // columns (1-5, 6-10), because ten rows one under the other don't fit the ~445px a results step has. Your row
  // is marked "you" in words (not only a color), and gets a line of its own underneath when it isn't in the top.
  var MEDALS = ['🥇', '🥈', '🥉'];
  function boardTable(rows, withHead) {
    var table = h('table', 'lb__table' + (withHead ? '' : ' lb__table--mine'));
    if (withHead) {
      var head = h('tr');
      ['Rank', 'Gamer tag', 'Points', 'Round'].forEach(function (t) { head.appendChild(h('th', null, t)); });
      table.appendChild(h('thead')).appendChild(head);
    }
    var body = table.appendChild(h('tbody'));
    rows.forEach(function (t) {
      var tr = h('tr', t.mine ? 'lb__row lb__row--mine' : 'lb__row');
      tr.appendChild(h('td', 'lb__rank', (MEDALS[t.rank - 1] ? MEDALS[t.rank - 1] + ' ' : '') + t.rank));
      var tag = h('td', 'lb__tag', t.row.gamer_tag);
      if (t.mine) tag.appendChild(h('span', 'lb__you', 'you'));
      tr.appendChild(tag);
      tr.appendChild(h('td', 'lb__num', String(t.row.points)));
      tr.appendChild(h('td', 'lb__num', String(t.row.round_no)));
      body.appendChild(tr);
    });
    return table;
  }
  function renderBoard() {
    var box = h('div', 'lb');
    box.appendChild(h('h2', 'lb__title', '🏆 Leaderboard'));
    box.appendChild(h('p', 'lb__hint', text.boardHint));
    var board = state.board;
    if (!board) { box.appendChild(h('p', 'lb__note', text.boardLoading)); return box; }

    var half = Math.ceil(C.LEADERBOARD_TOP / 2);
    var cols = h('div', 'lb__cols');
    for (var i = 0; i < board.view.top.length; i += half) cols.appendChild(boardTable(board.view.top.slice(i, i + half), true));
    box.appendChild(cols);
    if (board.view.mine && !board.view.mineInTop) {
      box.appendChild(boardTable([{ rank: board.view.mine.rank, row: board.view.mine.row, mine: true }], false));
    }
    box.appendChild(h('p', 'lb__me', text.boardRank(board.view)));
    box.appendChild(h('p', 'lb__note', text.boardNote(board.saved)));
    return box;
  }

  // ---- The big picture
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
    // Only where a bubble really formed: the term, defined in one line, then the loop that built it.
    var loop = text.bubbleLoop(data.overall);
    if (loop) {
      left.appendChild(h('p', 'big__def', text.bubbleDefinition));
      left.appendChild(h('p', 'big__loop', loop));
    }
    box.appendChild(left);

    var talk = h('section', 'panel talk');
    talk.appendChild(h('h3', 'panel__title', 'Talk about it'));
    talk.appendChild(h('p', 'talk__def', text.exploreDefinition));
    var list = h('ol', 'talk__list');
    text.questions.forEach(function (q) { list.appendChild(h('li', null, q)); });
    talk.appendChild(list);
    box.appendChild(talk);

    var actions = h('div', 'big__actions');
    // The files save themselves when each part ends, so there is no Download button: this line says where they are.
    actions.appendChild(h('p', 'big__saved', text.savedLine(state.handlers.saveStatus())));
    // The player is done: save their files and hand the laptop to the next student (the name screen).
    var out = h('button', 'btn btn--ghost btn--big', '🚪 Log out');
    out.type = 'button';
    out.addEventListener('click', ui.guarded(function () { state.handlers.onLogOut(); }));
    var again = h('button', 'btn btn--primary btn--big', '▶ Play again');
    again.type = 'button';
    again.addEventListener('click', ui.guarded(function () { state.handlers.onPlayAgain(); }));
    actions.appendChild(out);
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
    steps.push({ kind: 'board', label: '🏆 Leaderboard', short: 'Leaderboard' });
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
                    : st.kind === 'board' ? renderBoard()
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
  // handlers: { onPlayAgain(), onReplayTutorial(), onLogOut(), saveStatus() -> { where, folder } }
  // board: { view, saved } from DS.leaderboard.add(), or null while it is still being saved (see setBoard)
  reveal.show = function (data, handlers, board) {
    ui = DS.ui;
    state = { data: data, handlers: handlers, board: board || null, steps: buildSteps(data), step: 0 };
    ui.showScreen('reveal');
    ui.armGuard();                       // the player's last frantic clicks must not skip the score
    renderStepper();
    goTo(0);
  };

  // The leaderboard is read from and written to a file, so it can arrive after the screen is up. `data` says
  // which round it belongs to: a board that arrives after "Play again" is dropped.
  reveal.setBoard = function (data, board) {
    if (!state || state.data !== data) return;
    state.board = board;
    if (state.steps[state.step].kind === 'board') goTo(state.step);
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
