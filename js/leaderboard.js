/*
 * leaderboard.js — every round played on this laptop, ranked by points.
 *
 * The rows live in data/leaderboard/leaderboard.csv (see js/datafolder.js), one per round:
 *
 *   gamer_tag, points, round_no, version, played_at
 *   ZebraKing, 176,    1,        radar-interests/2, 2026-10-17 10:42
 *
 * Points = everyone's attention when the round ended, added up (someone who left counts 0), so with 2
 * people it runs 0-200 (DS.metrics.points). The board is the game's own scoring said out loud: it rewards
 * only attention, which is exactly what the big-picture step then asks about.
 *
 * Privacy: the gamer tag is the only thing about the player here, and it is never in the game's data rows
 * (logger.js). The real name names the data folders, never this file. No session id either, so the board
 * can't be joined to anyone's data.
 *
 * Model code (no DOM), so the tests run it in Node. add() reads and writes the file through DS.dataFolder,
 * looked up when it runs; without a folder, the board only holds the rounds played since the page opened.
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var C = DS.CONFIG;

  var lb = {};
  lb.COLUMNS = ['gamer_tag', 'points', 'round_no', 'version', 'played_at'];
  lb.FOLDER = 'leaderboard';                     // data/leaderboard/
  lb.FILE = 'leaderboard.csv';

  // ------------------------------------------------------------------ Gamer tags
  // What the player typed, made safe to show and store: no control characters, single spaces, GAMER_TAG_MAX long.
  lb.cleanTag = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, C.GAMER_TAG_MAX).trim();
  };

  // false if the tag holds a word from DS.BLOCKED_TAG_WORDS (content.js). Kids spell around filters, so the
  // tag is lower-cased and look-alike digits read as letters ("sh1t"), then checked twice: squashed together
  // (spaces, dots and dashes gone) for the "anywhere" words, and split into words for the "whole" ones.
  var LOOKALIKE = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
  lb.tagAllowed = function (tag) {
    var plain = String(tag).toLowerCase().replace(/[013457@$!]/g, function (ch) { return LOOKALIKE[ch]; });
    var squashed = plain.replace(/[^a-z]/g, '');
    var words = plain.split(/[^a-z]+/);
    var blocked = DS.BLOCKED_TAG_WORDS || { anywhere: [], whole: [] };
    return !blocked.anywhere.some(function (w) { return squashed.indexOf(w) !== -1; }) &&
           !blocked.whole.some(function (w) { return words.indexOf(w) !== -1; });
  };

  // ------------------------------------------------------------------ Rows
  // 2026-10-17 10:42, in the laptop's own time, so a teacher can tell this period's rounds from the last.
  function stamp(ms) {
    function two(n) { return (n < 10 ? '0' : '') + n; }
    var d = new Date(ms);
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
  }

  // One round's row. `version` keeps rounds of different playtest versions apart: 4 people can reach 400 points.
  lb.entry = function (tag, points, roundNo, version, ms) {
    return { gamer_tag: lb.cleanTag(tag), points: Math.round(points), round_no: roundNo, version: version,
             played_at: stamp(ms === undefined ? Date.now() : ms) };
  };

  // ------------------------------------------------------------------ The file
  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  lb.buildCSV = function (rows) {
    return [lb.COLUMNS.join(',')].concat(rows.map(function (r) {
      return lb.COLUMNS.map(function (c) { return csvCell(r[c]); }).join(',');
    })).join('\r\n') + '\r\n';
  };

  // Reads the file back. A teacher may have opened it in a spreadsheet and deleted a row, or saved it with
  // different line endings, so this is forgiving: columns are found by their header, and a row without a
  // tag or with points that aren't a number is skipped rather than breaking the board.
  lb.parseCSV = function (text) {
    var lines = [], row = [], cell = '', inQ = false, s = String(text || '');
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (inQ) {
        if (ch === '"' && s.charAt(i + 1) === '"') { cell += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s.charAt(i + 1) === '\n') i++;
        row.push(cell); lines.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); lines.push(row); }
    if (!lines.length) return [];
    var head = lines[0].map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (cells) {
      var r = {};
      lb.COLUMNS.forEach(function (c) { var k = head.indexOf(c); r[c] = k === -1 ? '' : (cells[k] || '').trim(); });
      r.points = r.points === '' ? NaN : Number(r.points);
      r.round_no = r.round_no === '' ? '' : Number(r.round_no);
      return r;
    }).filter(function (r) { return r.gamer_tag && isFinite(r.points); });
  };

  // ------------------------------------------------------------------ Ranking
  // What the leaderboard step draws: the best LEADERBOARD_TOP rounds of this version, and where `mine` (the
  // round just played, one of `rows`) ranks. Higher points first; a tie keeps the earlier round higher, and
  // tied rounds share a rank (1, 2, 2, 4), so nobody is told they lost a tie.
  //   { top: [{ rank, row, mine }], mine: { rank, row, tied } | null, mineInTop, count }
  lb.view = function (rows, mine, version) {
    var same = rows.filter(function (r) { return r.version === version; });
    var order = same.map(function (r, i) { return { r: r, i: i }; })
                    .sort(function (a, b) { return b.r.points - a.r.points || a.i - b.i; })
                    .map(function (x) { return x.r; });
    function rankOf(r) { return 1 + order.filter(function (o) { return o.points > r.points; }).length; }
    var top = order.slice(0, C.LEADERBOARD_TOP).map(function (r) { return { rank: rankOf(r), row: r, mine: r === mine }; });
    var me = mine && order.indexOf(mine) !== -1 ? {
      rank: rankOf(mine), row: mine,
      tied: order.some(function (o) { return o !== mine && o.points === mine.points; })
    } : null;
    return { top: top, mine: me, mineInTop: top.some(function (t) { return t.mine; }), count: order.length };
  };

  // ------------------------------------------------------------------ Adding a round
  // The rounds of this page visit, for when there is no data folder (or it couldn't be read).
  var memory = [];

  // value-or-promise, as in logger.js: the tests replace the file functions with plain ones.
  function when(x, fn) { return x && typeof x.then === 'function' ? x.then(fn) : fn(x); }

  // Replaceable, so the tests can stand in for the folder. readFile gives the text, or null if there is no file yet.
  lb.hasFolder = function () { return !!(DS.dataFolder && DS.dataFolder.ready()); };
  lb.readFile = function () { return DS.dataFolder.read(lb.FOLDER, lb.FILE); };
  lb.writeFile = function (text) { return DS.dataFolder.write(lb.FOLDER, lb.FILE, text); };

  // Adds one round to the board and saves it. Reads the file first, so rounds from earlier sessions (and other
  // students on this laptop) are all there, and a row the teacher deleted stays deleted.
  // Returns (or promises) { view, saved }: saved is 'folder', 'memory' (no folder) or 'failed'.
  lb.add = function (entry, version) {
    function inMemory(saved) {
      memory.push(entry);
      return { view: lb.view(memory, entry, version), saved: saved };
    }
    if (!lb.hasFolder()) return inMemory('memory');
    var result;
    try {
      result = when(lb.readFile(), function (text) {
        var rows = lb.parseCSV(text);
        rows.push(entry);
        return when(lb.writeFile(lb.buildCSV(rows)), function () {
          return { view: lb.view(rows, entry, version), saved: 'folder' };
        });
      });
    } catch (e) { return inMemory('failed'); }
    // The folder can disappear or lose its permission. The round still shows on the board, honestly marked.
    return result && typeof result.then === 'function' ? result.then(null, function () { return inMemory('failed'); }) : result;
  };

  // Forget this visit's rounds (the tests).
  lb.resetMemory = function () { memory.length = 0; };

  DS.leaderboard = lb;
})();
