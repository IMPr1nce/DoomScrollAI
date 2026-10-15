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
 * Privacy: a session id is a random code, and nothing in the rows is about the person playing:
 * the data describes what the pretend people did. The player's name (asked on the first screen)
 * only names the downloaded files, so the rows stay anonymous and a future server never gets it.
 *
 * One session = one player, from the name screen to "Log out". It saves one file per part of the
 * session: Kai_Moreno_tutorial.csv, Kai_Moreno_round1.csv, Kai_Moreno_round2.csv... (see files()).
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};

  // The column order is the CSV header AND the field names a future server will receive.
  // The first 11 are the agreed fields. The rest are extras that make the data usable:
  //   round_no        1, 2, 3... for each main round (0 = tutorials). Rounds in one sitting share a session.
  //   round_time_sec  seconds of real play since the round started. timestamp_ms keeps ticking
  //                   during a pause; this doesn't, so "first half vs second half" is exact.
  //   detail          one extra word: push -> the reaction type (liked, disliked, fatigued, hooked,
  //                   lowAttention, afk); watch_end -> complete | interrupted; afk -> skip | idle;
  //                   round_start / round_end -> (end only) why the round ended: time_up | all_afk;
  //                   pause -> button | tab_hidden | key.
  //   post_no         which of this person's posts the row is about: 1, 2, 3... A push and its watch_end share
  //                   it, so they can be paired up. Counts again from 1 each round (and each "Try again").
  //   clock_time      timestamp_ms as a person reads it (15:28:44, the laptop's time). A spreadsheet shows
  //                   timestamp_ms as 1.79E+12.
  //   taste_sports... tastes_json split into one number per topic, so a spreadsheet can sort and chart them:
  //                   a line chart of taste_sports across a round shows the filter bubble forming.
  // New columns go at the END only, so code that reads the first ones by position keeps working.
  var COLUMNS = [
    'session_id', 'timestamp_ms', 'phase', 'vp_id', 'event', 'topic', 'liked',
    'attention_before', 'attention_after', 'fatigue_mult', 'tastes_json',
    'round_no', 'round_time_sec', 'detail',
    'post_no', 'clock_time'
  ].concat(DS.TOPIC_IDS.map(function (id) { return 'taste_' + id; }));

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
    now: function () { return Date.now(); }   // replaceable, so tests can use a fake clock
  };

  var session = { id: makeSessionId() };
  // A getter, not a plain value: play mode freezes the logger, and "Log out" still has to start a new id.
  Object.defineProperty(logger, 'sessionId', { enumerable: true, get: function () { return session.id; } });

  var context = { phase: 'title', round: 0 };  // stamped onto every record; game.js keeps it current
  var player = { first: '', last: '' };        // names the CSV files only (see fileName below)
  var pending = [];                            // logged, but not yet handed to flush()
  var store = [];                              // flushed: exactly what the CSV files hold
  var savedRows = {};                          // file part -> how many of its rows were in its last download

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

  // 15:28:44, in the laptop's own time zone (the teacher reads it next to the class schedule).
  function clockTime(ms) {
    function two(n) { return (n < 10 ? '0' : '') + n; }
    var d = new Date(ms);
    return two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
  }

  // One flat object per event. `f` uses the same field names a VP event has (see vp.js _emit).
  function makeRecord(f) {
    var now = logger.now();
    var rec = {
      session_id: session.id,
      timestamp_ms: now,
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
      detail: f.detail || '',
      post_no: f.postNo || '',
      clock_time: clockTime(now)
    };
    DS.TOPIC_IDS.forEach(function (id) { rec['taste_' + id] = f.tastes ? round(f.tastes[id], 3) : ''; });
    return rec;
  }

  // A VP tells us about pushes, the end of a watch, and leaving. (Its speech-bubble
  // 'message' events are just decoration, so they aren't data.)
  function fromVPEvent(e) {
    var detail = '';
    if (e.event === 'push' || e.event === 'watch_end') detail = e.category || '';
    else if (e.event === 'afk') detail = e.reason || '';
    else return null;
    return makeRecord({
      event: e.event, vpId: e.vpId, t: e.t, topic: e.topic, postNo: e.postNo, liked: e.liked,
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
  // each round, and files() calls it too, so a download is never missing recent events.
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

  // Replaceable, like now(), so the tests can see which files would be saved without a page.
  logger.download = function (filename, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);          // some browsers ignore clicks on links that aren't in the page
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  // ------------------------------------------------------------------ The files' names
  // The teacher collects the files per student, so they are named after the player: Kai_Moreno_round1.csv.
  // A name is typed by a 13-year-old, so it is cleaned for every system's file names: characters that
  // Windows or macOS refuse (/ \ : * ? " < > |) go, spaces inside a name become "-" (the "_" is kept
  // between first and last), leading dots go (they would hide the file on a Mac), and it's cut at
  // NAME_MAX characters so the file names stay short. Letters in any language stay.
  var NAME_MAX = 20;
  logger.cleanName = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[\\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
      .trim().replace(/\s+/g, '-').replace(/-{2,}/g, '-')
      .replace(/^[.\-]+/, '')
      .slice(0, NAME_MAX)
      .replace(/[.\-]+$/, '');
  };
  logger.NAME_MAX = NAME_MAX;

  // game.js calls this once the first screen is filled in. Both names are needed, or the files
  // keep their anonymous names.
  logger.setPlayer = function (first, last) {
    player.first = logger.cleanName(first);
    player.last = logger.cleanName(last);
  };

  // Kai_Moreno_round1.csv, or doomscroll_<session_id>_round1.csv when there is no name (the tests, and the
  // dev helpers, which can start a round without the first screen). `part` is 'tutorial', 'round1', 'round2'...
  logger.fileName = function (part) {
    var base = player.first && player.last ? player.first + '_' + player.last : 'doomscroll_' + session.id;
    return base + (part ? '_' + part : '') + '.csv';
  };

  // Which file a row belongs in: every tutorial run (including "Try again" and a replay after a round) goes
  // in one tutorial file, and each round of the game gets its own, so "Play again" never mixes two rounds.
  function partOf(rec) {
    return rec.phase === 'main' ? 'round' + rec.round_no : 'tutorial';
  }

  // The session's files, in the order they were played: [{ part, name, records }]. Empty while sealed.
  logger.files = function () {
    if (sealed()) return [];
    logger.flushPending();
    var byPart = {}, files = [];
    store.forEach(function (rec) {
      var part = partOf(rec);
      if (!byPart[part]) {
        byPart[part] = { part: part, name: logger.fileName(part), records: [] };
        files.push(byPart[part]);
      }
      byPart[part].records.push(rec);
    });
    return files;
  };

  function save(files) {
    files.forEach(function (f) {
      logger.download(f.name, logger.buildCSV(f.records));
      savedRows[f.part] = f.records.length;
    });
    return files.map(function (f) { return f.name; });
  }
  // A file has news when it has rows its last download didn't (a new round, or a tutorial replay).
  function unsaved(files) {
    return files.filter(function (f) { return f.records.length > (savedRows[f.part] || 0); });
  }

  // The Download button: saves every file with new rows, plus the latest one even if it was saved already
  // (so pressing the button again always gives the student their file). Returns the file names, or null
  // if the log is sealed (see below). Several files at once can make Chrome ask "download multiple files?".
  logger.exportCSV = function () {
    if (sealed()) return null;
    var files = logger.files();
    var toSave = unsaved(files);
    var latest = files[files.length - 1];
    if (latest && toSave.indexOf(latest) === -1) toSave.push(latest);
    return save(toSave);
  };

  // "Log out": saves only the files with new rows, so nothing the student played is lost and nothing
  // already downloaded is downloaded twice. Returns the file names, or null if sealed.
  logger.saveUnsaved = function () {
    if (sealed()) return null;
    return save(unsaved(logger.files()));
  };

  // The log holds every person's HIDDEN tastes, so it stays sealed while a game is being played.
  // Otherwise a curious student could dump it from the browser console in the middle of a round
  // and read the answers. It opens once the results screen is up, which is also the only place
  // the Download button lives.
  function sealed() {
    return context.phase === 'tutorial1' || context.phase === 'main';
  }

  // ------------------------------------------------------------------ Inspection
  logger.COLUMNS = COLUMNS;
  logger.counts = function () { return { pending: pending.length, stored: store.length }; };
  logger.stored = function () { return sealed() ? [] : store.slice(); };   // a copy: nobody edits the archive
  // A new session for the next player: a fresh id, an empty log, no name. "Log out" calls it (after
  // saveUnsaved), and so do the tests.
  logger.reset = function () {
    pending.length = 0; store.length = 0;
    Object.keys(savedRows).forEach(function (k) { delete savedRows[k]; });
    context.phase = 'title'; context.round = 0;
    player.first = ''; player.last = '';
    session.id = makeSessionId();
  };

  // If the tab is closed or navigated away, hand over what we have. (Does nothing visible today;
  // it is where a future server upload gets its last chance to send the final batch.)
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', function () { logger.flushPending(); });
  }

  DS.logger = logger;
})();
