/*
 * tests/e2e.js — end-to-end check of the REAL game in a real (headless) Chrome, served by the real saving
 * program (server.py), exactly as in class.
 *
 *     node tests/e2e.js
 *
 * Optional. The game needs none of this. Run it after tuning config.js or editing content.js, to
 * confirm the whole thing still works: the screens fit a laptop, the results text is sane, the
 * lessons' loopholes are still closed, and the CSV files land on disk, well-formed. It prints PASS/FAIL per
 * check and exits with code 1 if anything fails. Takes about 2-3 minutes.
 *
 * Needs: Node 22+ (it uses Node's built-in WebSocket and fetch, so there is nothing to install),
 * Python 3 (for server.py; set PYTHON if it isn't called python3) and Google Chrome. If Chrome isn't found
 * automatically, set CHROME_PATH to its executable.
 *
 * How it works: it starts server.py on a free port with a temporary data folder (the real data/ is never
 * touched), then Chrome with a debugging port, and talks to Chrome with the Chrome DevTools Protocol: "open
 * this page", "run this JavaScript in it". The CSV files are then read straight from the temporary folder.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var net = require('net');
var http = require('http');
var path = require('path');
var spawn = require('child_process').spawn;

var PROJECT = path.join(__dirname, '..');
var FILE_ROOT = 'file://' + (process.platform === 'win32' ? '/' : '') + PROJECT.replace(/\\/g, '/') + '/';   // a double-click
var PORT = 9300 + Math.floor(Math.random() * 90);    // Chrome's debugging port
var DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'doomscroll-data-'));
var SERVER_PORT = 0, ROOT = '';                      // set once a free port is found (main)
var PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

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

// ------------------------------------------------------------ The saving program
// A port nobody is using: the OS hands one out, and we give it straight back to server.py.
function freePort() {
  return new Promise(function (res, rej) {
    var probe = net.createServer();
    probe.on('error', rej);
    probe.listen(0, '127.0.0.1', function () { var p = probe.address().port; probe.close(function () { res(p); }); });
  });
}

// Starts server.py and waits until it answers. Its output is kept, so a check can read what it printed.
async function startServer(port) {
  var proc = spawn(PYTHON, [path.join(PROJECT, 'server.py'), '--port', String(port), '--data', DATA], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.output = '';
  proc.stdout.on('data', function (d) { proc.output += d; });
  proc.stderr.on('data', function (d) { proc.output += d; });
  proc.done = new Promise(function (r) { proc.on('exit', function (code) { proc.exitCode = code; r(code); }); });
  for (var i = 0; i < 80 && proc.exitCode === null; i++) {
    try { if ((await fetch('http://127.0.0.1:' + port + '/api/health')).ok) return proc; } catch (e) { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('server.py did not start: ' + proc.output);
}
async function stopServer(proc) {
  if (proc && proc.exitCode === null) { proc.kill(); await proc.done; }
}

// One raw request to the saving program, with exactly the headers given (fetch won't let a test set Host).
// Resolves { status, body }.
function raw(method, urlPath, headers, body) {
  return new Promise(function (res, rej) {
    // A browser always says how long the body is (server.py refuses a body without it), so this does too.
    var length = body === undefined ? {} : { 'Content-Length': Buffer.byteLength(body) };
    var req = http.request({ host: '127.0.0.1', port: SERVER_PORT, method: method, path: urlPath,
      headers: Object.assign({ Host: 'localhost:' + SERVER_PORT }, length, headers) }, function (r) {
      var chunks = [];
      r.on('data', function (c) { chunks.push(c); });
      r.on('end', function () { res({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }); });
    });
    req.on('error', rej);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// Every file under the temporary data folder, as "Folder/file.csv" (hidden ones too: a leftover temp file
// would show up here).
function dataFiles() {
  var out = [];
  fs.readdirSync(DATA).forEach(function (d) {
    var dir = path.join(DATA, d);
    if (fs.statSync(dir).isDirectory()) fs.readdirSync(dir).forEach(function (f) { out.push(d + '/' + f); });
    else out.push(d);
  });
  return out.sort();
}
function readData(rel) { return fs.readFileSync(path.join(DATA, rel), 'utf8'); }
// Kai_Moreno_round2.csv before Kai_Moreno_round10.csv
function byRound(a, b) { return a.localeCompare(b, undefined, { numeric: true }); }

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

  var nextId = 0, waiting = {}, listeners = [], problems = [], downloads = [];
  ws.onmessage = function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && waiting[m.id]) { var w = waiting[m.id]; delete waiting[m.id]; m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); return; }
    // Anything the page complains about is a failure: uncaught errors, console.error, files that failed to load.
    if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + ((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + m.params.args.map(function (a) { return a.value || a.description; }).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('load error: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    // Nothing may ever download: Chrome reports any attempt here, even one the page hid from the checks' own catcher.
    if (m.method === 'Page.downloadWillBegin' || m.method === 'Browser.downloadWillBegin') downloads.push(m.params.suggestedFilename);
    listeners.slice().forEach(function (l) { l(m); });
  };
  function send(method, params) {
    return new Promise(function (res, rej) { var id = ++nextId; waiting[id] = { res: res, rej: rej }; ws.send(JSON.stringify({ id: id, method: method, params: params || {} })); });
  }
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  // ...and should one start anyway, Chrome refuses it instead of filling the Downloads folder.
  try { await send('Page.setDownloadBehavior', { behavior: 'deny' }); } catch (e) { /* older Chrome: the listener still counts */ }

  return {
    problems: problems,
    downloads: downloads,
    viewport: function (w, h) { return send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); },
    // e.g. [{ name: 'prefers-reduced-motion', value: 'reduce' }]; [] turns it back off
    media: function (features) { return send('Emulation.setEmulatedMedia', { features: features }); },
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

// Plays the tutorial's words in the page that is open: the intro chain; step 1 finished by putting every topic in
// the log (no need to wait out each watch), which brings the pop-ups between the steps; step 2 finished the same
// way, which brings the win pop-up; then a fresh Alex left alone until they leave. Returns every title and text,
// so each version can be checked for what it says and what it must never say.
var TUTORIAL_TEXTS = "(async function () {" +
  "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
  "var ov = document.getElementById('overlay'), t = function () { return document.getElementById('overlay-title').textContent; }, x = function () { return document.getElementById('overlay-text').textContent; };" +
  "var chain = async function () { var out = []; while (!ov.hidden && out.length < 8) { out.push({ title: t(), text: x() }); await sleep(650); document.querySelector('#overlay-buttons button').click(); } await sleep(100); return out; };" +
  "var head = function () { return document.getElementById('tut-step').textContent + ' | ' + document.getElementById('tut-text').textContent + ' | ' + document.getElementById('tut-goal').textContent; };" +
  "var out = {}; DS.game.startTutorial1(); await sleep(150); out.intro = await chain(); out.head1 = head();" +
  "var vp = DS.game.current().vps[0]; DS.TOPIC_IDS.forEach(function (id, k) { vp.history.push({ topic: id, liked: k % 2 === 0, t: vp.clock }); });" +
  "await sleep(1200); out.between = await chain(); out.head2 = head();" +
  "for (var k = 0; k < DS.CONFIG.TUTORIAL_EXPLOIT_STREAK; k++) vp.history.push({ topic: 'music', liked: true, t: vp.clock });" +
  "await sleep(1800); out.win = { title: t(), text: x() };" +
  "DS.game.startTutorial1(); await sleep(150); await chain();" +
  "DS.game.current().vps[0].attention = 0.2; await sleep(2000); out.left = { title: t(), text: x() };" +
  "out.all = out.intro.concat(out.between, [out.win, out.left]).map(function (p) { return p.title + ' ' + p.text; }).join(' ') + ' ' + out.head1 + ' ' + out.head2;" +
  "return out; })()";

// The name screen's status line once the saving program has answered.
var RUNNING = '✓ Saving program is running.';
var START_IT = 'Start the saving program first (ask your teacher).';

// Fills in the first screen (without pressing Continue).
function fillIn(first, last, grade, tag) {
  return "document.getElementById('name-first').value = " + JSON.stringify(first) + "; document.getElementById('name-last').value = " + JSON.stringify(last) + ";" +
    "document.getElementById('grade-8th').checked = false; document.getElementById('grade-other').value = '';" +
    (grade === '8th' ? "document.getElementById('grade-8th').checked = true;" : "document.getElementById('grade-other').value = " + JSON.stringify(grade) + ";") +
    "document.getElementById('gamer-tag').value = " + JSON.stringify(tag) + ";";
}
// Through the first screen, as a student would. Continue asks the saving program, so it waits for the answer.
function signIn(first, last, grade, tag) {
  return "(async function () { var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
    "for (var k = 0; k < 40 && document.getElementById('server-status').textContent !== " + JSON.stringify(RUNNING) + "; k++) await sleep(50);" +
    fillIn(first, last, grade, tag) + "document.getElementById('btn-name').click();" +
    "for (var j = 0; j < 40 && document.body.dataset.screen === 'name'; j++) await sleep(50);" +
    "return document.body.dataset.screen; })()";
}

// ===================================================================== The checks
async function main() {
  var chromePath = findChrome();
  if (!chromePath) { console.log('Chrome not found. Install it, or set CHROME_PATH to the Chrome executable.'); process.exit(2); }
  SERVER_PORT = await freePort();
  ROOT = 'http://localhost:' + SERVER_PORT + '/';
  var server;
  try { server = await startServer(SERVER_PORT); } catch (e) {
    console.log(e.message + '\nIs Python 3 installed? Set PYTHON to its command if it isn\'t called ' + PYTHON + '.');
    process.exit(2);
  }
  console.log('Using ' + chromePath + '\nOpening ' + ROOT + ' (server.py, saving to ' + DATA + ')\n');
  check('server.py: says on start where it saves and which address to open',
        server.output.indexOf('Saving to ' + DATA) !== -1 && server.output.indexOf('Open http://localhost:' + SERVER_PORT) !== -1, server.output);

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
    check('sim.html: all balance goals pass', goals.length >= 6 && goals.every(function (g) { return g.charAt(0) === '✔'; }), goals.join(' | '));

    // ---- 1a. Opened with a double-click (file://), the page can't reach the saving program: the name screen says
    // to start it and which address to open, and Continue stays put even with everything filled in.
    b.problems.length = 0;
    await b.goto(FILE_ROOT + 'index.html');
    var fromFile = await b.eval("(async function () { var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      "await sleep(200); var out = { status: document.getElementById('server-status').textContent };" +
      fillIn('Kai', 'Moreno', '8th', 'Kai the Kat') + "document.getElementById('btn-name').click(); await sleep(300);" +
      "out.screen = document.body.dataset.screen; out.error = document.getElementById('name-error').textContent; return out; })()");
    check('file://: the name screen says to start the saving program and open http://localhost:8765, and Continue is blocked',
          fromFile.status === START_IT + ' Then open http://localhost:8765.' && fromFile.screen === 'name' && fromFile.error === START_IT, JSON.stringify(fromFile));
    check('file://: no console errors (it doesn\'t even try to reach the saving program)', b.problems.length === 0, b.problems.join(' | '));

    // ---- 1b. The first screen asks who is playing: both names (a name that cleans to nothing counts as missing), a
    // grade (8th, or typed), a gamer tag (a few words refused), and checks the saving program. The name only names
    // the files, and a double-click on Continue can't land on Start.
    b.problems.length = 0;
    await b.goto(ROOT + 'index.html');
    var who = await b.eval("(async function () {" +
      "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      "var $ = function (id) { return document.getElementById(id); };" +
      "var first = $('name-first'), last = $('name-last'), go = $('btn-name'), g8 = $('grade-8th'), other = $('grade-other'), tag = $('gamer-tag');" +
      "var err = function () { return $('name-error').textContent; };" +
      "var out = { screen: document.body.dataset.screen, focused: document.activeElement === first, fits: document.documentElement.scrollHeight <= innerHeight," +
      "  serverStatus: $('server-status').textContent, folderButton: !!$('btn-folder') };" +
      "go.click(); await sleep(50); out.empty = { screen: document.body.dataset.screen, error: err(), invalid: first.getAttribute('aria-invalid') + ' ' + last.getAttribute('aria-invalid'), focused: document.activeElement === first };" +
      "first.value = '  Mary   Ann '; last.value = '???'; go.click(); await sleep(50);" +
      "out.junk = { screen: document.body.dataset.screen, invalid: first.getAttribute('aria-invalid') + ' ' + last.getAttribute('aria-invalid'), focused: document.activeElement === last };" +
      "last.value = \"O'Brien\"; go.click(); await sleep(50);" +
      "out.noGrade = { screen: document.body.dataset.screen, error: err(), marked: $('grade').classList.contains('grade--invalid'), focused: document.activeElement === g8 };" +
      "other.value = '7th'; other.dispatchEvent(new Event('input')); g8.click(); out.tickClears = other.value === '' && g8.checked;" +
      "other.value = 'High school'; other.dispatchEvent(new Event('input')); out.typeUnticks = !g8.checked; g8.click();" +
      "go.click(); await sleep(50); out.noTag = { error: err(), focused: document.activeElement === tag, invalid: tag.getAttribute('aria-invalid') };" +
      "tag.value = 'Sh1t Happens'; go.click(); await sleep(50); out.rude = err();" +
      "tag.value = 'Mango Tango'; go.click(); await sleep(300);" +
      "out.done = { screen: document.body.dataset.screen, error: err(), file: DS.logger.fileName(), folder: DS.logger.folderName(), startFocused: document.activeElement === $('btn-start') };" +
      "$('btn-start').click(); await sleep(50); out.doubleClickHeld = document.body.dataset.screen === 'title';" +
      "await sleep(600); $('btn-start').click(); await sleep(150); out.started = document.body.dataset.screen;" +
      "return out; })()");
    check('name screen: the game opens on it, with the first name ready to type, the saving program found (no folder button), and it fits',
          who.screen === 'name' && who.focused && who.fits && !who.folderButton && who.serverStatus === RUNNING, JSON.stringify(who));
    check('name screen: Continue with no name stays put, says why and marks both boxes',
          who.empty.screen === 'name' && who.empty.error === 'Type your first and last name.' && who.empty.invalid === 'true true' && who.empty.focused, JSON.stringify(who.empty));
    check('name screen: a last name of only "???" counts as missing',
          who.junk.screen === 'name' && who.junk.invalid === 'false true' && who.junk.focused, JSON.stringify(who.junk));
    check('name screen: a grade is needed (8th, or typed); ticking 8th clears a typed grade, and typing one unticks 8th',
          who.noGrade.screen === 'name' && who.noGrade.error === 'Tick 8th grade, or type your grade.' && who.noGrade.marked && who.noGrade.focused &&
          who.tickClears && who.typeUnticks, JSON.stringify([who.noGrade, who.tickClears, who.typeUnticks]));
    check('name screen: a gamer tag is needed, and a rude one is refused (even spelled with a 1)',
          who.noTag.error === 'Pick a gamer tag for the leaderboard.' && who.noTag.focused && who.noTag.invalid === 'true' &&
          who.rude === 'Pick a different gamer tag.', JSON.stringify([who.noTag, who.rude]));
    check('name screen: with the saving program running, everything leads to the title, files in Mary-Ann_O\'Brien/',
          who.done.screen === 'title' && who.done.error === '' &&
          who.done.file === "Mary-Ann_O'Brien.csv" && who.done.folder === "Mary-Ann_O'Brien" && who.done.startFocused, JSON.stringify(who.done));
    check('name screen: a double-click on Continue doesn\'t land on Start; a later click starts the tutorial',
          who.doubleClickHeld && who.started === 'tutorial', JSON.stringify(who));
    check('name screen: no console errors', b.problems.length === 0, b.problems.join(' | '));

    // ---- 2. PLAY mode (what students get): the easy console doors are closed, and the game starts
    b.problems.length = 0;
    await b.goto(ROOT + 'index.html');
    var play = await b.eval("(function () {" +
      "var out = { screen: document.body.dataset.screen, hasCurrent: typeof DS.game.current, hasDev: typeof DS.dev };" +
      "var before = DS.CONFIG.ROUND_SEC; try { DS.CONFIG.ROUND_SEC = 1; } catch (e) {} out.configHeld = DS.CONFIG.ROUND_SEC === before;" +
      "try { DS.rng.use(function () { return 0; }); out.diceSwapped = true; } catch (e) { out.diceSwapped = false; }" +
      "document.getElementById('btn-start').click();" +
      "var hijacked = false; try { DS.logger.flush = function () { hijacked = true; }; } catch (e) {} DS.logger.flushPending();" +
      "try { DS.leaderboard.add = function () {}; } catch (e) {} try { DS.dataFolder.write = function () {}; } catch (e) {}" +
      "out.boardHeld = Object.isFrozen(DS.leaderboard) && Object.isFrozen(DS.dataFolder);" +
      "out.logSealed = DS.logger.stored().length === 0 && DS.logger.saveUnsaved() === null; out.flushHeld = !hijacked; out.tutorial = document.body.dataset.screen;" +
      "return out; })()");
    check('play mode: no console handle to the live game or dev helpers', play.hasCurrent === 'undefined' && play.hasDev === 'undefined', JSON.stringify(play));
    check('play mode: settings and dice are frozen', play.configHeld && !play.diceSwapped, JSON.stringify(play));
    check('play mode: the log (it holds hidden tastes) is sealed and flush() cannot be hijacked', play.logSealed && play.flushHeld, JSON.stringify(play));
    check('play mode: the leaderboard and the data folder cannot be swapped out', play.boardHeld, JSON.stringify(play));
    check('play mode: the game still starts', play.tutorial === 'tutorial', JSON.stringify(play));
    check('play mode: no console errors', b.problems.length === 0, b.problems.join(' | '));

    // ---- 2b. The one tutorial, in two named steps. Step 1, explore: Alex's profile starts empty and every topic
    // has to be tried; each watched post adds a ring, a skip adds none. Step 2, exploit:
    // TUTORIAL_EXPLOIT_STREAK watches in a row. An intro chain comes first, one-time hints follow the first like and
    // skip, and the win pop-up offers the game or a replay. The round's radars still come filled in.
    b.problems.length = 0;
    await b.goto(ROOT + 'index.html?dev=1'); await sleep(300);
    var tut = await b.eval("(async function () {" +
      "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      "var out = { titles: [], texts: [] }; var ov = document.getElementById('overlay');" +
      "var slot = function (sel) { return document.querySelectorAll('#tut-card-slot ' + sel); };" +
      "var title = function () { return ov.hidden ? null : document.getElementById('overlay-title').textContent; };" +
      "var text = function () { return document.getElementById('overlay-text').textContent; };" +
      "var gotIt = async function () { if (!ov.hidden) { await sleep(650); document.querySelector('#overlay-buttons button').click(); await sleep(100); } };" +
      "var push = function (i, liked) { DS.rng.use(function () { return liked ? 0 : 0.999999; }); slot('.topic-btn')[i].click(); DS.rng.reset(); };" +
      "var counts = function () { return [].map.call(slot('.topic-btn__count'), function (c) { return c.textContent; }); };" +
      "var goal = function () { return document.getElementById('tut-goal').textContent; };" +
      "document.getElementById('btn-start').click(); await sleep(700);" +
      "var vp = DS.game.current().vps[0]; var before = vp.attention;" +
      // the guard ignores clicks for CLICK_GUARD_MS after a pop-up appears, hence the waits
      "var stillFrozen = true;" +
      "while (!ov.hidden && out.titles.length < 8) { out.titles.push(title()); out.texts.push(text()); stillFrozen = stillFrozen && vp.attention === before; document.querySelector('#overlay-buttons button').click(); await sleep(650); }" +
      "out.step1 = document.getElementById('tut-step').textContent; out.goal0 = goal(); out.frozenDuringIntro = stillFrozen;" +
      "out.blank = { spikes: slot('.radar__spike').length, counts: counts().join(' '), rings: slot('.radar__ring').length, profile: slot('.card--profile').length, interests: slot('.card--interests').length, stars: slot('.topic-btn__clue').length };" +
      // a watched post: Music grows one ring (a spike a fifth of the way out), says "✓1", and the profile shape appears
      "push(2, true); await sleep(50);" +
      "var sp = slot('.radar__spike')[0];" +
      "out.watched = { spikes: slot('.radar__spike').length, count: counts()[2], ring: sp ? Math.hypot(+sp.getAttribute('x2'), +sp.getAttribute('y2')) / DS.radar.R : null, shape: slot('.radar__profile').length, reaction: slot('.reaction').length };" +
      "out.goal1 = goal();" +
      "await sleep(1450); out.likeHint = title() + ' | ' + text(); await gotIt();" +
      "while (vp.state === 'watching') await sleep(50);" +
      // a skipped post: Sports gets no ring, just "✗1"
      "push(0, false); await sleep(50); out.skipped = { spikes: slot('.radar__spike').length, count: counts()[0] };" +
      "await sleep(1450); out.skipHint = title() + ' | ' + text(); await gotIt();" +
      "out.resumed = !DS.game.current().frozen;" +
      // the rest of step 1 (put in the log, so the test needn't wait out each watch): the pop-ups between the steps
      "DS.TOPIC_IDS.forEach(function (id) { vp.history.push({ topic: id, liked: true, t: vp.clock }); });" +
      "await sleep(1200); out.between = [];" +
      "while (!ov.hidden && out.between.length < 4) { out.between.push(title() + ' | ' + text()); await sleep(650); document.querySelector('#overlay-buttons button').click(); await sleep(100); }" +
      "out.step2 = document.getElementById('tut-step').textContent; out.goal2 = goal();" +
      // step 2: a skip ends a run, so two watches, a skip and two more watches are not enough...
      "var L = function () { vp.history.push({ topic: 'music', liked: true, t: vp.clock }); }; L(); L(); vp.history.push({ topic: 'sports', liked: false, t: vp.clock }); L(); L();" +
      "await sleep(1500); out.notYet = ov.hidden && DS.game.phase === 'tutorial1';" +
      // ...and one more makes three in a row
      "L(); await sleep(1800); out.win = title();" +
      "out.winButtons = [].map.call(document.querySelectorAll('#overlay-buttons button'), function (x) { return x.textContent; }).join(' | ');" +
      "await sleep(650); document.querySelectorAll('#overlay-buttons button')[1].click(); await sleep(300);" +
      "out.replayed = DS.game.phase === 'tutorial1' && title() === 'Meet Alex' && DS.game.current().vps[0].history.length === 0;" +
      "return out; })()");
    check('tutorial: four intro pop-ups first (attention, Alex\'s Interest radar, "Step 1: Explore"), and nothing moves behind them',
          tut.titles.join(' / ') === "Meet Alex / This is attention / This is Alex's Interest radar! / Step 1: Explore" && tut.frozenDuringIntro, JSON.stringify(tut.titles));
    check('tutorial: the radar pop-up says each post reveals what Alex likes; step 1 is named and defined as on the results',
          tut.texts[2] === 'Each post helps reveal what Alex likes. Watch the radar fill in as you learn more about them.' &&
          tut.texts[3].indexOf('Exploring = trying something new to learn more.') === 0,
          JSON.stringify(tut.texts));
    check('tutorial: step 1 says what it is and counts the topics tested ("Step 1 of 2 · Explore", "(0/6)")',
          tut.step1 === 'Step 1 of 2 · Explore' && tut.goal0 === 'Goal: test all 6 topics (0/6)', JSON.stringify([tut.step1, tut.goal0]));
    check('tutorial: Alex\'s profile starts empty: five rings, no spikes, every count "?", no bio star (the round\'s radars are filled in)',
          tut.blank.rings === 5 && tut.blank.spikes === 0 && tut.blank.counts === '? ? ? ? ? ?' && tut.blank.profile === 1 && tut.blank.interests === 0 && tut.blank.stars === 0,
          JSON.stringify(tut.blank));
    check('tutorial: a watched post adds one ring to that topic ("✓1"), draws the profile shape, and the goal counts it (1/6)',
          tut.watched.spikes === 1 && tut.watched.count === '✓1' && Math.abs(tut.watched.ring - 1 / 5) < 0.01 && tut.watched.shape === 1 &&
          tut.watched.reaction === 1 && /\(1\/6\)/.test(tut.goal1), JSON.stringify([tut.watched, tut.goal1]));
    check('tutorial: a skipped post adds no ring, just "✗1"', tut.skipped.spikes === 1 && tut.skipped.count === '✗1', JSON.stringify(tut.skipped));
    check('tutorial: the first watch and the first skip each get a hint, said as signals ("interested" / "not interested")',
          /^Alex watched it! \| That topic grew one ring/.test(tut.likeHint) && /"interested"/.test(tut.likeHint) &&
          /^Alex skipped it \| No ring/.test(tut.skipHint) && /"not interested"/.test(tut.skipHint) && tut.resumed, JSON.stringify([tut.likeHint, tut.skipHint]));
    check('tutorial: every topic tried brings "You explored!" (what Alex watched), then "Step 2: Exploit", defined as on the results',
          tut.between.length === 2 && /^You explored! \| Your tests are done\. Alex watched [^.]+\.( The skips were the price of finding out\.)?\nEvery new user starts empty/.test(tut.between[0]) &&
          tut.between[1].indexOf('Step 2: Exploit | Exploiting = showing what you know works.\nNow show only topics that passed your tests.') === 0, JSON.stringify(tut.between));
    check('tutorial: step 2 is named and counts watches in a row ("Step 2 of 2 · Exploit", "(0/3)")',
          tut.step2 === 'Step 2 of 2 · Exploit' && tut.goal2 === 'Goal: 3 watches in a row (0/3)', JSON.stringify([tut.step2, tut.goal2]));
    check('tutorial: a skip ends the run (2 watches, a skip, 2 watches is not enough); 3 in a row ends it with the game or a replay',
          tut.notYet && tut.win === 'You did it!' && tut.winButtons === 'Start the game | Replay the tutorial', JSON.stringify([tut.notYet, tut.win, tut.winButtons]));
    check('tutorial: "Replay the tutorial" starts it again from the first pop-up, with a fresh Alex', tut.replayed === true, String(tut.replayed));
    var words = await b.eval(TUTORIAL_TEXTS);
    check('tutorial: the win pop-up says what was done (explored, then exploited), then (the round\'s radars being filled in) that two people come next',
          /You explored: random topics tested what Alex likes\. Then you exploited what passed, to keep Alex on the app\./.test(words.win.text) &&
          /Now the radars come filled in\. Can you keep two people hooked\?/.test(words.win.text) && /leaves at 0/.test(words.win.text), words.win.text);
    check('tutorial: the "Alex left" pop-up says why (skips and waiting cost attention), with no talk of spikes',
          words.left.title === 'Alex left!' && /Each skip costs attention/.test(words.left.text) && !/spike/i.test(words.left.text), JSON.stringify(words.left));
    check('tutorial: says why first (you are the algorithm, keep Alex on the app), explores with random tests, exploits what passed',
          /^Alex just joined the app\. You are the algorithm: your job is to keep Alex on the app as long as possible\.$/.test(words.intro[0].text) &&
          /Push random topics as tests: does Alex watch, or skip\?/.test(words.intro[3].text) &&
          /^Step 1 of 2 · Explore \| You know nothing about Alex yet\. Push random topics to test them/.test(words.head1) &&
          /^Step 2 of 2 · Exploit \| You're the algorithm: show what passed your tests, so Alex stays as long as possible\./.test(words.head2),
          JSON.stringify([words.intro[0].text, words.intro[3].text, words.head1, words.head2]));
    check('tutorial: names both words, and no he/she anywhere', /Exploring =/.test(words.all) && /Exploiting =/.test(words.all) &&
          !/\b(he|she|him|her|his)\b/i.test(words.all), words.all.slice(0, 300));
    check('tutorial: no console errors', b.problems.length === 0, b.problems.join(' | '));

    // ---- 3. The radar board (the default: 2 people, radars showing each person's interests)
    // In three steps: skip the tutorials and measure the board; measure it again in a 1024x768 window
    // (a small laptop, or the preview pane); then start the round and push one liked post on the first
    // card. The round keeps running for the dev checks below.
    async function runBoard() {
      var out = await b.eval("(async function () {" +
        "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
        "document.getElementById('btn-start').click(); await sleep(150); document.getElementById('btn-skip').click(); await sleep(900);" +
        "var cards = [].slice.call(document.querySelectorAll('#main-grid .card'));" +
        "var rect = function (e) { return e.getBoundingClientRect(); };" +
        // kept on window so the later steps can call them again
        "window.__measure = function () { var overlaps = 0, outside = 0;" +
        "  cards.forEach(function (c) { var cr = rect(c); var bs = [].slice.call(c.querySelectorAll('.topic-btn')).map(rect);" +
        "    bs.forEach(function (r, i) { if (r.left < cr.left - 1 || r.right > cr.right + 1 || r.top < cr.top - 1 || r.bottom > cr.bottom + 1) outside++;" +
        "      bs.slice(i + 1).forEach(function (q) { var w = Math.min(r.right, q.right) - Math.max(r.left, q.left), h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top); if (w > 2 && h > 2) overlaps++; }); }); });" +
        "  return { overlaps: overlaps, outside: outside, fits: document.documentElement.scrollHeight <= innerHeight }; };" +
        // where the first card's spikes end (the radar's drawing), so we can tell whether it ever changes
        "window.__tips = function () { return [].slice.call(cards[0].querySelectorAll('.radar__spike')).map(function (l) { return l.getAttribute('x2') + ',' + l.getAttribute('y2'); }).join(' '); };" +
        "var out = { cards: cards.length, radarCards: document.querySelectorAll('#main-grid .card--radar').length, buttons: document.querySelectorAll('#main-grid .topic-btn').length," +
        "  stars: document.querySelectorAll('#main-grid .topic-btn__clue').length, counts: document.querySelectorAll('#main-grid .topic-btn__count').length," +
        "  allUnknown: [].slice.call(document.querySelectorAll('#main-grid .topic-btn__count')).every(function (c) { return c.textContent === '?'; })," +
        "  spikesAtStart: cards.map(function (c) { return c.querySelectorAll('.radar__spike').length; }), big: window.__measure() };" +
        // with all six topics known, spike k is topic k: each must be as long as that starting taste,
        // and the longest must point at one of the person's favorites
        "out.spikesMatchInterests = cards.every(function (c, i) { var vp = DS.game.current().vps[i];" +
        "  var lens = [].slice.call(c.querySelectorAll('.radar__spike')).map(function (l) { return Math.hypot(+l.getAttribute('x2'), +l.getAttribute('y2')) / DS.radar.R; });" +
        "  var top = DS.TOPIC_IDS[lens.indexOf(Math.max.apply(null, lens))];" +
        "  return lens.length === 6 && DS.VP_DEFS[i].favorites.indexOf(top) !== -1 &&" +
        "    lens.every(function (len, k) { return Math.abs(len - vp.tasteSnapshotStart[DS.TOPIC_IDS[k]]) < 0.01; }); });" +
        "out.aria = cards[0].querySelector('.topic-btn').getAttribute('aria-label');" +
        "return out; })()");
      await b.viewport(1024, 768); await sleep(300);
      out.small = await b.eval("window.__measure()");
      await b.viewport(1366, 600); await sleep(300);
      var after = await b.eval("(async function () {" +
        "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
        "await sleep(300); var ready = document.getElementById('overlay-text').textContent;" +
        "[].slice.call(document.querySelectorAll('button')).filter(function (x) { return x.textContent.trim() === 'Go!'; })[0].click(); await sleep(100);" +
        "var card = DS.game.current().cards[0].el, vp = DS.game.current().vps[0];" +
        "var before = window.__tips(); DS.rng.use(function () { return 0; }); card.querySelector('.topic-btn').click(); DS.rng.reset(); await sleep(50);" +
        "return { tastesMoved: JSON.stringify(vp.tastes) !== JSON.stringify(vp.tasteSnapshotStart), radarUnchanged: window.__tips() === before," +
        "  roundNamesWords: /explor|exploit/i.test(ready + ' ' + document.getElementById('screen-main').innerText)," +
        "  countAfterPush: card.querySelector('.topic-btn__count') ? card.querySelector('.topic-btn__count').textContent : null," +
        "  spikesAfterPush: card.querySelectorAll('.radar__spike').length }; })()");
      Object.keys(after).forEach(function (k) { out[k] = after[k]; });
      return out;
    }
    b.problems.length = 0;
    await b.goto(ROOT + 'index.html?dev=1'); await sleep(400);
    // Through the first screen, as a student would: the CSV files checked in section 5 are named after this player.
    await b.eval(signIn('Zebedee', 'Quimby', '8th', 'Zeb the Great'));
    await sleep(600);                    // the click guard on Start
    var radar = await runBoard();
    check('radar board: 2 people side by side, each with a radar of 6 buttons, that fits the window',
          radar.cards === 2 && radar.radarCards === 2 && radar.buttons === 12 && radar.big.fits, JSON.stringify(radar));
    check('radar board: no button overlaps another or sticks out of its card', radar.big.overlaps === 0 && radar.big.outside === 0, JSON.stringify(radar.big));
    check('radar board: a 1024x768 window fits too, with no overlaps (the narrow-button layout)',
          radar.small.fits && radar.small.overlaps === 0 && radar.small.outside === 0, JSON.stringify(radar.small));
    check('radar board: every radar shows its person\'s interests from the start, longest spike on a favorite (no stars, no counts)',
          radar.spikesAtStart.every(function (n) { return n === 6; }) && radar.spikesMatchInterests && radar.stars === 0 && radar.counts === 0, JSON.stringify(radar));
    check('radar board: screen readers get the interests in words', /^Show Sports to Maya\. They like it about \d times? in 10\.$/.test(radar.aria), radar.aria);
    check('radar board: the radar never changes during the round, though tastes drift (the narrowing stays hidden)',
          radar.tastesMoved && radar.radarUnchanged && radar.spikesAfterPush === 6, JSON.stringify(radar));
    check('radar board: the round never says "exploring" or "exploiting" (only the tutorial and the results do)', radar.roundNamesWords === false, String(radar.roundNamesWords));

    // ---- 3b. Reactions on the avatar, in a fresh round: ❤️ (+ 💬 on a fresh topic), a smaller ❤️ on a repeat, 👆 on a
    // skip. They must come and go, never move the layout, and never say anything about the hidden tastes.
    var react = await b.eval("(async function () {" +
      "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      "var C = DS.CONFIG; DS.game.startMain(); await sleep(700);" +
      "[].slice.call(document.querySelectorAll('button')).filter(function (x) { return x.textContent.trim() === 'Go!'; })[0].click(); await sleep(100);" +
      "var r = DS.game.current(), card = r.cards[1].el, vp = r.vps[1];" +
      "var labels = function () { return [].map.call(card.querySelectorAll('.topic-btn'), function (x) { return x.getAttribute('aria-label'); }).join('|'); };" +
      "var size = function () { var a = card.getBoundingClientRect(), hd = card.querySelector('.card__head').getBoundingClientRect(); return [a.width, a.height, hd.width, hd.height].join(','); };" +
      "var press = function (id, liked) { DS.rng.use(function () { return liked ? 0 : 0.999999; }); card.querySelectorAll('.topic-btn')[DS.TOPIC_IDS.indexOf(id)].click(); DS.rng.reset(); };" +
      "var describe = function () { var all = card.querySelectorAll('.reaction'); if (!all.length) return null; var x = all[0];" +
      "  return { count: all.length, cls: x.className, hidden: x.getAttribute('aria-hidden'), attrs: [].map.call(x.attributes, function (a) { return a.name; }).sort().join(',')," +
      "    style: x.getAttribute('style'), inAvatar: x.parentNode.classList.contains('card__avatar'), emoji: x.textContent," +
      "    parts: [].map.call(x.querySelectorAll('*'), function (k) { return k.className; }).join('|') }; };" +
      "var out = { labelsBefore: labels() };" +
      // a forced like on the topic they like LEAST: the reaction follows the push, never the tastes
      "var least = DS.TOPIC_IDS.slice().sort(function (a, c) { return vp.tasteSnapshotStart[a] - vp.tasteSnapshotStart[c]; })[0];" +
      "press(least, true); await sleep(80); out.fresh = describe();" +
      "var re = card.querySelector('.reaction'); out.sizeWith = size(); re.style.display = 'none'; out.sizeWithout = size(); re.style.display = '';" +
      "await sleep((C.REACTION_LIKE_SEC + C.REACTION_TALK_DELAY_SEC) * 1000 + 150); out.freshGone = card.querySelectorAll('.reaction').length === 0;" +
      "while (vp.state === 'watching') await sleep(50);" +
      "press(least, true); await sleep(80); out.repeat = describe();" +
      "while (vp.state === 'watching') await sleep(50);" +
      "press(least, false); await sleep(30); out.skip = describe(); press(least, false); await sleep(30); out.afterTwoSkips = card.querySelectorAll('.reaction').length;" +
      "await sleep(C.REACTION_SKIP_SEC * 1000 + 150); out.skipGone = card.querySelectorAll('.reaction').length === 0;" +
      "out.labelsAfter = labels();" +
      // throw the round away mid-reaction: the old card's timer must never run (it would detach the reaction)
      "var other = r.cards[0].el; DS.rng.use(function () { return 0; }); other.querySelector('.topic-btn').click(); DS.rng.reset();" +
      "var orphan = other.querySelector('.reaction'); DS.game.startMain(); await sleep((C.REACTION_LIKE_SEC + C.REACTION_TALK_DELAY_SEC) * 1000 + 150);" +
      "out.retiredTimerCleared = !!orphan && !!orphan.parentNode;" +
      "return out; })()");
    var KNOWN = ['reaction reaction--like reaction--fresh', 'reaction reaction--like reaction--repeat', 'reaction reaction--skip'];
    check('reaction: a like on a fresh topic shows ❤️ then 💬 on the avatar (aria-hidden), gone after REACTION_LIKE_SEC',
          react.fresh && react.fresh.cls === KNOWN[0] && react.fresh.emoji === '❤️💬' && react.fresh.hidden === 'true' && react.fresh.inAvatar && react.freshGone, JSON.stringify(react.fresh));
    check('reaction: a like on a repeat shows only the (smaller) ❤️; a skip shows a quick 👆, gone after REACTION_SKIP_SEC',
          react.repeat && react.repeat.cls === KNOWN[1] && react.repeat.emoji === '❤️' && react.skip && react.skip.cls === KNOWN[2] && react.skip.emoji === '👆' && react.skipGone,
          JSON.stringify([react.repeat, react.skip]));
    check('reaction: one at a time per card (two quick skips leave a single reaction)', react.afterTwoSkips === 1, String(react.afterTwoSkips));
    check('reaction: no layout shift (the card and its header are the same size with and without it)', react.sizeWith === react.sizeWithout, react.sizeWith + ' vs ' + react.sizeWithout);
    check('reaction: no taste leak (a forced like on the least-liked topic still shows ❤️; only reaction classes and its timing; labels unchanged)',
          [react.fresh, react.repeat, react.skip].every(function (x) { return x && KNOWN.indexOf(x.cls) !== -1 && x.attrs === 'aria-hidden,class,style' && /^--reaction-dur: [\d.]+s;$/.test(x.style) &&
            x.parts.split('|').every(function (p) { return /^reaction__emoji reaction__(heart|talk|swipe)$/.test(p); }); }) && react.labelsBefore === react.labelsAfter,
          JSON.stringify([react.fresh, react.repeat, react.skip]));
    check('reaction: a card that was thrown away never runs its reaction timer', react.retiredTimerCleared, String(react.retiredTimerCleared));
    await b.media([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    var still = await b.eval("(async function () {" +
      "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      "await sleep(700); [].slice.call(document.querySelectorAll('button')).filter(function (x) { return x.textContent.trim() === 'Go!'; })[0].click(); await sleep(100);" +
      "var card = DS.game.current().cards[0].el; DS.rng.use(function () { return 0; }); card.querySelector('.topic-btn').click(); DS.rng.reset(); await sleep(150);" +
      "var heart = card.querySelector('.reaction__heart'), cs = getComputedStyle(heart);" +
      "var out = { name: cs.animationName, transform: cs.transform, dur: card.querySelector('.reaction').style.getPropertyValue('--reaction-dur'), want: DS.CONFIG.REACTION_STILL_SEC + 's' };" +
      "await sleep(DS.CONFIG.REACTION_STILL_SEC * 1000 + DS.CONFIG.REACTION_TALK_DELAY_SEC * 1000 + 150); out.gone = !card.querySelector('.reaction'); return out; })()");
    await b.media([]);
    check('reaction: with prefers-reduced-motion it is a short fade in place (no float, no swipe), REACTION_STILL_SEC long',
          still.name === 'reaction-still' && still.transform === 'none' && still.dur === still.want && still.gone, JSON.stringify(still));

    // ---- 4. DEV mode: whole rounds with different robot players, through every results step
    var bots = ['learner', 'spam', 'none'];                       // 'none' = never click: the empty-data case
    for (var i = 0; i < bots.length; i++) {
      var bot = bots[i];
      var phase = await b.eval("DS.dev.play({ bot: '" + bot + "' })");
      check('round with the "' + bot + '" bot ends on the results screen', phase === 'reveal', phase);
      var steps = await b.eval("DS.dev.measureReveal()");
      check('  every results step (score, each person, leaderboard, big picture) fits a 600px-tall window (' + bot + ')',
            steps.length === radar.cards + 3 && steps.every(function (s) { return /fits$/.test(s); }), steps.join(' | '));
      await b.viewport(1024, 768); await sleep(300);
      var steps1024 = await b.eval("DS.dev.measureReveal()");
      await b.viewport(1366, 600); await sleep(300);
      check('  ...and a 1024x768 window (' + bot + ')',
            steps1024.length === radar.cards + 3 && steps1024.every(function (s) { return /fits$/.test(s); }), steps1024.join(' | '));
      // Every sentence on every step must be real text: no "undefined", "NaN", "null" or "[object".
      var texts = await b.eval("(async function () { var out = []; var st = [].slice.call(document.querySelectorAll('#reveal-steps .step'));" +
        "for (var k = 0; k < st.length; k++) { st[k].click(); await new Promise(function (r) { setTimeout(r, 250); }); out.push(document.getElementById('reveal-stage').innerText); } return out; })()");
      var bad = texts.filter(function (t) { return /undefined|NaN|null|\[object/.test(t); });
      check('  no "undefined" / "NaN" / "null" anywhere in the results text (' + bot + ')', bad.length === 0, bad.join(' ... ').slice(0, 300));
      // The loop above ends on the big picture, so the page is showing it now.
      var questions = await b.eval("document.querySelectorAll('.talk__list li').length");
      var bigText = texts[texts.length - 1], others = texts.slice(0, -1);
      check('  the big picture defines exploiting and exploring and keeps exactly three questions; no other step names them (' + bot + ')',
            /Exploiting = showing what you know works\. Exploring = trying something new to learn more\./.test(bigText) && questions === 3 &&
            /When should an app show something new\?/.test(bigText) && others.every(function (t) { return !/explor|exploit/i.test(t); }),
            questions + ' questions; ' + bigText.slice(0, 200));
      var personSteps = texts.slice(1, -2), boardText = texts[texts.length - 2];
      check('  the leaderboard step ranks this round under the gamer tag, says what points are, and where you ranked (' + bot + ')',
            /🏆 Leaderboard/.test(boardText) && /Zeb the Great\s*you/.test(boardText) && /Points = everyone's attention/.test(boardText) &&
            /You're (tied for )?#\d+ of \d+ rounds|Yours is the first round/.test(boardText) && /Rounds played on this laptop\./.test(boardText), boardText.slice(0, 300));
      if (bot === 'none') check('  nobody was shown anything, so no step says "You tried" (none)', texts.every(function (t) { return !/You tried/.test(t); }), personSteps.join(' ... ').slice(0, 200));
      else check('  each person\'s step says how many topics you tried (' + bot + ')',
                 personSteps.every(function (t) { return /You tried (all \d+|\d+ of \d+) topics( before \w+ left)?\./.test(t); }), personSteps.join(' ... ').slice(0, 300));
      // Each person's step is a story now: no variety panel, the definition of "filter bubble" under exactly the stories
      // that say "bubble", the lost-interest chips, and radars still readable after shrinking to fit the stack.
      var persons = await b.eval("(async function () { var out = []; var st = [].slice.call(document.querySelectorAll('#reveal-steps .step'));" +
        "for (var k = 1; k < st.length - 2; k++) { st[k].click(); await new Promise(function (r) { setTimeout(r, 250); });" +
        "  var story = document.querySelector('.who__story'), def = document.querySelector('.who__def'), svg = document.querySelector('.rchart svg');" +
        "  out.push({ story: story ? story.textContent : '', def: def ? def.textContent : null, vrow: document.querySelectorAll('.vrow, .varietybox').length," +
        "    variety: /Variety of what they watched|0 = all the same/.test(document.getElementById('reveal-stage').innerText)," +
        "    chips: (document.querySelector('.tchips') || {}).textContent || '', radar: svg ? Math.round(svg.getBoundingClientRect().height) : 0 }); }" +
        "return out; })()");
      check('  each person\'s step tells their story with no variety panel, defines "filter bubble" exactly where it says "bubble", and keeps radars 110px+ (' + bot + ')',
            persons.length === radar.cards && persons.every(function (p) {
              return p.story.length > 20 && !p.vrow && !p.variety && /^Lost interest:/.test(p.chips) && p.radar >= 110 &&
                     (/bubble/.test(p.story) ? p.def === 'Filter bubble = a feed so full of one thing that you rarely see anything else.' : p.def === null);
            }), JSON.stringify(persons).slice(0, 500));
      if (bot !== 'none') {
        var verdict = await b.eval("(function () { var st = [].slice.call(document.querySelectorAll('#reveal-steps .step')); st[st.length - 1].click(); return document.querySelector('.big__verdict').textContent; })()");
        // A bot that shows people only what they like must be told feeds got narrow; never "mixed".
        if (bot === 'spam') check('  the spam bot is told its feeds were narrow (not "mixed")', /narrow|bubble/.test(verdict) && !/mixed/.test(verdict), verdict);
      }
    }

    // ---- 5. The CSV files the game saved by itself, through server.py, onto the disk: one per part of the session
    // (the tutorial, then each round), all in data/Zebedee_Quimby/, plus the leaderboard file.
    var CATCH = "var saved = [], oc = URL.createObjectURL, ok = HTMLAnchorElement.prototype.click, blobs = {};" +
      "URL.createObjectURL = function (x) { blobs.last = x; return oc.call(URL, x); };" +
      "HTMLAnchorElement.prototype.click = function () { saved.push({ name: this.download, blob: blobs.last }); };" +
      "var release = async function () { URL.createObjectURL = oc; HTMLAnchorElement.prototype.click = ok;" +
      "  var out = []; for (var k = 0; k < saved.length; k++) out.push({ name: saved[k].name, text: await saved[k].blob.text() }); return out; };" +
      "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      "var title = function () { return document.getElementById('overlay').hidden ? '' : document.getElementById('overlay-title').textContent; };" +
      "var bigStep = async function () { var st = [].slice.call(document.querySelectorAll('#reveal-steps .step')); st[st.length - 1].click(); await sleep(700); };" +
      "var boardStep = async function () { var st = [].slice.call(document.querySelectorAll('#reveal-steps .step')); st[st.length - 2].click(); await sleep(500); };" +
      "var press = function (re) { [].slice.call(document.querySelectorAll('.big__actions .btn')).filter(function (x) { return re.test(x.textContent); })[0].click(); };";
    var csv = await b.eval("(async function () {" + CATCH +
      "await bigStep(); var order = [].slice.call(document.querySelectorAll('.big__actions .btn')).map(function (x) { return x.textContent; });" +
      "return { order: order, savedLine: document.querySelector('.big__saved').textContent," +
      "  downloads: (await release()).length, session: DS.logger.sessionId, columns: DS.logger.COLUMNS }; })()");
    csv.files = fs.readdirSync(path.join(DATA, 'Zebedee_Quimby')).sort(byRound).map(function (n) { return { name: n, text: readData('Zebedee_Quimby/' + n) }; });
    csv.board = readData('leaderboard/leaderboard.csv');
    var names = csv.files.map(function (f) { return f.name; });
    check('results: the big picture\'s buttons are Log out and Play again (no Download: the files save themselves), and it says where',
          csv.order.length === 2 && /Log out/.test(csv.order[0]) && /Play again/.test(csv.order[1]) &&
          csv.savedLine === '✓ Your data is saved in data/Zebedee_Quimby.' && csv.downloads === 0 && b.downloads.length === 0, JSON.stringify([csv.order, csv.savedLine, b.downloads]));
    check('data folder on disk: one folder per player and one for the leaderboard, and no temporary files left over',
          fs.readdirSync(DATA).sort().join(' ') === 'Zebedee_Quimby leaderboard' && dataFiles().every(function (f) { return !/\/\./.test(f); }), dataFiles().join(' '));
    // This run skipped the tutorial before any post, so it has no tutorial file (an empty part saves nothing).
    // The unit tests cover the tutorial's file. Rounds thrown away by a restart are saved too: their rows are data.
    check('CSV: one file per round, in order, named after the player (Zebedee_Quimby_round1.csv); no empty tutorial file',
          names.length >= 3 && names.every(function (n, k) { return n === 'Zebedee_Quimby_round' + (k + 1) + '.csv'; }), names.join(' '));
    var allRows = [];
    csv.files.forEach(function (f) {
      var lines = f.text.trim().split('\r\n');
      var rows = lines.slice(1).map(function (l) { return l.split(','); });   // tastes_json has commas, so read only the columns before it
      allRows = allRows.concat(rows);
      f.ok = lines[0] === csv.columns.join(',') && rows.length > 0 && !/Zebedee|Quimby|Zeb the Great/.test(f.text) &&
             /\r\n$/.test(f.text) && f.text.split('\r\n').every(function (l) { return l.indexOf('\n') === -1; }) &&
             rows.every(function (r) { return r[0] === csv.session && r[r.length - 4] === '8th'; }) &&
             (f.name.indexOf('tutorial') !== -1 ? rows.every(function (r) { return r[2] === 'tutorial1'; })
                                                : rows.every(function (r) { return r[2] === 'main'; }));
    });
    check('CSV: every file has the header, CRLF line ends, one session id, the grade on every row, only its own part\'s rows, and never the name or gamer tag',
          csv.files.every(function (f) { return f.ok; }), csv.files.filter(function (f) { return !f.ok; }).map(function (f) { return f.name; }).join(' '));
    check('CSV: has rows for pushes, round starts and round ends', ['push', 'round_start', 'round_end'].every(function (e) { return allRows.some(function (r) { return r[4] === e; }); }), 'missing an event type');
    var round1 = csv.files[1].text;
    check('CSV: round_start rows say which version was played ("radar-interests/2")',
          /round_start/.test(round1) && round1.split('\r\n').filter(function (l) { return /,round_start,/.test(l); }).every(function (l) { return /,radar-interests\/2,/.test(l); }),
          round1.split('\r\n').filter(function (l) { return /,round_start,/.test(l); }).slice(0, 2).join(' | '));
    check('CSV: a watch_end row says which topic ended, and the readable columns are filled in (post_no, clock_time, taste_*, grade, date_time, session_sec; no wait_sec)',
          /,watch_end,[a-z]+,,[\d.]+,[\d.]+,,"\{.*\}",\d+,[\d.]+,complete,\d+,\d\d:\d\d:\d\d(,[\d.]+){6},8th,\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3},[\d.]+,\r\n/.test(round1), round1.split('\r\n').filter(function (l) { return /watch_end/.test(l); })[0]);
    check('CSV: every push row has a wait_sec (seconds the person sat free), and session_sec never goes backwards',
          csv.files.every(function (f) {
            var rows = f.text.trim().split('\r\n').slice(1).map(function (l) { return l.split(','); });
            var last = -1;
            return rows.every(function (r) {
              var ss = Number(r[r.length - 2]), ok = ss >= last && (r[4] !== 'push' || /^[\d.]+$/.test(r[r.length - 1]));
              last = ss; return ok;
            });
          }), round1.split('\r\n').filter(function (l) { return /,push,/.test(l); })[0]);
    var boardRows = csv.board.trim().split('\r\n');
    check('leaderboard file: one row per finished round (gamer tag, points, round, version, date), and no real name',
          boardRows[0] === 'gamer_tag,points,round_no,version,played_at' && boardRows.length - 1 === bots.length &&
          boardRows.slice(1).every(function (l) { return /^Zeb the Great,\d+,\d+,radar-interests\/2,\d{4}-\d\d-\d\d \d\d:\d\d$/.test(l); }) &&
          !/Zebedee|Quimby/.test(csv.board), csv.board);

    // ---- 5b. Log out: the files are already saved, so nothing is downloaded; the next player starts from an empty name
    // screen with a fresh session, checked against the saving program again. The same student signing in again gets
    // new files beside the old ones ("Zebedee_Quimby_round1 (2).csv"), never written over them.
    await b.eval("DS.dev.play({ bot: 'spam' })");
    var logout = await b.eval("(async function () {" + CATCH +
      "var before = DS.logger.sessionId; await bigStep(); await sleep(600); press(/Log out/); await sleep(400);" +
      "var $ = function (id) { return document.getElementById(id); };" +
      "var out = { downloads: (await release()).length, screen: document.body.dataset.screen," +
      "  empty: ['name-first', 'name-last', 'grade-other', 'gamer-tag'].every(function (id) { return $(id).value === ''; }) && !$('grade-8th').checked," +
      "  serverChecked: $('server-status').textContent," +
      "  focused: document.activeElement === $('name-first'), newSession: DS.logger.sessionId !== before," +
      "  anonymous: /^doomscroll_/.test(DS.logger.fileName('round1')), log: DS.logger.counts().stored + DS.logger.counts().pending };" +
      "return out; })()");
    var firstSession = fs.readdirSync(path.join(DATA, 'Zebedee_Quimby')).sort(byRound);
    var round1Before = readData('Zebedee_Quimby/Zebedee_Quimby_round1.csv');
    check('log out: nothing to download (every round saved itself), and the round played last is on disk',
          logout.downloads === 0 && b.downloads.length === 0 && firstSession.length === csv.files.length + 1, JSON.stringify([logout, firstSession]));
    check('log out: back to an empty name screen, with a new session and an empty log; the saving program is checked again',
          logout.screen === 'name' && logout.empty && logout.serverChecked === RUNNING && logout.focused && logout.newSession && logout.anonymous && logout.log === 0, JSON.stringify(logout));
    var again = await b.eval(signIn('Zebedee', 'Quimby', '7th', 'Zeb Again'));
    await b.eval("DS.dev.play({ bot: 'spam' })"); await sleep(500);
    var second = fs.readdirSync(path.join(DATA, 'Zebedee_Quimby')).sort(byRound);
    var twoText = second.indexOf('Zebedee_Quimby_round1 (2).csv') !== -1 ? readData('Zebedee_Quimby/Zebedee_Quimby_round1 (2).csv') : '';
    check('a second session of the same student: "Zebedee_Quimby_round1 (2).csv" beside the first, which is untouched',
          again === 'title' && second.length === firstSession.length + 1 && twoText.split('\r\n').length > 2 && /,7th,\d{4}-[^,]*,[\d.]+,[\d.]*\r\n/.test(twoText) &&
          readData('Zebedee_Quimby/Zebedee_Quimby_round1.csv') === round1Before, JSON.stringify([again, second]));
    check('leaderboard file: the second session\'s round is added under its own gamer tag; the earlier rows stay',
          readData('leaderboard/leaderboard.csv').trim().split('\r\n').length - 1 === bots.length + 2 && /\r\nZeb Again,\d+,1,/.test(readData('leaderboard/leaderboard.csv')),
          readData('leaderboard/leaderboard.csv'));

    // ---- 5c. The saving program stops mid-session: the round's save fails (and says so), the leaderboard shows the round
    // anyway, Log out keeps the student on the results with only "Try again", nothing downloads and no row is lost.
    // Once it is started again, "Try again" saves the missing round (" (2)", as round 2 of the first session is there).
    var round2Before = readData('Zebedee_Quimby/Zebedee_Quimby_round2.csv');
    await stopServer(server);
    await b.eval("DS.dev.play({ bot: 'spam' })");
    var down = await b.eval("(async function () {" + CATCH +
      "await sleep(500); await boardStep(); var out = { board: document.querySelector('.lb__note').textContent };" +
      "await bigStep(); out.savedLine = document.querySelector('.big__saved').textContent;" +
      "await sleep(600); press(/Log out/); await sleep(1000);" +
      "out.title = title(); out.text = document.getElementById('overlay-text').textContent;" +
      "out.buttons = [].map.call(document.querySelectorAll('#overlay-buttons button'), function (x) { return x.textContent; }).join(' | ');" +
      "out.screen = document.body.dataset.screen; out.kept = DS.logger.files().map(function (f) { return f.name + ':' + f.records.length; }).join(' ');" +
      "out.downloads = (await release()).length; return out; })()");
    check('saving program stopped: the results say the save failed, and the leaderboard step says its file couldn\'t be saved',
          down.savedLine === 'Saving failed: is the saving program still running? Log out will try again.' && /couldn't be saved/.test(down.board), JSON.stringify(down));
    check('saving program stopped: Log out shows "Could not save" with only "Try again", stays on the results, keeps the log, downloads nothing',
          down.title === 'Could not save' && down.buttons === 'Try again' && /saving program/.test(down.text) && down.screen === 'reveal' &&
          /Zebedee_Quimby_round1\.csv:\d+ Zebedee_Quimby_round2\.csv:\d+/.test(down.kept) && down.downloads === 0 && b.downloads.length === 0, JSON.stringify(down));
    server = await startServer(SERVER_PORT);
    var retried = await b.eval("(async function () { var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      "document.querySelector('#overlay-buttons button').click(); for (var k = 0; k < 40 && document.body.dataset.screen !== 'name'; k++) await sleep(50);" +
      "return { screen: document.body.dataset.screen, status: document.getElementById('server-status').textContent }; })()");
    var afterRetry = fs.existsSync(path.join(DATA, 'Zebedee_Quimby', 'Zebedee_Quimby_round2 (2).csv')) ? readData('Zebedee_Quimby/Zebedee_Quimby_round2 (2).csv') : '';
    check('saving program back: "Try again" saves the round played while it was down (Zebedee_Quimby_round2 (2).csv), then the name screen',
          retried.screen === 'name' && retried.status === RUNNING && afterRetry.split('\r\n').length > 2 && /,7th,\d{4}-[^,]*,[\d.]+,[\d.]*\r\n/.test(afterRetry) &&
          readData('Zebedee_Quimby/Zebedee_Quimby_round2.csv') === round2Before && b.downloads.length === 0, JSON.stringify([retried, dataFiles().filter(function (f) { return /Zebedee/.test(f); })]));

    // ---- 5d. Not running when a student signs in: Continue says to start it and stays put; once it runs, Continue works.
    await stopServer(server);
    var blocked = await b.eval("(async function () { var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      fillIn('Ada', 'Lovelace', '7th', 'Countess') + "document.getElementById('btn-name').click(); await sleep(500);" +
      "return { screen: document.body.dataset.screen, error: document.getElementById('name-error').textContent, status: document.getElementById('server-status').textContent," +
      "  focused: document.activeElement === document.getElementById('btn-name') }; })()");
    check('saving program not running: Continue says to start it, the status line says so too, and the name screen stays',
          blocked.screen === 'name' && blocked.error === START_IT && blocked.status === START_IT && blocked.focused, JSON.stringify(blocked));
    server = await startServer(SERVER_PORT);
    var unblocked = await b.eval("(async function () { var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      "document.getElementById('btn-name').click(); for (var k = 0; k < 40 && document.body.dataset.screen === 'name'; k++) await sleep(50);" +
      "return document.body.dataset.screen + ' ' + DS.logger.fileName('round1') + ' ' + document.getElementById('server-status').textContent; })()");
    check('saving program started again: the same Continue now leads to the title, and the files carry the new name',
          unblocked === 'title Ada_Lovelace_round1.csv ' + RUNNING, unblocked);
    b.problems.length = 0;                   // the stopped program's refused connections were logged on purpose

    // The loopholes below run as in class: signed in, with the saving program running.
    await b.goto(ROOT + 'index.html?dev=1'); await sleep(300);
    await b.eval(signIn('Zebedee', 'Quimby', '8th', 'Zeb the Great'));
    await sleep(600);

    // ---- 6. Loopholes: frantic clicks, the pause state machine, stale timers
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
      "out.earlyResultsClickIgnored = /^1 of /.test(document.getElementById('reveal-progress').textContent);" +
      "await sleep(600); press('See what happened →'); await sleep(60); out.laterResultsClickWorks = /^2 of /.test(document.getElementById('reveal-progress').textContent);" +
      "return out; })()");
    Object.keys(loop).forEach(function (k) { check('loophole: ' + k, loop[k] === true, k + ' was ' + loop[k]); });
    check('no console errors in the whole dev run', b.problems.length === 0, b.problems.join(' | '));

    // ---- 7. The other versions a playtest might use. First: radars that only show what the player has
    // seen (?radar=learned): a star from the bio, "?" until tried, and a spike only after a push.
    b.problems.length = 0;
    await b.goto(ROOT + 'index.html?dev=1&radar=learned'); await sleep(400);
    var learned = await runBoard();
    check('learned radar: fits the window (and a 1024x768 one), with no overlapping buttons',
          learned.cards === 2 && learned.big.fits && learned.big.overlaps === 0 && learned.big.outside === 0 &&
          learned.small.fits && learned.small.overlaps === 0 && learned.small.outside === 0, JSON.stringify(learned));
    check('learned radar: every person has a bio-clue star, every count starts as "?", and no spikes yet',
          learned.stars === 2 && learned.counts === 12 && learned.allUnknown && learned.spikesAtStart.every(function (n) { return n === 0; }), JSON.stringify(learned));
    check('learned radar: a push updates that topic\'s count and draws its spike', learned.countAfterPush === '1/1' && learned.spikesAfterPush === 1, JSON.stringify(learned));
    var learnedEnd = await b.eval("(async function () { var out = {}; out.phase = await DS.dev.play({ bot: 'learner' }); out.steps = await DS.dev.measureReveal(); return out; })()");
    check('learned radar: the round ends on a results screen whose steps all fit',
          learnedEnd.phase === 'reveal' && learnedEnd.steps.length === 5 && learnedEnd.steps.every(function (s) { return /fits$/.test(s); }), JSON.stringify(learnedEnd));
    var learnedWords = await b.eval(TUTORIAL_TEXTS);
    check('learned radar: the tutorial is the same two steps on the profile radar, and its win pop-up never promises filled-in radars',
          learnedWords.intro.length === 4 && learnedWords.intro[2].title === "This is Alex's Interest radar!" && learnedWords.between.length === 2 &&
          /You explored: random topics/.test(learnedWords.win.text) && !/come filled in/.test(learnedWords.win.text), JSON.stringify(learnedWords.win));
    check('learned radar: no console errors', b.problems.length === 0, b.problems.join(' | '));

    // Then: four people, the 2x2 board from before the 2-person default (?profiles=4)
    b.problems.length = 0;
    await b.goto(ROOT + 'index.html?dev=1&profiles=4'); await sleep(400);
    var four = await runBoard();
    check('four-person radar board (?profiles=4): a 2x2 grid that fits at 1366x600 and 1024x768, no overlaps',
          four.cards === 4 && four.buttons === 24 && four.big.fits && four.big.overlaps === 0 && four.big.outside === 0 &&
          four.small.fits && four.small.overlaps === 0 && four.small.outside === 0, JSON.stringify(four));
    var fourWords = await b.eval(TUTORIAL_TEXTS);
    check('four-person radar board: the tutorial win pop-up counts the people right ("four people")',
          /You explored: random topics/.test(fourWords.win.text) && /Can you keep four people hooked\?/.test(fourWords.win.text), fourWords.win.text);
    check('four-person radar board: no console errors', b.problems.length === 0, b.problems.join(' | '));

    // Then: six people, grid buttons (?profiles=6&layout=grid)
    b.problems.length = 0;
    await b.goto(ROOT + 'index.html?dev=1&profiles=6&layout=grid'); await sleep(400);
    var six = await b.eval("(async function () {" +
      "document.getElementById('btn-start').click(); await new Promise(function (r) { setTimeout(r, 150); }); document.getElementById('btn-skip').click(); await new Promise(function (r) { setTimeout(r, 900); });" +
      "var out = { cards: document.querySelectorAll('#main-grid .card').length, radarCards: document.querySelectorAll('#main-grid .card--radar').length, stars: document.querySelectorAll('#main-grid .topic-btn__clue').length," +
      "  fits: document.documentElement.scrollHeight <= innerHeight, clipped: [].slice.call(document.querySelectorAll('#main-grid .card')).filter(function (c) { return c.scrollHeight > c.clientHeight + 1; }).length };" +
      "out.phase = await DS.dev.play({ bot: 'learner' }); out.steps = await DS.dev.measureReveal(); return out; })()");
    check('six-person grid: 6 cards, grid buttons with stars, fits the window, nothing clipped',
          six.cards === 6 && six.radarCards === 0 && six.stars === 6 && six.fits && six.clipped === 0, JSON.stringify(six));
    check('six-person grid: the round ends on a results screen whose 9 steps all fit',
          six.phase === 'reveal' && six.steps.length === 9 && six.steps.every(function (s) { return /fits$/.test(s); }), JSON.stringify(six.steps));
    var gridWords = await b.eval(TUTORIAL_TEXTS);
    check('six-person grid: the tutorial\'s two steps talk about the buttons\' counts, never a radar, and promise no filled-in radars',
          gridWords.intro[2].title === 'These are the topics' && gridWords.between.length === 2 && /You explored: random topics/.test(gridWords.win.text) &&
          !/radar|come filled in/i.test(gridWords.all), gridWords.all.slice(0, 300));
    check('six-person grid: no console errors', b.problems.length === 0, b.problems.join(' | '));

    // ---- 8. The saving program only writes data/<folder>/<file>.csv, only for the game's own page. Probed straight,
    // without a browser, the way another web page or a script on the laptop would try it.
    var before = dataFiles().join('\n');
    var GOOD = { Origin: 'http://localhost:' + SERVER_PORT, 'Content-Type': 'application/json' };
    function write(folder, file, headers, text) {
      return raw('POST', '/api/write', headers || GOOD, JSON.stringify({ folder: folder, file: file, text: text === undefined ? 'x\r\n' : text }));
    }
    var escapes = await Promise.all([
      write('..', 'evil.csv'), write('Probe', '../../evil.csv'), write('a/b', 'evil.csv'), write('/tmp', 'evil.csv'),
      write('Probe', 'evil.html'), write('Probe', '.evil.csv'), write('leaderboard', 'evil.csv'), write('.git', 'evil.csv'),
      raw('GET', '/api/read?folder=..&file=server.py'), raw('GET', '/api/read?folder=leaderboard&file=..%2F..%2Fserver.py'),
      raw('GET', '/api/exists?folder=Probe&file=..%2F..%2F..%2Fetc%2Fpasswd')
    ]);
    check('server.py: refuses paths that leave data/<folder>/<file>.csv ("..", "/", other extensions, hidden files)',
          escapes.every(function (r) { return r.status === 400; }) && !fs.existsSync(path.join(PROJECT, 'evil.csv')) && !fs.existsSync(path.join(path.dirname(DATA), 'evil.csv')),
          escapes.map(function (r) { return r.status; }).join(' '));
    var foreign = await Promise.all([
      write('Probe', 'evil.csv', { Origin: 'https://evil.example', 'Content-Type': 'application/json' }),
      write('Probe', 'evil.csv', { Origin: 'null', 'Content-Type': 'application/json' }),               // a page opened from a file
      write('Probe', 'evil.csv', { 'Content-Type': 'application/json' }),                               // no Origin at all
      write('Probe', 'evil.csv', { Origin: GOOD.Origin, 'Content-Type': 'text/plain' }),                 // a form or a "simple" request
      write('Probe', 'evil.csv', Object.assign({ Host: 'evil.example:' + SERVER_PORT }, GOOD)),         // DNS rebinding
      raw('GET', '/api/read?folder=leaderboard&file=leaderboard.csv', { Origin: 'https://evil.example' }),
      raw('GET', '/api/health', { Host: 'evil.example' })
    ]);
    check('server.py: refuses a foreign Origin, a missing one, a non-JSON body and a foreign Host',
          foreign.map(function (r) { return r.status; }).join(' ') === '403 403 403 415 403 403 403', foreign.map(function (r) { return r.status; }).join(' '));
    var big = await write('Probe', 'big.csv', GOOD, new Array(6 * 1024 * 1024 + 1).join('x'));
    var statics = await Promise.all(['/data/leaderboard/leaderboard.csv', '/.git/HEAD', '/js/', '/js/../../etc/passwd'].map(function (u) { return raw('GET', u); }));
    check('server.py: refuses a file over the size limit, never serves the data folder, hidden files or folder listings',
          big.status === 413 && statics.every(function (r) { return r.status === 404; }), big.status + ' ' + statics.map(function (r) { return r.status; }).join(' '));
    check('server.py: none of those requests wrote anything', dataFiles().join('\n') === before, dataFiles().filter(function (f) { return before.indexOf(f) === -1; }).join(' '));
    var probe = await write('Probe_Test', 'Probe_Test.csv', GOOD, 'a,"b, c"\r\n1,ü\r\n');
    var probed = await raw('GET', '/api/read?folder=Probe_Test&file=Probe_Test.csv');
    check('server.py: a good write lands byte for byte (CRLF, quotes, UTF-8) and reads back the same',
          probe.status === 200 && fs.readFileSync(path.join(DATA, 'Probe_Test', 'Probe_Test.csv')).equals(Buffer.from('a,"b, c"\r\n1,ü\r\n', 'utf8')) &&
          JSON.parse(probed.body).text === 'a,"b, c"\r\n1,ü\r\n', probe.status + ' ' + probed.body);
    var twin = spawn(PYTHON, [path.join(PROJECT, 'server.py'), '--port', String(SERVER_PORT), '--data', DATA]), twinOut = '';
    twin.stdout.on('data', function (d) { twinOut += d; }); twin.stderr.on('data', function (d) { twinOut += d; });
    var twinCode = await new Promise(function (r) { twin.on('exit', r); });
    check('server.py: a second copy on the same port says so plainly and stops', twinCode === 1 && /already in use/.test(twinOut), twinCode + ' ' + twinOut);
  } catch (e) {
    failures++;
    console.log('FAIL  the check run itself broke: ' + (e && e.stack || e));
  } finally {
    if (b) b.close();
    chrome.proc.kill();
    await stopServer(server);
    try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch (e) { /* temp folder; the OS will clean it */ }
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* temp folder; the OS will clean it */ }
  }

  console.log('\n' + (failures ? failures + ' check(s) FAILED' : 'All checks passed'));
  process.exit(failures ? 1 : 0);
}

main();
