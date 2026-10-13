/*
 * tests/e2e.js — end-to-end check of the REAL game in a real (headless) Chrome, opened from
 * file:// exactly like a teacher's double-click.
 *
 *     node tests/e2e.js
 *
 * Optional. The game needs none of this. Run it after tuning config.js or editing content.js, to
 * confirm the whole thing still works: the screens fit a laptop, the results text is sane, the
 * lessons' loopholes are still closed, and the CSV is well-formed. It prints PASS/FAIL per check
 * and exits with code 1 if anything fails. Takes about 2-3 minutes.
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
    check('sim.html: all balance goals pass', goals.length >= 6 && goals.every(function (g) { return g.charAt(0) === '✔'; }), goals.join(' | '));

    // ---- 1b. The first screen asks who is playing. Both names are needed (a name that cleans to nothing counts as
    // missing), the name only names the CSV, and a double-click on Continue can't land on Start.
    b.problems.length = 0;
    await b.goto(ROOT + 'index.html');
    var who = await b.eval("(async function () {" +
      "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      "var first = document.getElementById('name-first'), last = document.getElementById('name-last'), go = document.getElementById('btn-name');" +
      "var err = function () { return document.getElementById('name-error').textContent; };" +
      "var out = { screen: document.body.dataset.screen, focused: document.activeElement === first, fits: document.documentElement.scrollHeight <= innerHeight };" +
      "go.click(); await sleep(50); out.empty = { screen: document.body.dataset.screen, error: err(), invalid: first.getAttribute('aria-invalid') + ' ' + last.getAttribute('aria-invalid'), focused: document.activeElement === first };" +
      "first.value = '  Mary   Ann '; last.value = '???'; go.click(); await sleep(50);" +
      "out.junk = { screen: document.body.dataset.screen, invalid: first.getAttribute('aria-invalid') + ' ' + last.getAttribute('aria-invalid'), focused: document.activeElement === last };" +
      "last.value = \"O'Brien\"; go.click(); await sleep(50);" +
      "out.done = { screen: document.body.dataset.screen, error: err(), file: DS.logger.fileName(), startFocused: document.activeElement === document.getElementById('btn-start') };" +
      "document.getElementById('btn-start').click(); await sleep(50); out.doubleClickHeld = document.body.dataset.screen === 'title';" +
      "await sleep(600); document.getElementById('btn-start').click(); await sleep(150); out.started = document.body.dataset.screen;" +
      "return out; })()");
    check('name screen: the game opens on it, with the first name ready to type, and it fits the window',
          who.screen === 'name' && who.focused && who.fits, JSON.stringify(who));
    check('name screen: Continue with no name stays put, says why and marks both boxes',
          who.empty.screen === 'name' && who.empty.error === 'Type your first and last name.' && who.empty.invalid === 'true true' && who.empty.focused, JSON.stringify(who.empty));
    check('name screen: a last name of only "???" counts as missing',
          who.junk.screen === 'name' && who.junk.invalid === 'false true' && who.junk.focused, JSON.stringify(who.junk));
    check('name screen: both names lead to the title, and the CSV will be called Mary-Ann_O\'Brien.csv',
          who.done.screen === 'title' && who.done.error === '' && who.done.file === "Mary-Ann_O'Brien.csv" && who.done.startFocused, JSON.stringify(who.done));
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
      "out.logSealed = DS.logger.stored().length === 0 && DS.logger.exportCSV() === null; out.flushHeld = !hijacked; out.tutorial = document.body.dataset.screen;" +
      "return out; })()");
    check('play mode: no console handle to the live game or dev helpers', play.hasCurrent === 'undefined' && play.hasDev === 'undefined', JSON.stringify(play));
    check('play mode: settings and dice are frozen', play.configHeld && !play.diceSwapped, JSON.stringify(play));
    check('play mode: the log (it holds hidden tastes) is sealed and flush() cannot be hijacked', play.logSealed && play.flushHeld, JSON.stringify(play));
    check('play mode: the game still starts', play.tutorial === 'tutorial', JSON.stringify(play));
    check('play mode: no console errors', b.problems.length === 0, b.problems.join(' | '));

    // ---- 2b. The one tutorial, in two named steps. Step 1, explore: Alex's profile starts empty and every topic
    // has to be tried; each watched post adds a ring (like "Guess the profile"), a skip adds none. Step 2, exploit:
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
    check('tutorial: four intro pop-ups first (attention, the radar plot, "Step 1: Explore"), and nothing moves behind them',
          tut.titles.join(' / ') === 'Meet Alex / This is attention / This is a radar plot / Step 1: Explore' && tut.frozenDuringIntro, JSON.stringify(tut.titles));
    check('tutorial: the radar pop-up calls it Alex\'s profile, empty; step 1 is named and defined as on the results',
          /profile/.test(tut.texts[2]) && /empty/.test(tut.texts[2]) && tut.texts[3].indexOf('Exploring = trying something new to learn more.') === 0,
          JSON.stringify(tut.texts));
    check('tutorial: step 1 says what it is and counts the topics tried ("Step 1 of 2 · Explore", "(0/6)")',
          tut.step1 === 'Step 1 of 2 · Explore' && tut.goal0 === 'Goal: try all 6 topics (0/6)', JSON.stringify([tut.step1, tut.goal0]));
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
          tut.between.length === 2 && /^You explored! \| Alex watched [^.]+\.( The skips were the price of finding out\.)?\nEvery new user starts empty/.test(tut.between[0]) &&
          tut.between[1].indexOf('Step 2: Exploit | Exploiting = showing what you know works.') === 0, JSON.stringify(tut.between));
    check('tutorial: step 2 is named and counts watches in a row ("Step 2 of 2 · Exploit", "(0/3)")',
          tut.step2 === 'Step 2 of 2 · Exploit' && tut.goal2 === 'Goal: 3 watches in a row (0/3)', JSON.stringify([tut.step2, tut.goal2]));
    check('tutorial: a skip ends the run (2 watches, a skip, 2 watches is not enough); 3 in a row ends it with the game or a replay',
          tut.notYet && tut.win === 'You did it!' && tut.winButtons === 'Start the game | Replay the tutorial', JSON.stringify([tut.notYet, tut.win, tut.winButtons]));
    check('tutorial: "Replay the tutorial" starts it again from the first pop-up, with a fresh Alex', tut.replayed === true, String(tut.replayed));
    var words = await b.eval(TUTORIAL_TEXTS);
    check('tutorial: the win pop-up says what was done (explored, then exploited), then (the round\'s radars being filled in) that two people come next',
          /You explored to learn what Alex likes, then exploited it/.test(words.win.text) &&
          /Now the radars come filled in\. Can you keep two people hooked\?/.test(words.win.text) && /leaves at 0/.test(words.win.text), words.win.text);
    check('tutorial: the "Alex left" pop-up says why (skips and waiting cost attention), with no talk of spikes',
          words.left.title === 'Alex left!' && /Each skip costs attention/.test(words.left.text) && !/spike/i.test(words.left.text), JSON.stringify(words.left));
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
    // Through the first screen, as a student would: the CSV downloaded in section 5 is named after this player.
    await b.eval("document.getElementById('name-first').value = 'Zebedee'; document.getElementById('name-last').value = 'Quimby'; document.getElementById('btn-name').click();");
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
      check('  every results step (score, each person, big picture) fits a 600px-tall window (' + bot + ')',
            steps.length === radar.cards + 2 && steps.every(function (s) { return /fits$/.test(s); }), steps.join(' | '));
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
      var personSteps = texts.slice(1, -1);
      if (bot === 'none') check('  nobody was shown anything, so no step says "You tried" (none)', texts.every(function (t) { return !/You tried/.test(t); }), personSteps.join(' ... ').slice(0, 200));
      else check('  each person\'s step says how many topics you tried (' + bot + ')',
                 personSteps.every(function (t) { return /You tried (all \d+|\d+ of \d+) topics( before \w+ left)?\./.test(t); }), personSteps.join(' ... ').slice(0, 300));
      if (bot !== 'none') {
        var verdict = await b.eval("(function () { var st = [].slice.call(document.querySelectorAll('#reveal-steps .step')); st[st.length - 1].click(); return document.querySelector('.big__verdict').textContent; })()");
        // A bot that shows people only what they like must be told feeds got narrow; never "mixed".
        if (bot === 'spam') check('  the spam bot is told its feeds were narrow (not "mixed")', /narrow|bubble/.test(verdict) && !/mixed/.test(verdict), verdict);
      }
    }

    // ---- 4b. "Guess the profile", opened from the real button next to Download CSV. A solver plays it with
    // the keyboard (arrow keys on each topic's slider) using only what the screen says, so this also proves
    // the puzzle can be solved from its feedback alone.
    var guess = await b.eval("(async function () {" +
      "var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };" +
      "var out = {}; var st = [].slice.call(document.querySelectorAll('#reveal-steps .step')); st[st.length - 1].click(); await sleep(700);" +
      "var btns = [].slice.call(document.querySelectorAll('.big__actions .btn')); out.order = btns.map(function (x) { return x.textContent; });" +
      "btns.filter(function (x) { return /Guess/.test(x.textContent); })[0].click(); await sleep(700);" +
      "out.screen = document.body.dataset.screen; out.fits = document.documentElement.scrollHeight <= innerHeight;" +
      "var ids = DS.TOPIC_IDS, handles = [].slice.call(document.querySelectorAll('.guess__handle'));" +
      "var val = function (i) { return +handles[i].getAttribute('aria-valuenow'); };" +
      "var key = function (i, k) { handles[i].dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); };" +
      "var setTo = function (i, v) { var guard = 0; while (val(i) < v && guard++ < 9) key(i, 'ArrowUp'); while (val(i) > v && guard++ < 18) key(i, 'ArrowDown'); };" +
      // the budget: push one topic to its cap, then try to go past 10 points in total
      "setTo(0, 5); setTo(1, 5); key(2, 'ArrowUp'); out.capped = val(2) === 0 && /No points left/.test(document.querySelector('.guess__left').textContent);" +
      "for (var z = 0; z < ids.length; z++) setTo(z, 0);" +
      // the solver: exact[i] once a topic showed skips; low[i] = the most it ever watched without skipping
      "var exact = {}, low = {}; ids.forEach(function (id, i) { low[i] = 0; });" +
      "for (var t = 0; t < 15; t++) {" +
      "  var plan = {}, left = 10; ids.forEach(function (id, i) { plan[i] = exact[i] !== undefined ? exact[i] : low[i]; left -= plan[i]; });" +
      "  for (var guard = 0; left > 0 && guard < 60; guard++) { var i2 = guard % ids.length; if (exact[i2] === undefined && plan[i2] < 5) { plan[i2]++; left--; } }" +
      "  for (var d = 0; d < ids.length; d++) setTo(d, 0); for (var u = 0; u < ids.length; u++) setTo(u, plan[u]);" +
      "  document.querySelector('.guess__bar .btn--primary').click(); await sleep(80);" +
      "  var lines = [].slice.call(document.querySelectorAll('.guess__topic')).map(function (li) { return li.textContent; });" +
      "  if (document.querySelector('.guess__win')) { out.solvedIn = t + 1; break; }" +
      "  lines.forEach(function (line, i) { var m = /watched (\\d+), skipped/.exec(line); if (m) exact[i] = +m[1]; else if (/skipped all/.test(line)) exact[i] = 0; else if (/watched all/.test(line)) low[i] = Math.max(low[i], plan[i]); });" +
      "}" +
      "out.winText = document.querySelector('.guess__win') ? document.querySelector('.guess__win').textContent : null;" +
      "out.fitsAfter = document.documentElement.scrollHeight <= innerHeight;" +
      "out.text = document.getElementById('screen-guess').innerText;" +
      "await sleep(600); [].slice.call(document.querySelectorAll('.guess__foot .btn')).filter(function (x) { return /Back/.test(x.textContent); })[0].click(); await sleep(400);" +
      "out.backTo = document.body.dataset.screen + ' / ' + document.getElementById('reveal-progress').textContent;" +
      "return out; })()");
    check('guess: the button sits next to Download CSV and opens the puzzle, which fits the window',
          guess.order[0].indexOf('Download') !== -1 && /Guess the profile/.test(guess.order[1]) && guess.screen === 'guess' && guess.fits, JSON.stringify(guess.order) + ' ' + guess.screen + ' fits=' + guess.fits);
    check('guess: the 10-point budget holds (no topic can take a point once all 10 are placed)', guess.capped === true, JSON.stringify(guess.capped));
    check('guess: a solver that only reads the watches and skips finds the perfect profile', guess.solvedIn > 0 && guess.solvedIn <= 8 && /You built/.test(guess.winText),
          'solved in ' + guess.solvedIn + ': ' + guess.winText);
    check('guess: still fits after results, no "undefined"/"NaN", no he/she', guess.fitsAfter && !/undefined|NaN|\[object/.test(guess.text) && !/\b(he|she|him|her|his)\b/i.test(guess.text), guess.text.slice(0, 200));
    check('guess: "Back to results" returns to the last results step', /^reveal \/ (\d+) of \1$/.test(guess.backTo), guess.backTo);

    // ---- 5. The CSV that the real Download button produces
    var csv = await b.eval("(async function () {" +
      "var name = null, blob = null, oc = URL.createObjectURL, ok = HTMLAnchorElement.prototype.click;" +
      "URL.createObjectURL = function (x) { blob = x; return oc.call(URL, x); }; HTMLAnchorElement.prototype.click = function () { name = this.download; };" +
      "var step = [].slice.call(document.querySelectorAll('#reveal-steps .step')); step[step.length - 1].click(); await new Promise(function (r) { setTimeout(r, 700); });" +
      "[].slice.call(document.querySelectorAll('button')).filter(function (x) { return x.textContent.indexOf('Download data') !== -1; })[0].click();" +
      "URL.createObjectURL = oc; HTMLAnchorElement.prototype.click = ok;" +
      "var text = await blob.text(); return { name: name, text: text, session: DS.logger.sessionId, columns: DS.logger.COLUMNS }; })()");
    var lines = csv.text.trim().split('\r\n');
    check('CSV: named after the player from the first screen (Zebedee_Quimby.csv)', csv.name === 'Zebedee_Quimby.csv', csv.name);
    check('CSV: the player\'s name is in no row (it only names the file)', !/Zebedee|Quimby/.test(csv.text), 'the name is in the data');
    check('CSV: header is the agreed columns', lines[0] === csv.columns.join(','), lines[0]);
    check('CSV: has rows for pushes, round starts and round ends', ['push', 'round_start', 'round_end'].every(function (e) { return lines.some(function (l) { return l.split(',')[4] === e; }); }), 'missing an event type');
    check('CSV: one session id on every row', lines.slice(1).every(function (l) { return l.split(',')[0] === csv.session; }), 'mixed session ids');
    var starts = lines.filter(function (l) { return l.split(',')[4] === 'round_start'; });
    check('CSV: round_start rows say which version was played ("radar-interests/2")',
          starts.length > 0 && starts.every(function (l) { return /,radar-interests\/2$/.test(l); }), starts.slice(0, 2).join(' | '));

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
          learnedEnd.phase === 'reveal' && learnedEnd.steps.length === 4 && learnedEnd.steps.every(function (s) { return /fits$/.test(s); }), JSON.stringify(learnedEnd));
    var learnedWords = await b.eval(TUTORIAL_TEXTS);
    check('learned radar: the tutorial is the same two steps on the profile radar, and its win pop-up never promises filled-in radars',
          learnedWords.intro.length === 4 && learnedWords.intro[2].title === 'This is a radar plot' && learnedWords.between.length === 2 &&
          /You explored to learn/.test(learnedWords.win.text) && !/come filled in/.test(learnedWords.win.text), JSON.stringify(learnedWords.win));
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
          /You explored to learn/.test(fourWords.win.text) && /Can you keep four people hooked\?/.test(fourWords.win.text), fourWords.win.text);
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
    check('six-person grid: the round ends on a results screen whose 8 steps all fit',
          six.phase === 'reveal' && six.steps.length === 8 && six.steps.every(function (s) { return /fits$/.test(s); }), JSON.stringify(six.steps));
    var gridWords = await b.eval(TUTORIAL_TEXTS);
    check('six-person grid: the tutorial\'s two steps talk about the buttons\' counts, never a radar, and promise no filled-in radars',
          gridWords.intro[2].title === 'These are the topics' && gridWords.between.length === 2 && /You explored to learn/.test(gridWords.win.text) &&
          !/radar|come filled in/i.test(gridWords.all), gridWords.all.slice(0, 300));
    check('six-person grid: no console errors', b.problems.length === 0, b.problems.join(' | '));
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
