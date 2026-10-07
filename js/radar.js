/*
 * radar.js — draws the six-topic radar ("spider chart"). Used in two places:
 *
 *   ui.js      on each profile card: the topic BUTTONS sit at the six corners, and spikes point at them.
 *              What the spikes show depends on RADAR_SHOWS (config.js): the person's interests at the
 *              start of the round, or only what the player has SEEN them like so far
 *              (DS.metrics.observed). Their current tastes, which drift, are never drawn during play.
 *   reveal.js  on the results screen: the person's real tastes at the start vs the end of the round
 *              (the shape shrinking into one spike is the filter bubble).
 *
 * Geometry: a FLAT-TOPPED hexagon. Axis 0 points to the upper left and the rest go clockwise, so with
 * the six topics in content.js order: Sports (upper left), Dance (upper right), Music (right), Comics
 * (lower right), Movies (lower left), Food (left). Flat-topped because the radar sits in a box that is
 * wider than it is tall: this way no button sits right above another, and the radar can be ~15% bigger.
 *
 * Sizing: CSS works out the radius in pixels, across (--rx, from the box's width) and down (--ry, from its
 * height), and sizes the SVG to 2rx x 2ry. The viewBox is stretched to fit (preserveAspectRatio "none"),
 * so a short box gives a slightly wide hexagon instead of buttons piling into each other. Lines keep their
 * thickness (non-scaling-stroke) and dots are drawn as round line caps, so the stretch never shows. The
 * HTML buttons/labels at the corners use the same --rx/--ry, so drawing and HTML always line up.
 */
(function () {
  'use strict';

  var DS = window.DS = window.DS || {};
  var SVG_NS = 'http://www.w3.org/2000/svg';

  // The radius (in viewBox units) of a value of 1. The viewBox is exactly -R..R, so the SVG's box is
  // exactly the radar (style.css makes it 2 * --r wide and tall). Dots at the tips poke out a little,
  // which overflow: visible allows.
  var R = 76;
  var START_DEG = -120;      // axis 0 points to the upper left (a flat-topped hexagon)

  // ---------------------------------------------------------------- Pure geometry
  // Unit direction of axis i of n (x right, y down, like the screen).
  function direction(i, n) {
    var a = (START_DEG + 360 * i / n) * Math.PI / 180;
    return { x: Math.cos(a), y: Math.sin(a) };
  }

  // Where a value (0..1) on axis i lands, in viewBox units.
  function point(i, n, value) {
    var d = direction(i, n);
    return { x: d.x * R * value, y: d.y * R * value };
  }

  function polygonPoints(values) {
    return values.map(function (v, i) {
      var p = point(i, values.length, v);
      return p.x.toFixed(2) + ',' + p.y.toFixed(2);
    }).join(' ');
  }

  // ---------------------------------------------------------------- SVG building
  function el(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // The empty frame: two hexagon rings and six spokes. Returns { svg, spokes } so callers can restyle
  // a spoke (e.g. dashed when that topic hasn't been tried yet).
  function frame(n) {
    var svg = el('svg', { viewBox: (-R) + ' ' + (-R) + ' ' + (2 * R) + ' ' + (2 * R), preserveAspectRatio: 'none', 'class': 'radar__svg' });
    svg.setAttribute('aria-hidden', 'true');      // callers describe the chart in words; this is decoration for screen readers
    var full = [], half = [];
    for (var i = 0; i < n; i++) { full.push(1); half.push(0.5); }
    svg.appendChild(el('polygon', { points: polygonPoints(full), 'class': 'radar__ring' }));
    svg.appendChild(el('polygon', { points: polygonPoints(half), 'class': 'radar__ring' }));
    var spokes = [];
    for (var k = 0; k < n; k++) {
      var end = point(k, n, 1);
      var s = el('line', { x1: 0, y1: 0, x2: end.x.toFixed(2), y2: end.y.toFixed(2), 'class': 'radar__spoke' });
      svg.appendChild(s);
      spokes.push(s);
    }
    return { svg: svg, spokes: spokes };
  }

  // A filled shape through one value per axis (all values known), e.g. a person's tastes.
  function shape(values, className) {
    return el('polygon', { points: polygonPoints(values), 'class': 'radar__shape ' + (className || '') });
  }

  // A spike per topic (in that topic's color) with a dot at the tip, and a light shape joining the tips
  // once three or more are known. Used for a person's interests (all six known) and for what the player
  // has learned, where an untried topic is null and gets no spike at all: its spoke is dashed and its
  // button says "?". Drawing it at 0 would say "they hate it", which nobody knows yet.
  // estimates: array of numbers 0..1 or null (unknown), in topic order. colors: CSS colors per axis.
  function spikes(g, estimates, colors) {
    while (g.firstChild) g.removeChild(g.firstChild);
    var n = estimates.length;
    var known = [];
    estimates.forEach(function (v, i) { if (v !== null) known.push(i); });
    if (known.length >= 3) {
      g.appendChild(el('polygon', {
        points: known.map(function (i) { var p = point(i, n, estimates[i]); return p.x.toFixed(2) + ',' + p.y.toFixed(2); }).join(' '),
        'class': 'radar__learned'
      }));
    }
    known.forEach(function (i) {
      var p = point(i, n, estimates[i]);
      var line = el('line', { x1: 0, y1: 0, x2: p.x.toFixed(2), y2: p.y.toFixed(2), 'class': 'radar__spike' });
      line.style.stroke = colors[i];
      g.appendChild(line);
      // A dot at the tip: a zero-length line with round caps stays a perfect circle even when the
      // radar is stretched (a <circle> would turn into an oval). White halo first, then the color.
      g.appendChild(el('line', { x1: p.x.toFixed(2), y1: p.y.toFixed(2), x2: p.x.toFixed(2), y2: p.y.toFixed(2), 'class': 'radar__halo' }));
      var dot = el('line', { x1: p.x.toFixed(2), y1: p.y.toFixed(2), x2: p.x.toFixed(2), y2: p.y.toFixed(2), 'class': 'radar__dot' });
      dot.style.stroke = colors[i];
      g.appendChild(dot);
    });
  }

  DS.radar = {
    R: R,
    direction: direction,
    point: point,
    polygonPoints: polygonPoints,
    frame: frame,
    shape: shape,
    spikes: spikes,
    group: function (className) { return el('g', { 'class': className || '' }); }
  };
})();
