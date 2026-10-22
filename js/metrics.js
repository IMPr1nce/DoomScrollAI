/*
 * metrics.js — the numbers shown on the score and reveal screens.
 * Pure functions on plain data. No DOM, no timers, no randomness.
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var C = DS.CONFIG;

  // ----------------------------------------------------------- Diversity
  // Diversity = average pairwise distance between consumed (liked) posts.
  // Topics are one-hot, so the distance between two posts is 0 if they have
  // the same topic and 1 if they differ.
  //
  // We don't loop over all pairs. For n posts there are n(n-1)/2 pairs, and
  // the pairs at distance 0 are exactly the same-topic pairs: for a topic
  // that appears c times, c(c-1)/2 of them. So:
  //     diversity = 1 - (same-topic pairs) / (all pairs)
  // (tests.js checks this against a brute-force loop.)
  //
  //   all posts one topic   -> 0
  //   all posts different   -> 1
  //   with 6 topics, a perfectly even mix tops out a bit under 1 (~0.83),
  //   because some pairs always repeat a topic.
  //
  // Returns null when there are fewer than 2 posts: a "pair" needs two, and
  // showing 0 there would wrongly say "no variety".
  function diversity(topicIds) {
    var n = topicIds.length;
    if (n < 2) return null;
    var counts = {};
    topicIds.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
    var samePairs = 0;
    Object.keys(counts).forEach(function (id) { samePairs += counts[id] * (counts[id] - 1) / 2; });
    return 1 - samePairs / (n * (n - 1) / 2);
  }

  // Topics of the liked posts, optionally only those pushed in [fromT, toT).
  function likedTopics(history, fromT, toT) {
    var lo = fromT === undefined ? -Infinity : fromT;
    var hi = toT === undefined ? Infinity : toT;
    return history
      .filter(function (h) { return h.liked && h.t >= lo && h.t < hi; })
      .map(function (h) { return h.topic; });
  }

  // What one half's watched posts were, in counts: how many different topics, and which topic(s) came up most.
  // The big picture's loop example uses it ("a topic that was more than half of their second half"). Ties keep
  // every tied topic, so nothing ever has to pick a winner.
  function mixOf(topicIds) {
    var counts = {};
    topicIds.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
    var topCount = 0;
    DS.TOPIC_IDS.forEach(function (id) { if ((counts[id] || 0) > topCount) topCount = counts[id]; });
    return {
      kinds: Object.keys(counts).length,
      top: topCount ? DS.TOPIC_IDS.filter(function (id) { return counts[id] === topCount; }) : [],
      topCount: topCount
    };
  }

  // First half of the round vs second half (the big picture's verdict, its loop and the "Average variety" tile; the
  // person steps no longer show it). Split by push time. If the round ended early (everyone went AFK) pass the real
  // elapsed seconds, not ROUND_SEC, so the halves are still halves of what happened.
  // The number and the counts come from the very same two lists, so the words can't disagree with it.
  function diversityByHalf(history, elapsedSec) {
    var mid = elapsedSec / 2;
    var first = likedTopics(history, 0, mid);
    var second = likedTopics(history, mid, Infinity);
    return {
      first: diversity(first),     // null if fewer than 2 liked posts in that half
      second: diversity(second),
      firstCount: first.length,
      secondCount: second.length,
      firstMix: mixOf(first),
      secondMix: mixOf(second)
    };
  }

  // -------------------------------------------------------------- Scoring
  // Number of VPs who haven't closed the app.
  function stillScrolling(vps) {
    return vps.filter(function (vp) { return vp.state !== 'afk'; }).length;
  }

  // Time-averaged attention across all VPs. Each VP keeps a running total of
  // (attention x seconds) and a clock, so their own average is total / clock.
  // A VP who went AFK at second 30 contributes 0 for the remaining 60 seconds,
  // which is the point: losing someone costs you.
  function averageAttention(vps) {
    if (!vps.length) return 0;
    var sum = 0;
    vps.forEach(function (vp) { sum += vp.clock > 0 ? vp.attentionTime / vp.clock : 0; });
    return sum / vps.length;
  }

  // The leaderboard's points: everyone's attention when the round ended, added up. Someone who left counts 0
  // (their attention is 0), so keeping everyone matters as much as keeping them high. Whole numbers, because a
  // board of "176.43" reads as a measurement, not a score.
  function points(vps) {
    return Math.round(vps.reduce(function (sum, vp) { return sum + (vp.state === 'afk' ? 0 : vp.attention); }, 0));
  }

  // ------------------------------------------------------- Reveal helpers
  // "You showed Maya 14 posts. 12 were Sports."
  function feedSummary(history) {
    var byTopic = {};
    DS.TOPIC_IDS.forEach(function (id) { byTopic[id] = 0; });
    var likedCount = 0;
    history.forEach(function (h) { byTopic[h.topic]++; if (h.liked) likedCount++; });
    var topTopic = null, topCount = 0;
    DS.TOPIC_IDS.forEach(function (id) {
      if (byTopic[id] > topCount) { topCount = byTopic[id]; topTopic = id; }
    });
    return { total: history.length, likedCount: likedCount,
             byTopic: byTopic, topTopic: topTopic, topCount: topCount };
  }

  // What the PLAYER has seen, per topic: how often they showed it and how often it was liked. This is
  // everything a real recommender knows about you, and it's what the 'learned' radar draws during play
  // (RADAR_SHOWS). `estimate` is the spike length, smoothed by RADAR_SMOOTHING so that one
  // lucky like doesn't look like a long track record. Untried topics get estimate null ("?"), never 0:
  // "never tried" is not the same as "they hate it".
  function observed(history) {
    var S = C.RADAR_SMOOTHING;
    var out = {};
    DS.TOPIC_IDS.forEach(function (id) { out[id] = { tries: 0, likes: 0, estimate: null }; });
    history.forEach(function (h) { out[h.topic].tries++; if (h.liked) out[h.topic].likes++; });
    DS.TOPIC_IDS.forEach(function (id) {
      var o = out[id];
      if (o.tries) o.estimate = (o.likes + S) / (o.tries + 2 * S);
    });
    return out;
  }

  // Topics a VP would still happily watch (taste at/above ENJOY_THRESHOLD).
  // Comparing this at the start and end of the round puts a plain number on
  // the filter bubble: the big picture's "Topics people enjoy" tile.
  function enjoyedTopics(tastes) {
    return DS.TOPIC_IDS.filter(function (id) { return tastes[id] >= C.ENJOY_THRESHOLD; });
  }

  // The same test on the whole percents the results radars print. The person's story names the topics that crossed
  // the line, right beside those radars, so it must agree with them: a taste of 0.447 is printed "45", and "lost
  // interest" next to a 45 would read as a mistake. (About 1 crossing in 4 lands there.) enjoyedTopics stays exact
  // for the big picture's tile and the simulator.
  function percent(t) { return Math.round(100 * t); }
  function enjoyedAsShown(tastes) {
    return DS.TOPIC_IDS.filter(function (id) { return percent(tastes[id]) >= percent(C.ENJOY_THRESHOLD); });
  }
  function missingFrom(ids, others) { return ids.filter(function (id) { return others.indexOf(id) === -1; }); }

  // --------------------------------------------------- Everything the reveal shows
  // reveal.js only DRAWS. All the deciding happens here, in plain data, so it can be tested
  // without a browser. The most important decision is honesty: the reveal must not say
  // "variety dropped" unless it did, and must not say "mixed" about a feed that was all one topic.
  // Each trend is one of:
  //   'dropped'   variety fell by at least REVEAL_TREND_DELTA
  //   'low'       it didn't fall that much, but it ended at or below REVEAL_LOW_VARIETY: the feed
  //               was narrow all along (e.g. someone spammed one topic from the first post)
  //   'rose'      it went up by at least REVEAL_TREND_DELTA, and ended above "low"
  //   'steady'    about the same, and not low: a feed that stayed mixed
  //   'unknown'   a half had fewer than 2 watched posts, so there is no number to compare
  // The order of the checks matters: 'dropped' first, so 1.0 -> 0.0 is a drop; 'low' before
  // 'rose', so 0.0 -> 0.2 isn't celebrated as a "rise".
  function trendOf(first, second) {
    if (first === null || second === null) return 'unknown';
    var change = second - first;
    if (change <= -C.REVEAL_TREND_DELTA) return 'dropped';
    if (second <= C.REVEAL_LOW_VARIETY) return 'low';
    if (change >= C.REVEAL_TREND_DELTA) return 'rose';
    return 'steady';
  }

  function mean(xs) {
    return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : null;
  }

  // vps: the finished VPs.  elapsedSec: how long the round actually ran. It is less than
  // ROUND_SEC if everyone left early, and the first/second halves are halves of THAT time.
  function buildReveal(vps, elapsedSec) {
    var people = vps.map(function (vp) {
      var summary = feedSummary(vp.history);
      var halves = diversityByHalf(vp.history, elapsedSec);
      var keptStart = enjoyedAsShown(vp.tasteSnapshotStart), keptEnd = enjoyedAsShown(vp.tastes);
      // The topic the story says you showed "mostly": more than half of every post shown (the feed line's count), so
      // a tie can never name a winner. Under 3 posts nothing is "mostly" anything.
      var focus = summary.total >= 3 && summary.topCount * 2 > summary.total ? summary.topTopic : null;
      var lost = missingFrom(keptStart, keptEnd);
      return {
        id: vp.id, name: vp.name, avatar: vp.avatar, bio: vp.bio,
        gone: vp.state === 'afk',
        afkAt: vp.afkAt,                       // seconds into the round, or null if they stayed
        finalAttention: vp.attention,
        // Every post shown, in order. "liked" = watched, otherwise skipped.
        feed: vp.history.map(function (h) { return { topic: h.topic, liked: h.liked }; }),
        total: summary.total,
        likedCount: summary.likedCount,
        topTopic: summary.topTopic,            // most-shown topic (null if nothing was shown)
        topCount: summary.topCount,
        // Every topic tied for most-shown. With ties, "the" top topic would be an arbitrary
        // pick, and the screen would claim something that isn't true.
        topTopics: summary.topCount > 0
          ? DS.TOPIC_IDS.filter(function (id) { return summary.byTopic[id] === summary.topCount; })
          : [],
        // How many different topics were shown at least once (watched or skipped): how much the player
        // explored with this person. 0 when nothing was shown.
        topicsShown: DS.TOPIC_IDS.filter(function (id) { return summary.byTopic[id] > 0; }).length,
        // Copies, so nothing drawn later can change the VP.
        tastesStart: Object.assign({}, vp.tasteSnapshotStart),
        tastesEnd: Object.assign({}, vp.tastes),
        enjoyedStart: enjoyedTopics(vp.tasteSnapshotStart).length,
        enjoyedEnd: enjoyedTopics(vp.tastes).length,
        // What the person's story says happened, as the radars print it (enjoyedAsShown). In topic order.
        lostTopics: lost,                      // enjoyed at the start, not at the end
        gainedTopics: missingFrom(keptEnd, keptStart),
        focusTopic: focus,                     // or null
        focusGrew: focus !== null && percent(vp.tastes[focus]) > percent(vp.tasteSnapshotStart[focus]),
        // A filter bubble only where one formed: a feed mostly of one topic they still enjoy (so they watched it, and
        // each watch pulled the others down), and a topic lost on the way. Skips don't move tastes, so a topic shown
        // a lot but skipped is no bubble. The story and its definition line both read this one flag.
        bubble: focus !== null && lost.length > 0 && keptEnd.indexOf(focus) !== -1,
        clue: vp.clue,
        observed: observed(vp.history),        // what the player saw (the profile they built of this person)
        variety: {
          first: halves.first, second: halves.second,
          firstCount: halves.firstCount, secondCount: halves.secondCount,
          firstMix: halves.firstMix, secondMix: halves.secondMix,
          trend: trendOf(halves.first, halves.second)
        }
      };
    });

    // The overall change only uses people who have BOTH halves, so we compare like with like
    // (someone who left halfway has no second half and would otherwise skew the average).
    var both = people.filter(function (p) { return p.variety.first !== null && p.variety.second !== null; });
    var first = mean(both.map(function (p) { return p.variety.first; }));
    var second = mean(both.map(function (p) { return p.variety.second; }));

    // The big picture shows how a filter bubble forms as a loop ("you show Maya Sports → they watch → …"). A real
    // person and topic make it concrete, but only one whose own feed narrowed, and only a topic that was more than
    // half of their second half: the loop must be true of that person. The narrowest feed makes the best example.
    // null means no one qualifies, and the wording falls back to "a topic".
    var loopExample = null;
    both.filter(function (p) { return p.variety.trend === 'dropped' || p.variety.trend === 'low'; })
      .sort(function (a, b) { return a.variety.second - b.variety.second; })
      .some(function (p) {
        var mix = p.variety.secondMix;
        if (mix.top.length !== 1 || mix.topCount * 2 <= p.variety.secondCount) return false;
        loopExample = { name: p.name, topic: mix.top[0] };
        return true;
      });

    return {
      total: vps.length,
      stillScrolling: stillScrolling(vps),
      averageAttention: averageAttention(vps),
      points: points(vps),
      vps: people,
      overall: {
        varietyFirst: first,                   // null when nobody has both halves
        varietySecond: second,
        varietyPeople: both.length,            // how many people the two numbers are based on
        trend: trendOf(first, second),
        loopExample: loopExample,              // { name, topic } or null
        enjoyedStart: mean(people.map(function (p) { return p.enjoyedStart; })),
        enjoyedEnd: mean(people.map(function (p) { return p.enjoyedEnd; }))
      }
    };
  }

  DS.metrics = {
    diversity: diversity,
    likedTopics: likedTopics,
    mixOf: mixOf,
    diversityByHalf: diversityByHalf,
    stillScrolling: stillScrolling,
    averageAttention: averageAttention,
    points: points,
    feedSummary: feedSummary,
    enjoyedTopics: enjoyedTopics,
    observed: observed,
    buildReveal: buildReveal
  };
})();
