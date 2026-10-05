/*
 * tests/e2e.js — end-to-end check of the REAL game in a real (headless) Chrome, opened from
 * file:// exactly like a teacher's double-click.
 *
 *     node tests/e2e.js
 *
 * Optional. The game needs none of this. Run it after tuning config.js or editing content.js, to
 * confirm the whole thing still works: the screens fit a laptop, the results text is sane, the
 * lessons' loopholes are still closed, and the CSV is well-formed. It prints PASS/FAIL per check
 * and exits with code 1 if anything fails. Takes about 30-60 seconds.
 *
 * Needs: Node 22+ (it uses Node's built-in WebSocket and fetch, so there is nothing to install)
 * and Google Chrome. If Chrome isn't found automatically, set CHROME_PATH to its executable.
 *
 * How it works: it starts Chrome with a debugging port, then talks to it with the Chrome DevTools
 * Protocol: "open this page", "run this JavaScript in it", "take a screenshot".
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var spawn = require('child_process').spawn;

var ROOT = 'file://' + (process.platform === 'win32' ? '/' : '') + path.join(__dirname, '..').replace(/\\/g, '/') + '/';
var PORT = 9300 + Math.floor(Math.random() * 90);

// ------------------------------------------------------------------ Find Chrome
function findChrome() {
  var candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ];
  for (var i = 0; i < candidates.length; i++) if (candidates[i] && fs.existsSync(candidates[i])) return candidates[i];
  return null;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ------------------------------------------------------------ Tiny DevTools driver
async function startChrome(chromePath) {
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'doomscroll-e2e-'));
  var proc = spawn(chromePath, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--no-first-run', '--disable-gpu', '--window-size=1366,768', 'about:blank'], { stdio: 'ignore' });
  for (var i = 0; i < 80; i++) {
    try { if ((await fetch('http://127.0.0.1:' + PORT + '/json/list')).ok) break; } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  return { proc: proc, profile: profile };
}

async function connect() {
  var list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
  var page = list.filter(function (t) { return t.type === 'page'; })[0];
  var ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(function (res, rej) { ws.onopen = res; ws.onerror = rej; });

  var nextId = 0, waiting = {}, listeners = [], problems = [];
  ws.onmessage = function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && waiting[m.id]) { var w = waiting[m.id]; delete waiting[m.id]; m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); return; }
    // Anything the page complains about is a failure: uncaught errors, console.error, files that failed to load.
    if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + ((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + m.params.args.map(function (a) { return a.value || a.description; }).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('load error: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    listeners.slice().forEach(function (l) { l(m); });
  };
  function send(method, params) {
    return new Promise(function (res, rej) { var id = ++nextId; waiting[id] = { res: res, rej: rej }; ws.send(JSON.stringify({ id: id, method: method, params: params || {} })); });
  }
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');

  return {
    problems: problems,
    viewport: function (w, h) { return send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); },
    goto: async function (url) {
      var loaded = new Promise(function (r) { var l = function (m) { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(l), 1); r(); } }; listeners.push(l); });
      await send('Page.navigate', { url: url }); await loaded; await sleep(300);
    },
    // Runs JavaScript in the page and returns its value (promises are awaited).
    eval: async function (expr) {
      var r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('page script failed: ' + ((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text));
      return r.result.value;
    },
    close: function () { try { ws.close(); } catch (e) { /* already closed */ } }
  };
}

// ----------------------------------------------------------------- Tiny reporter
var failures = 0;
function check(name, pass, detail) {
  if (!pass) failures++;
  console.log((pass ? 'PASS  ' : 'FAIL  ') + name + (pass ? '' : '\n        ' + detail));
}

// ===================================================================== The checks
async function main() {
  var chromePath = findChrome();
  if (!chromePath) { console.log('Chrome not found. Install it, or set CHROME_PATH to the Chrome executable.'); process.exit(2); }
  console.log('Using ' + chromePath + '\nOpening ' + ROOT + '\n');

  var chrome = await startChrome(chromePath);
  var b;
  try {
    b = await connect();
    await b.viewport(1366, 600);       // a 1366x768 laptop leaves about this much page height under Chrome's toolbars

    // ---- 1. The unit tests and the balance simulator, run from file://
    await b.goto(ROOT + 'tests.html'); await sleep(1500);
    var summary = await b.eval("document.getElementById('summary').textContent");
    check('tests.html: every test passes', /^(\d+) \/ \1 passed$/.test(summary), summary);

    await b.goto(ROOT + 'sim.html');
    await b.eval("document.getElementById('runs').value = 60; document.getElementById('run').click(); new Promise(function (r) { setTimeout(r, 4500); })");
    var goals = await b.eval("[].slice.call(document.querySelectorAll('ul.goals li')).map(function (l) { return l.textContent.trim(); })");
    check('sim.html: all balance goals pass', goals.length === 6 && goals.every(function (g) { return g.charAt(0) === '✔'; }), goals.join(' | '));

    // ---- 2. PLAY mode (what students get): the easy console doors are closed, and the game starts
    b.problems.length = 0;
    await b.goto(ROOT + 'index.html');
    var play = await b.eval("(function () {" +
      "var out = { screen: document.body.dataset.screen, hasCurrent: typeof DS.game.current, hasDev: typeof DS.dev };" +
      "var before = DS.CONFIG.ROUND_SEC; try { DS.CONFIG.ROUND_SEC = 1; } catch (e) {} out.configHeld = DS.CONFIG.ROUND_SEC === before;" +
      "try { DS.rng.use(function () { return 0; }); out.diceSwapped = true; } catch (e) { out.diceSwapped = false; }" +
      "document.getElementById('btn-start').click();" +
      "var hijacked = false; try { DS.logger.flush = function () { hijacked = true; }; } catch (e) {} DS.logger.flushPending();" +
      "out.logSealed = DS.logger.stored().length === 0 && DS.logger.exportCSV() === null; out.flushHeld = !hijacked; out.tutorial = document.body.dataset.screen;" +
      "return out; })()");
    check('play mode: no console handle to the live game or dev helpers', play.hasCurrent === 'undefined' && play.hasDev === 'undefined', JSON.stringify(play));
    check('play mode: settings and dice are frozen', play.configHeld && !play.diceSwapped, JSON.stringify(play));
    check('play mode: the log (it holds hidden tastes) is sealed and flush() cannot be hijacked', play.logSealed && play.flushHeld, JSON.stringify(play));
    check('play mode: the game still starts', play.tutorial === 'tutorial', JSON.stringify(play));
    check('play mode: no console errors', b.problems.length === 0, b.problems.join(' | '));

    // ---- 3. DEV mode: whole rounds with different robot players, through every results step
    b.problems.length = 0;
    await b.goto(ROOT + 'index.html?dev=1'); await sleep(400);
    var bots = ['learner', 'spam', 'none'];                       // 'none' = never click: the empty-data case
    for (var i = 0; i < bots.length; i++) {
      var bot = bots[i];
      var phase = await b.eval("DS.dev.play({ bot: '" + bot + "' })");
      check('round with the "' + bot + '" bot ends on the results screen', phase === 'reveal', phase);
      var steps = await b.eval("DS.dev.measureReveal()");
      check('  all 8 results steps fit a 600px-tall window (' + bot + ')', steps.length === 8 && steps.every(function (s) { return /fits$/.test(s); }), steps.join(' | '));
      // Every sentence on every step must be real text: no "undefined", "NaN", "null" or "[object".
      var texts = await b.eval("(async function () { var out = []; var st = [].slice.call(document.querySelectorAll('#reveal-steps .step'));" +
        "for (var k = 0; k < st.length; k++) { st[k].click(); await new Promise(function (r) { setTimeout(r, 250); }); out.push(document.getElementById('reveal-stage').innerText); } return out; })()");
      var bad = texts.filter(function (t) { return /undefined|NaN|null|\[object/.test(t); });
      check('  no "undefined" / "NaN" / "null" anywhere in the results text (' + bot + ')', bad.length === 0, bad.join(' ... ').slice(0, 300));
      if (bot !== 'none') {
        var verdict = await b.eval("(function () { var st = [].slice.call(document.querySelectorAll('#reveal-steps .step')); st[st.length - 1].click(); return document.querySelector('.big__verdict').textContent; })()");
        // A bot that shows people only what they like must be told feeds got narrow; never "mixed".
        if (bot === 'spam') check('  the spam bot is told its feeds were narrow (not "mixed")', /narrow|bubble/.test(verdict) && !/mixed/.test(verdict), verdict);
      }
    }

    // ---- 4. The CSV that the real Download button produces
    var csv = await b.eval("(async function () {" +
      "var name = null, blob = null, oc = URL.createObjectURL, ok = HTMLAnchorElement.prototype.click;" +
      "URL.createObjectURL = function (x) { blob = x; return oc.call(URL, x); }; HTMLAnchorElement.prototype.click = function () { name = this.download; };" +
      "var step = [].slice.call(document.querySelectorAll('#reveal-steps .step')); step[step.length - 1].click(); await new Promise(function (r) { setTimeout(r, 700); });" +
      "[].slice.call(document.querySelectorAll('button')).filter(function (x) { return x.textContent.indexOf('Download data') !== -1; })[0].click();" +
      "URL.createObjectURL = oc; HTMLAnchorElement.prototype.click = ok;" +
      "var text = await blob.text(); return { name: name, text: text, session: DS.logger.sessionId, columns: DS.logger.COLUMNS }; })()");
    var lines = csv.text.trim().split('\r\n');
    check('CSV: named doomscroll_<session_id>.csv', csv.name === 'doomscroll_' + csv.session + '.csv', csv.name);
    check('CSV: header is the agreed columns', lines[0] === csv.columns.join(','), lines[0]);
    check('CSV: has rows for pushes, round starts and round ends', ['push', 'round_start', 'round_end'].every(function (e) { return lines.some(function (l) { return l.split(',')[4] === e; }); }), 'missing an event type');
    check('CSV: one session id on every row', lines.slice(1).every(function (l) { return l.split(',')[0] === csv.session; }), 'mixed session ids');

    // ---- 5. Loopholes: frantic clicks, the pause state machine, stale timers
    var loop = await b.eval("(async function () {" +
      "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      "var btn = function (t) { return [].slice.call(document.querySelectorAll('button')).filter(function (x) { return x.textContent.trim() === t; })[0]; };" +
      "var press = function (t) { var x = btn(t); if (x) x.click(); return !!x; };" +      // never throws: a missing button fails a check, not the run
      "var title = function () { return document.getElementById('overlay').hidden ? '' : document.getElementById('overlay-title').textContent; };" +
      "var out = {};" +
      // a fresh round, "ready?" card up
      "DS.game.startMain(); await sleep(60);" +
      "press('Go!'); await sleep(60); out.earlyGoIgnored = DS.game.current().frozen === true;" +        // click guard
      "DS.game.resume(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await sleep(80);" +
      "out.readyCardSurvivesResumeAndEsc = DS.game.current().frozen === true && DS.game.current().elapsed === 0 && title() === 'Keep everyone scrolling';" +
      "await sleep(600); press('Go!'); await sleep(100); out.goLaterWorks = DS.game.current().frozen === false;" +
      "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await sleep(80);" +
      "out.escPauses = DS.game.current().paused === true && title() === 'Paused';" +
      "var frozenAt = DS.game.current().elapsed; await sleep(500); out.pausedTimeStands = DS.game.current().elapsed === frozenAt;" +
      // with the pause pop-up up, the page behind it is inert: Pause can't even take focus
      "document.getElementById('btn-pause').focus();" +
      "out.focusTrapped = document.getElementById('app').inert === true && document.activeElement !== document.getElementById('btn-pause');" +
      "await sleep(600); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await sleep(80);" +
      "out.escResumes = DS.game.current().paused === false && DS.game.current().frozen === false;" +
      // double-click on a topic button must push once when the first is liked
      "DS.rng.use(function () { return 0; }); var b0 = DS.game.current().cards[0].el.querySelector('.topic-btn'); b0.click(); b0.click(); DS.rng.reset();" +
      "out.doubleClickPushesOnce = DS.game.current().vps[0].history.length === 1;" +
      // end the round, try to pause, then restart inside the 'Time's up!' window: the stale timer must be dropped
      "var r = DS.game.current(); r.elapsed = DS.CONFIG.ROUND_SEC - 0.2; r.vps.forEach(function (v) { v.clock = r.elapsed; }); await sleep(900);" +
      "document.getElementById('btn-pause').click(); out.noPauseAfterEnd = r.paused === false;" +
      "DS.game.startMain(); await sleep((DS.CONFIG.ROUND_END_DELAY_SEC + 0.9) * 1000);" +
      "out.staleTimerDropped = document.body.dataset.screen === 'main' && title() === 'Keep everyone scrolling';" +
      // results screen: an early click is ignored, a later one works
      "await DS.dev.play({ bot: 'learner' }); DS.ui.armGuard(); press('See what happened →'); await sleep(30);" +
      "out.earlyResultsClickIgnored = document.getElementById('reveal-progress').textContent === '1 of 8';" +
      "await sleep(600); press('See what happened →'); await sleep(60); out.laterResultsClickWorks = document.getElementById('reveal-progress').textContent === '2 of 8';" +
      "return out; })()");
    Object.keys(loop).forEach(function (k) { check('loophole: ' + k, loop[k] === true, k + ' was ' + loop[k]); });
    check('no console errors in the whole dev run', b.problems.length === 0, b.problems.join(' | '));
  } catch (e) {
    failures++;
    console.log('FAIL  the check run itself broke: ' + (e && e.stack || e));
  } finally {
    if (b) b.close();
    chrome.proc.kill();
    try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch (e) { /* temp folder; the OS will clean it */ }
  }

  console.log('\n' + (failures ? failures + ' check(s) FAILED' : 'All checks passed'));
  process.exit(failures ? 1 : 0);
}

main();
