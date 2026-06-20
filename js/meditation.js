/* ============================================================
   meditation.js
   Self-contained behavior for the Meditation field guide.
   Three independent, guarded pieces:
     1. scroll-reveal + chart draw-in animations
     2. the technique explorer (cards + compare table)
     3. the breathing pacer
   One failing never breaks the others. No em dashes.
   ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 1. REVEAL + CHART ANIMATION ---------- */
  (function () {
    var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    function fire(el) {
      el.classList.add('in');
      var anim = el.querySelectorAll('.draw, .fade-el');
      for (var i = 0; i < anim.length; i++) anim[i].classList.add('go');
    }
    if (!('IntersectionObserver' in window)) { reveals.forEach(fire); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { fire(e.target); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
    setTimeout(function () { reveals.forEach(function (el) { if (!el.classList.contains('in')) fire(el); }); }, 4000);
  })();

  /* ---------- 2. THE TECHNIQUE EXPLORER ---------- */
  (function () {
    var mount = $('explorer');
    if (!mount || !window.MED) { if (mount) setTimeout(arguments.callee, 60); return; }
    var MED = window.MED, FAMS = MED.fams, ORDER = MED.order, T = MED.techniques;
    var cur = ORDER[0], view = 'card';
    var GRADE = { a: ['g-a', 'strong'], b: ['g-b', 'good'], c: ['g-c', 'mixed'], d: ['g-d', 'thin'] };

    function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; }); }
    function gradeChip(g) { var x = GRADE[g] || GRADE.c; return '<span class="grade ' + x[0] + '">' + x[1] + '</span>'; }

    function chips() {
      return ORDER.map(function (id) {
        var t = T[id], c = FAMS[t.fam].color;
        return '<button class="mx-chip' + (id === cur ? ' is-cur' : '') + '" data-id="' + id + '" style="--fam:' + c + '">' + esc(t.name) + '</button>';
      }).join('');
    }

    function cardHtml(id) {
      var t = T[id], fam = FAMS[t.fam], idx = ORDER.indexOf(id);
      var h = '<div class="mx-card" style="--fam:' + fam.color + '">';
      h += '<p class="mx-fam">' + esc(fam.label) + '</p>';
      h += '<h3 class="mx-name">' + esc(t.name) + '</h3>';
      if (t.also) h += '<p class="mx-also">also: ' + esc(t.also) + '</p>';
      h += '<p class="mx-one">' + t.one + '</p>';
      h += row('Where it came from', '<p class="mx-v">' + t.origin + '</p>');
      h += row('What it claims', '<p class="mx-v">' + t.claims + '</p>');
      h += row('What the evidence shows' + gradeChip(t.grade), '<p class="mx-v">' + t.ev + '</p>');
      var steps = '<ol class="mx-how">' + t.how.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>';
      h += row('How to do the core of it', steps +
        '<div class="mx-meta"><div><b>How long.</b> ' + esc(t.time) + '</div></div>' +
        '<p class="mx-miss" style="margin-top:.7rem"><b>Common mistakes.</b> ' + t.miss + '</p>' +
        (t.note ? '<p class="mx-miss" style="margin-top:.5rem;color:var(--text-faint)">' + t.note + '</p>' : ''));
      h += '<div class="mx-nav">' +
        '<button class="mx-navb" id="mx-prev"' + (idx === 0 ? ' disabled' : '') + '>&lsaquo; ' + (idx > 0 ? esc(T[ORDER[idx - 1]].name) : '') + '</button>' +
        '<button class="mx-navb" id="mx-next"' + (idx === ORDER.length - 1 ? ' disabled' : '') + '>' + (idx < ORDER.length - 1 ? esc(T[ORDER[idx + 1]].name) : '') + ' &rsaquo;</button>' +
        '</div>';
      h += '</div>';
      return h;
    }
    function row(k, body) { return '<div class="mx-row"><p class="mx-k">' + k + '</p>' + body + '</div>'; }

    function tableHtml() {
      var rows = ORDER.map(function (id) {
        var t = T[id], fam = FAMS[t.fam];
        return '<tr>' +
          '<td class="t-name"><b data-id="' + id + '">' + esc(t.name) + '</b></td>' +
          '<td>' + esc(t.object) + '</td>' +
          '<td><span class="fam-dot" style="background:' + fam.color + '"></span>' + esc(fam.label) + '</td>' +
          '<td>' + gradeChip(t.grade) + '</td>' +
          '<td>' + esc(shortTime(t.time)) + '</td>' +
          '</tr>';
      }).join('');
      return '<div class="mx-tablewrap"><table class="mx-table"><thead><tr>' +
        '<th>Technique</th><th>You attend to</th><th>Family</th><th>Evidence</th><th>To start</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    function shortTime(s) { return s.split(/[.;]/)[0].replace(/^(About|As little as)\s*/i, ''); }

    function render() {
      $('mx-count').innerHTML = '<b>' + ORDER.length + '</b> techniques';
      document.querySelectorAll('#mx-views button').forEach(function (b) {
        b.classList.toggle('is-on', b.getAttribute('data-view') === view);
      });
      var chipWrap = $('mx-chips'), cardWrap = $('mx-card'), tableWrap = $('mx-table');
      chipWrap.hidden = (view === 'table');
      cardWrap.hidden = (view === 'table');
      tableWrap.hidden = (view !== 'table');
      if (view === 'table') {
        tableWrap.innerHTML = tableHtml();
        wireTable();
      } else {
        chipWrap.innerHTML = chips();
        cardWrap.innerHTML = cardHtml(cur);
        wireCard();
      }
    }

    function go(id) { if (T[id]) { cur = id; view = 'card'; render(); } }

    function wireCard() {
      document.querySelectorAll('#mx-chips .mx-chip').forEach(function (b) {
        b.onclick = function () { cur = b.getAttribute('data-id'); render(); };
      });
      var p = $('mx-prev'), n = $('mx-next'), i = ORDER.indexOf(cur);
      if (p) p.onclick = function () { if (i > 0) go(ORDER[i - 1]); };
      if (n) n.onclick = function () { if (i < ORDER.length - 1) go(ORDER[i + 1]); };
    }
    function wireTable() {
      document.querySelectorAll('#mx-table b[data-id]').forEach(function (b) {
        b.onclick = function () { go(b.getAttribute('data-id')); };
      });
    }

    document.querySelectorAll('#mx-views button').forEach(function (b) {
      b.onclick = function () { view = b.getAttribute('data-view'); render(); };
    });

    render();
    mount.classList.add('mx-ready');
  })();

  /* ---------- 3. THE BREATHING PACER ---------- */
  (function () {
    var box = $('pacer');
    if (!box) return;
    var orb = $('pacer-orb'), phaseEl = $('pacer-phase'), subEl = $('pacer-sub');
    var btn = $('pacer-btn'), descEl = $('pacer-desc');
    var seg = $('pacer-seg');

    var PATTERNS = {
      coherent: {
        desc: '<b>Coherent breathing.</b> Smooth, even, about six breaths a minute. The daily calm setting; raises heart-rate variability.',
        steps: [{ t: 'Breathe in', d: 5000, to: 1 }, { t: 'Breathe out', d: 5500, to: 0 }]
      },
      box: {
        desc: '<b>Box breathing.</b> Four equal sides. Steadies and centers you under pressure; used by the military.',
        steps: [{ t: 'Breathe in', d: 4000, to: 1 }, { t: 'Hold', d: 4000, to: 1 }, { t: 'Breathe out', d: 4000, to: 0 }, { t: 'Hold', d: 4000, to: 0 }]
      },
      sigh: {
        desc: '<b>The physiological sigh.</b> A double inhale, then a long exhale. The fastest reset; five minutes beat other methods for mood in a Stanford trial.',
        steps: [{ t: 'Breathe in', d: 1600, to: 0.78 }, { t: 'Sip in more', d: 900, to: 1 }, { t: 'Long exhale', d: 5500, to: 0 }, { t: 'Rest', d: 700, to: 0 }]
      }
    };
    var pat = 'coherent', timer = null, step = 0, running = false;
    var MIN = 0.34, MAX = 1; /* orb transform scale range, in CSS scale units of the 70px orb */

    function setOrb(to, ms) {
      var s = MIN + (MAX - MIN) * to;
      orb.style.transition = 'transform ' + ms + 'ms cubic-bezier(0.37,0,0.63,1)';
      orb.style.transform = 'scale(' + (s * 2.7).toFixed(3) + ')';
    }
    function tick() {
      if (!running) return;
      var steps = PATTERNS[pat].steps, s = steps[step % steps.length];
      phaseEl.textContent = s.t;
      subEl.textContent = Math.round(s.d / 1000) + ' seconds';
      setOrb(s.to, s.d);
      step++;
      timer = setTimeout(tick, s.d);
    }
    function start() {
      running = true; step = 0;
      btn.textContent = 'Stop'; btn.classList.add('is-running');
      tick();
    }
    function stop() {
      running = false; clearTimeout(timer);
      btn.textContent = 'Start'; btn.classList.remove('is-running');
      phaseEl.textContent = 'Ready'; subEl.textContent = 'Press start, and follow the circle';
      setOrb(0.18, 600);
    }
    function setDesc() { descEl.innerHTML = PATTERNS[pat].desc; }

    btn.onclick = function () { running ? stop() : start(); };
    seg.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        pat = b.getAttribute('data-pat');
        seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        setDesc();
        if (running) { clearTimeout(timer); step = 0; tick(); }
      };
    });

    setDesc();
    setOrb(0.18, 0);
  })();
})();
