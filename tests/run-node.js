/*
 * tests/run-node.js — run the model tests (or the balance simulator) from a terminal.
 *
 *   node tests/run-node.js          run all the tests; exits with a non-zero code if any fail
 *   node tests/run-node.js sim      run the balance simulator (same output as sim.html, as text)
 *
 * Optional. The game itself needs no Node and no install: you only need this if you like a
 * terminal. It works because the model files (config, content, vp, metrics, logger, the geometry in
 * radar.js and the wording halves of reveal.js and guess.js) never touch the page. They only need a global called `window`,
 * so we point that at Node's global object, then run the same files the browser runs, in the
 * same order as tests.html.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
global.window = global;

function load(file) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file });
}

['js/config.js', 'js/content.js', 'js/vp.js', 'js/metrics.js', 'js/logger.js', 'js/radar.js', 'js/reveal.js', 'js/guess.js', 'sim/sim.js'].forEach(load);

if (process.argv[2] === 'sim') {
  var out = global.DS.sim.runAll({ runs: global.DS.CONFIG.SIM_RUNS });
  console.log(global.DS.sim.formatText(out));
  process.exitCode = out.goals.every(function (g) { return g.pass; }) ? 0 : 1;
} else {
  load('tests/tests.js');                                  // runs every test as it loads
  process.exitCode = global.DS.testResults.every(function (r) { return r.pass; }) ? 0 : 1;
}
