/*
 * logger.js — writes down what happens in the game, so it can be studied afterwards.
 *
 * The data path, start to finish:
 *
 *   game / VP events --> log*()  --> pending --> flush(batch) --> store --> exportCSV()
 *                                  (waiting)    (THE one exit)   (kept)    (a file download)
 *
 * flush() is the ONLY function that moves data out of the logger. Today it just files the
 * batch into `store`, which is what the CSV export writes. Later, to also send every batch to
 * a small Python/Flask server, add ONE line inside flush() (an example is in the comment
 * there). Nothing else in the game has to change, because the game never talks to the
 * network, it only ever calls log*() and flushPending().
 *
 * Privacy: a session id is a random code. No names, no accounts, nothing about the person
 * playing. The data describes what the six pretend people did, not the player.
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};

  // The column order is the CSV header AND the field names a future server will receive.
  // The first 11 are the agreed fields. The last 3 are extras that make the data usable:
  //   round_no        1, 2, 3... for each main round (0 = tutorials). Rounds in one sitting share a session.
  //   round_time_sec  seconds of real play since the round started. timestamp_ms keeps ticking
  //                   during a pause; this doesn't, so "first half vs second half" is exact.
  //   detail          one extra word: push -> the reaction type (liked, disliked, fatigued, hooked,
  //                   lowAttention, afk); watch_end -> complete | interrupted; afk -> skip | idle;
  //                   round_start / round_end -> (end only) why the round ended: time_up | all_afk;
  //                   pause -> button | tab_hidden | key.
  var COLUMNS = [
    'session_id', 'timestamp_ms', 'phase', 'vp_id', 'event', 'topic', 'liked',
    'attention_before', 'attention_after', 'fatigue_mult', 'tastes_json',
    'round_no', 'round_time_sec', 'detail'
  ];

  // Sortable and unique enough: local date + time + 3 random bytes, e.g. 20261004-153012-a3f9c1.
  function makeSessionId() {
    function two(n) { return (n < 10 ? '0' : '') + n; }
    var d = new Date();
    var stamp = d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' +
                two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds());
    var bytes = (window.crypto && window.crypto.getRandomValues) ? window.crypto.getRandomValues(new Uint8Array(3)) : null;
    var rand = '';
    for (var i = 0; i < 3; i++) {
      var b = bytes ? bytes[i] : Math.floor(Math.random() * 256);
      rand += (b < 16 ? '0' : '') + b.toString(16);
    }
    return stamp + '-' + rand;
  }

  var logger = {
    sessionId: makeSessionId(),
    now: function () { return Date.now(); }   // replaceable, so tests can use a fake clock
  };

  var context = { phase: 'title', round: 0 };  // stamped onto every record; game.js keeps it current
  var pending = [];                            // logged, but not yet handed to flush()
  var store = [];                              // flushed: exactly what exportCSV() writes

  // ---------------------------------------------------------------- Records
  function round(n, places) {
    if (n === null || n === undefined || isNaN(n)) return '';
    var f = Math.pow(10, places);
    return Math.round(n * f) / f;
  }

  // Tastes to 3 decimals: enough to see drift, small enough to keep the file readable.
  function tastesJSON(tastes) {
    if (!tastes) return '';
    var t = {};
    Object.keys(tastes).forEach(function (id) { t[id] = round(tastes[id], 3); });
    return JSON.stringify(t);
  }

  // One flat object per event. `f` uses the same field names a VP event has (see vp.js _emit).
  function makeRecord(f) {
    return {
      session_id: logger.sessionId,
      timestamp_ms: logger.now(),
      phase: context.phase,
      vp_id: f.vpId || '',
      event: f.event,
      topic: f.topic || '',
      liked: (f.liked === null || f.liked === undefined) ? '' : (f.liked ? 1 : 0),
      attention_before: round(f.attentionBefore, 2),
      attention_after: round(f.attentionAfter, 2),
      fatigue_mult: round(f.fatigueMult, 3),
      tastes_json: tastesJSON(f.tastes),
      round_no: context.round,
      round_time_sec: round(f.t, 2),
      detail: f.detail || ''
    };
  }

  // A VP tells us about pushes, the end of a watch, and leaving. (Its speech-bubble
  // 'message' events are just decoration, so they aren't data.)
  function fromVPEvent(e) {
    var detail = '';
    if (e.event === 'push' || e.event === 'watch_end') detail = e.category || '';
    else if (e.event === 'afk') detail = e.reason || '';
    else return null;
    return makeRecord({
      event: e.event, vpId: e.vpId, t: e.t, topic: e.topic, liked: e.liked,
      attentionBefore: e.attentionBefore, attentionAfter: e.attentionAfter,
      fatigueMult: e.fatigueMult, tastes: e.tastes, detail: detail
    });
  }

  // ------------------------------------------------------------------ Public: logging
  // Subscribe to a VP: from now on its pushes / watch ends / AFK are logged.
  logger.watch = function (vp) {
    vp.onEvent(function (e) {
      var rec = fromVPEvent(e);
      if (rec) pending.push(rec);
    });
  };

  // One row about one VP outside of a push, e.g. 'round_start' / 'round_end', which snapshot
  // the VP's attention and hidden tastes at that moment.
  logger.logVP = function (event, vp, detail) {
    pending.push(makeRecord({
      event: event, vpId: vp.id, t: vp.clock,
      attentionBefore: vp.attention, attentionAfter: vp.attention,
      tastes: vp.tastes, detail: detail
    }));
  };

  // A row about the game itself, not any VP: 'pause' / 'resume'.
  logger.logGame = function (event, roundTimeSec, detail) {
    pending.push(makeRecord({ event: event, t: roundTimeSec, detail: detail }));
  };

  // game.js calls this when the phase or round number changes.
  logger.setContext = function (c) {
    if (c.phase !== undefined) context.phase = c.phase;
    if (c.round !== undefined) context.round = c.round;
  };

  // ------------------------------------------------------------------ The one exit
  // ==========================================================================
  //  flush(records)  —  the ONLY place data leaves the logger.
  //
  //  Today: file the batch into `store`, which feeds the CSV export. Keep that line.
  //
  //  To also send batches to the Flask server later, add (inside this function):
  //
  //    fetch('http://localhost:5000/api/log', {
  //      method: 'POST',
  //      headers: { 'Content-Type': 'application/json' },
  //      body: JSON.stringify(records)       // an array of objects, one per CSV row
  //    }).catch(function () { /* the game must never break because the network did */ });
  //
  //  (The Flask side needs CORS turned on, because index.html is opened from a file.)
  // ==========================================================================
  logger.flush = function (records) {
    Array.prototype.push.apply(store, records);
  };

  // Hand everything logged since the last call to flush(). The game calls this at the end of
  // each round, and exportCSV() calls it too, so a download is never missing recent events.
  logger.flushPending = function () {
    if (!pending.length) return;
    logger.flush(pending.splice(0, pending.length));
  };

  // ------------------------------------------------------------------ CSV
  // A cell is wrapped in quotes if it contains a comma, a quote or a line break, and quotes
  // inside it are doubled. (tastes_json is full of commas and quotes, so this matters.)
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // Pure: records in, text out. (Separate from the download so tests can check it.)
  logger.buildCSV = function (records) {
    var lines = [COLUMNS.join(',')];
    records.forEach(function (r) {
      lines.push(COLUMNS.map(function (c) { return csvCell(r[c]); }).join(','));
    });
    return lines.join('\r\n') + '\r\n';
  };

  function download(filename, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);          // some browsers ignore clicks on links that aren't in the page
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // Downloads doomscroll_<session_id>.csv. Returns the file name (handy for a "Saved" message),
  // or null if the log is sealed (see below).
  logger.exportCSV = function () {
    if (sealed()) return null;
    logger.flushPending();
    var name = 'doomscroll_' + logger.sessionId + '.csv';
    download(name, logger.buildCSV(store));
    return name;
  };

  // The log holds every person's HIDDEN tastes, so it stays sealed while a game is being played.
  // Otherwise a curious student could dump it from the browser console in the middle of a round
  // and read the answers. It opens once the results screen is up, which is also the only place
  // the Download button lives.
  function sealed() {
    return context.phase === 'tutorial1' || context.phase === 'tutorial2' || context.phase === 'main';
  }

  // ------------------------------------------------------------------ Inspection
  logger.COLUMNS = COLUMNS;
  logger.counts = function () { return { pending: pending.length, stored: store.length }; };
  logger.stored = function () { return sealed() ? [] : store.slice(); };   // a copy: nobody edits the archive
  logger.reset = function () {                                 // for tests
    pending.length = 0; store.length = 0;
    context.phase = 'title'; context.round = 0;
    logger.sessionId = makeSessionId();
  };

  // If the tab is closed or navigated away, hand over what we have. (Does nothing visible today;
  // it is where a future server upload gets its last chance to send the final batch.)
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', function () { logger.flushPending(); });
  }

  DS.logger = logger;
})();
