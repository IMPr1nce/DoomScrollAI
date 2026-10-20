/*
 * datafolder.js — the game's "data" folder on this laptop, where every CSV is saved.
 *
 *   data/
 *     Kai_Moreno/            one folder per player (logger.js): Kai_Moreno_tutorial.csv, Kai_Moreno_round1.csv...
 *     leaderboard/           leaderboard.csv (leaderboard.js)
 *
 * A web page can't write to the disk by itself, so the saving program does it: server.py, started once per
 * laptop with `python3 server.py`. It also serves the game (http://localhost:8765), so this page and the saving
 * program share one origin and every call below is a plain same-site fetch. No folder picker, no download,
 * no browser prompt: the files land in the data folder next to server.py.
 *
 * The four calls match server.py's four endpoints one to one. The logger and the leaderboard only ever use
 * write, read and exists (through their own replaceable functions), so the unit tests never need the server.
 *
 * Browser-only (it has nothing to do in Node), but it never touches the page: game.js does that.
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var C = DS.CONFIG;

  var folder = {};
  folder.DATA_DIR = 'data';
  // Where to open the game when the page came from a double-click (file://), which can't reach the saving
  // program. server.py's DEFAULT_PORT.
  folder.URL = 'http://localhost:8765';

  var up = false;                 // the saving program answered the last check()

  // Only a page the saving program served can talk to it. Opened from a file, the page has no server to ask.
  folder.supported = function () { return /^https?:$/.test(window.location.protocol); };
  folder.ready = function () { return up; };

  // GET or POST one endpoint and hand back its JSON. Rejects on any failure: no answer (the program isn't
  // running), a refusal (4xx/5xx), or no answer within SAVE_TIMEOUT_SEC (so "Saving your files…" can't hang).
  function call(method, endpoint, params, body) {
    var url = '/api/' + endpoint + (params ? '?' + Object.keys(params).map(function (k) {
      return k + '=' + encodeURIComponent(params[k]);
    }).join('&') : '');
    var stop = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = stop ? setTimeout(function () { stop.abort(); }, C.SAVE_TIMEOUT_SEC * 1000) : null;
    var init = { method: method, cache: 'no-store', signal: stop ? stop.signal : undefined };
    if (body) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    return fetch(url, init).then(function (res) {
      if (!res.ok) throw new Error('The saving program said ' + res.status + ' to ' + endpoint);
      return res.json();
    }).then(function (answer) {
      clearTimeout(timer);
      return answer;
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  // Is the saving program running? Resolves true or false, never rejects. The name screen asks each time it
  // opens and again on Continue, so a program that stopped is caught before the next student plays.
  folder.check = function () {
    if (!folder.supported()) { up = false; return Promise.resolve(false); }
    return call('GET', 'health').then(function (answer) {
      up = !!(answer && answer.ok);
      return up;
    }, function () {
      up = false;
      return false;
    });
  };

  // Write a whole file (replacing it). server.py writes a temporary file and renames it over the old one, so
  // a half-written CSV never replaces a good one.
  folder.write = function (dirName, fileName, text) {
    return call('POST', 'write', null, { folder: dirName, file: fileName, text: text }).then(function () {});
  };

  // The file's text, or null if it isn't there yet.
  folder.read = function (dirName, fileName) {
    return call('GET', 'read', { folder: dirName, file: fileName }).then(function (answer) { return answer.text; });
  };

  folder.exists = function (dirName, fileName) {
    return call('GET', 'exists', { folder: dirName, file: fileName }).then(function (answer) { return !!answer.exists; });
  };

  DS.dataFolder = folder;
})();
