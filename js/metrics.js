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

  // First half of the round vs second half (the "Variety dropped from 0.72 -> 0.18" line).
  // Split by push time. If the round ended early (everyone went AFK) pass the real
  // elapsed seconds, not ROUND_SEC, so the halves are still halves of what happened.
  function diversityByHalf(history, elapsedSec) {
    var mid = elapsedSec / 2;
    var first = likedTopics(history, 0, mid);
    var second = likedTopics(history, mid, Infinity);
    return {
      first: diversity(first),     // null if fewer than 2 liked posts in that half
      second: diversity(second),
      firstCount: first.length,
      secondCount: second.length
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
  // everything a real recommender knows about you, and it's what the radar draws during play (the
  // hidden tastes never are). `estimate` is the spike length, smoothed by RADAR_SMOOTHING so that one
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
  // the filter bubble: "Maya used to enjoy 3 topics. Now she enjoys 1."
  function enjoyedTopics(tastes) {
    return DS.TOPIC_IDS.filter(function (id) { return tastes[id] >= C.ENJOY_THRESHOLD; });
  }

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
        // Copies, so nothing drawn later can change the VP.
        tastesStart: Object.assign({}, vp.tasteSnapshotStart),
        tastesEnd: Object.assign({}, vp.tastes),
        enjoyedStart: enjoyedTopics(vp.tasteSnapshotStart).length,
        enjoyedEnd: enjoyedTopics(vp.tastes).length,
        clue: vp.clue,
        observed: observed(vp.history),        // what the player saw (the profile they built of this person)
        variety: {
          first: halves.first, second: halves.second,
          firstCount: halves.firstCount, secondCount: halves.secondCount,
          trend: trendOf(halves.first, halves.second)
        }
      };
    });

    // The overall change only uses people who have BOTH halves, so we compare like with like
    // (someone who left halfway has no second half and would otherwise skew the average).
    var both = people.filter(function (p) { return p.variety.first !== null && p.variety.second !== null; });
    var first = mean(both.map(function (p) { return p.variety.first; }));
    var second = mean(both.map(function (p) { return p.variety.second; }));

    return {
      total: vps.length,
      stillScrolling: stillScrolling(vps),
      averageAttention: averageAttention(vps),
      vps: people,
      overall: {
        varietyFirst: first,                   // null when nobody has both halves
        varietySecond: second,
        varietyPeople: both.length,            // how many people the two numbers are based on
        trend: trendOf(first, second),
        enjoyedStart: mean(people.map(function (p) { return p.enjoyedStart; })),
        enjoyedEnd: mean(people.map(function (p) { return p.enjoyedEnd; }))
      }
    };
  }

  DS.metrics = {
    diversity: diversity,
    likedTopics: likedTopics,
    diversityByHalf: diversityByHalf,
    stillScrolling: stillScrolling,
    averageAttention: averageAttention,
    feedSummary: feedSummary,
    enjoyedTopics: enjoyedTopics,
    observed: observed,
    buildReveal: buildReveal
  };
})();
