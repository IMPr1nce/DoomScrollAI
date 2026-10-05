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

  // Topics a VP would still happily watch (taste at/above ENJOY_THRESHOLD).
  // Comparing this at the start and end of the round puts a plain number on
  // the filter bubble: "Maya used to enjoy 3 topics. Now she enjoys 1."
  function enjoyedTopics(tastes) {
    return DS.TOPIC_IDS.filter(function (id) { return tastes[id] >= C.ENJOY_THRESHOLD; });
  }

  DS.metrics = {
    diversity: diversity,
    likedTopics: likedTopics,
    diversityByHalf: diversityByHalf,
    stillScrolling: stillScrolling,
    averageAttention: averageAttention,
    feedSummary: feedSummary,
    enjoyedTopics: enjoyedTopics
  };
})();
