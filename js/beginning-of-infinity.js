/* ============================================================
   The Beginning of Infinity, mapped.
   An argument map: the book's load-bearing ideas as nodes in a
   single flow, foundations at the top, conclusions at the bottom.
   Click a node to read the claim, why it holds, the line from the
   book it rests on, and what it rests on / leads to.

   Progressive enhancement: the ideas are authored as plain
   <article class="boi-idea"> cards in the HTML, so the page reads
   top to bottom without JavaScript. This script reads those cards,
   hides the raw list, and builds the interactive map + panel from
   them. One source of truth, no duplicated prose.

   No dependencies. Vanilla, deferred. No em dashes.
   ============================================================ */
(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var BOXW = 134, BOXH = 48, RX = 9;

  var order = [], byId = {}, cur = 0;
  var canvas, panel, posEl, prevBtn, nextBtn, svg;
  var nodeEls = {}, edgeEls = [];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
    });
  }

  /* ---------- read the authored cards ---------- */
  function readCards() {
    var host = $('boi-cards');
    if (!host) return false;
    var cards = Array.prototype.slice.call(host.querySelectorAll('.boi-idea'));
    if (!cards.length) return false;
    cards.forEach(function (el, i) {
      var d = {
        el: el, id: el.id, i: i,
        num: el.getAttribute('data-num') || String(i + 1),
        short: el.getAttribute('data-short') || '',
        role: el.getAttribute('data-role') || 'consequence',
        x: parseFloat(el.getAttribute('data-x')) || 0,
        y: parseFloat(el.getAttribute('data-y')) || 0,
        to: (el.getAttribute('data-to') || '').trim().split(/\s+/).filter(Boolean),
        from: [],
        kicker: txt(el.querySelector('.boi-idea-kicker')),
        claimHtml: html(el.querySelector('.boi-idea-claim')),
        whyHtml: html(el.querySelector('.boi-idea-why')),
        quote: el.querySelector('.boi-q')
      };
      byId[d.id] = d; order.push(d);
    });
    order.forEach(function (d) {
      d.to.forEach(function (t) { if (byId[t]) byId[t].from.push(d.id); });
    });
    return true;
  }
  function txt(el) { return el ? el.textContent.trim() : ''; }
  function html(el) { return el ? el.innerHTML.trim() : ''; }

  /* ---------- label wrapping (2 lines max) ---------- */
  function wrap(label, perLine) {
    var words = label.split(/\s+/), lines = [], line = '';
    words.forEach(function (w) {
      var t = line ? line + ' ' + w : w;
      if (t.length > perLine && line) { lines.push(line); line = w; }
      else { line = t; }
    });
    if (line) lines.push(line);
    if (lines.length > 2) {           /* collapse to 2 lines, second takes the rest */
      lines = [lines[0], lines.slice(1).join(' ')];
    }
    return lines;
  }

  /* ---------- build the SVG map ---------- */
  function edgePath(a, b) {
    var x1 = a.x, y1 = a.y + BOXH / 2, x2 = b.x, y2 = b.y - BOXH / 2;
    var my = (y1 + y2) / 2;
    return 'M' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + my + ' ' + x2 + ' ' + my + ' ' + x2 + ' ' + y2;
  }

  function el(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  function buildMap() {
    var maxY = 0, maxX = 0;
    order.forEach(function (d) {
      maxY = Math.max(maxY, d.y + BOXH / 2);
      maxX = Math.max(maxX, d.x + BOXW / 2);
    });
    var vbW = Math.max(maxX + 26, 340), vbH = maxY + 30;

    svg = el('svg', {
      viewBox: '0 0 ' + vbW + ' ' + vbH,
      role: 'img',
      'aria-label': 'A map of the book’s argument: nine ideas as connected boxes, from a foundation of fallibilism at the top down to the conclusion that people are significant.'
    });

    /* edges first (behind the nodes) */
    edgeEls = [];
    order.forEach(function (d) {
      d.to.forEach(function (t) {
        var tgt = byId[t]; if (!tgt) return;
        var p = el('path', {
          'class': 'amap-edge', d: edgePath(d, tgt),
          'data-from': d.id, 'data-to': t
        });
        svg.appendChild(p);
        edgeEls.push(p);
      });
    });

    /* nodes */
    order.forEach(function (d) {
      var g = el('g', {
        'class': 'amap-node', 'data-role': d.role, 'data-id': d.id,
        tabindex: '0', role: 'button',
        'aria-label': 'Idea ' + d.num + ': ' + d.short
      });
      var x = d.x - BOXW / 2, y = d.y - BOXH / 2;
      g.appendChild(el('rect', { 'class': 'nd-box', x: x, y: y, width: BOXW, height: BOXH, rx: RX }));
      g.appendChild(el('rect', { 'class': 'nd-accent', x: x, y: y, width: 4, height: BOXH, rx: 2 }));
      var num = el('text', { 'class': 'nd-num', x: x + 12, y: y + 15 });
      num.textContent = d.num;
      g.appendChild(num);

      var lines = wrap(d.short, 17);
      var two = lines.length > 1;
      lines.forEach(function (ln, li) {
        var t = el('text', {
          'class': 'nd-label' + (two ? ' two' : ''),
          x: d.x, y: d.y + (two ? (li === 0 ? 1 : 15) : 6),
          'text-anchor': 'middle'
        });
        t.textContent = ln;
        g.appendChild(t);
      });

      g.addEventListener('click', function () { select(d.i, 'click'); });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(d.i, 'click'); }
      });
      svg.appendChild(g);
      nodeEls[d.id] = g;
    });

    canvas.appendChild(svg);
  }

  /* ---------- detail panel ---------- */
  function chip(d) {
    return '<button class="amap-chip" data-go="' + d.id + '" data-role="' + d.role + '">' +
      '<span class="ch-dot"></span>' + esc(d.short) + '</button>';
  }

  function renderPanel(d) {
    var fromC = d.from.map(function (id) { return chip(byId[id]); }).join('');
    var toC = d.to.map(function (id) { return chip(byId[id]); }).join('');
    var qHtml = '';
    if (d.quote) {
      var clone = d.quote.cloneNode(true);
      var citeEl = clone.querySelector('cite');
      var cite = citeEl ? citeEl.innerHTML : '';
      if (citeEl) citeEl.parentNode.removeChild(citeEl);
      qHtml = '<blockquote class="pn-quote"><p>' + clone.innerHTML.trim() + '</p>' +
        (cite ? '<cite>' + cite + '</cite>' : '') + '</blockquote>';
    }
    panel.innerHTML =
      '<p class="pn-kicker">' + esc(d.kicker) + ' <span class="pn-n">idea ' + d.num + ' of ' + order.length + '</span></p>' +
      '<h3 class="pn-claim">' + d.claimHtml + '</h3>' +
      '<div class="pn-why">' + d.whyHtml + '</div>' +
      qHtml +
      '<div class="amap-rel">' +
      '<div class="amap-rel-col"><p class="amap-rel-k">Rests on</p>' +
      (fromC || '<span class="amap-rel-none">Nothing. This is where the argument starts.</span>') + '</div>' +
      '<div class="amap-rel-col"><p class="amap-rel-k">Leads to</p>' +
      (toC || '<span class="amap-rel-none">The end of this thread.</span>') + '</div>' +
      '</div>';

    Array.prototype.slice.call(panel.querySelectorAll('.amap-chip')).forEach(function (b) {
      b.addEventListener('click', function () {
        var t = byId[b.getAttribute('data-go')];
        if (t) select(t.i, 'click');
      });
    });
  }

  /* ---------- highlight the local structure ---------- */
  function highlight(d) {
    var rel = {};
    d.from.concat(d.to).forEach(function (id) { rel[id] = true; });
    order.forEach(function (o) {
      var g = nodeEls[o.id];
      g.classList.toggle('is-on', o.id === d.id);
      g.classList.toggle('is-rel', !!rel[o.id]);
      g.classList.toggle('is-dim', o.id !== d.id && !rel[o.id]);
    });
    edgeEls.forEach(function (p) {
      var on = p.getAttribute('data-from') === d.id || p.getAttribute('data-to') === d.id;
      p.classList.toggle('is-on', on);
      p.classList.toggle('is-dim', !on);
    });
  }

  /* ---------- select an idea ---------- */
  function select(i, how) {
    cur = Math.max(0, Math.min(order.length - 1, i));
    var d = order[cur];
    renderPanel(d);
    highlight(d);
    posEl.innerHTML = '<b>' + d.num + '</b> / ' + order.length;
    prevBtn.disabled = cur === 0;
    nextBtn.disabled = cur === order.length - 1;
    if (how !== 'init') history.replaceState(null, '', '#' + d.id);
    if (how === 'click' && window.matchMedia('(max-width: 939px)').matches) {
      panel.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'nearest' });
    }
  }
  function prefersReduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- wire it up ---------- */
  function wire() {
    prevBtn.onclick = function () { select(cur - 1, 'nav'); };
    nextBtn.onclick = function () { select(cur + 1, 'nav'); };
    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft') { select(cur - 1, 'nav'); }
      else if (e.key === 'ArrowRight') { select(cur + 1, 'nav'); }
    });
    window.addEventListener('hashchange', function () {
      var d = byId[location.hash.slice(1)];
      if (d && d.i !== cur) select(d.i, 'nav');
    });
  }

  function boot() {
    canvas = $('amap-canvas');
    panel = $('amap-panel');
    posEl = $('amap-pos');
    prevBtn = $('amap-prev');
    nextBtn = $('amap-next');
    if (!canvas || !panel || !readCards()) return;   /* leave the plain cards in place */

    var wrapEl = document.querySelector('.amap-wrap');
    if (wrapEl) wrapEl.hidden = false;

    buildMap();
    wire();

    var start = byId[location.hash.slice(1)];
    select(start ? start.i : 0, 'init');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
