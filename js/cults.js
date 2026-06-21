/* ============================================================
   cults.js
   Self-contained behavior for the "How a Path Becomes a Cage"
   case study. Two independent, guarded pieces:
     1. scroll-reveal + figure draw-in animations
     2. the case explorer (cards + compare table)
   One failing never breaks the other. No em dashes.
   ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 1. REVEAL + FIGURE ANIMATION ---------- */
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

  /* ---------- 2. THE CASE EXPLORER ---------- */
  (function () {
    var mount = $('explorer');
    if (!mount || !window.CULTS) { if (mount) setTimeout(arguments.callee, 60); return; }
    var FAMS = window.CULTS.fams, ORDER = window.CULTS.order, C = window.CULTS.cases;
    var cur = ORDER[0], view = 'card';

    function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; }); }

    function chips() {
      return ORDER.map(function (id) {
        var t = C[id], c = FAMS[t.fam].color;
        return '<button class="mx-chip' + (id === cur ? ' is-cur' : '') + '" data-id="' + id + '" style="--fam:' + c + '">' + esc(t.name) + '</button>';
      }).join('');
    }

    function row(k, body) { return '<div class="mx-row"><p class="mx-k">' + k + '</p>' + body + '</div>'; }

    function cardHtml(id) {
      var t = C[id], fam = FAMS[t.fam], idx = ORDER.indexOf(id);
      var h = '<div class="mx-card" style="--fam:' + fam.color + '">';
      h += '<p class="mx-fam">' + esc(fam.label) + '</p>';
      h += '<h3 class="mx-name">' + esc(t.name) + '</h3>';
      if (t.also) h += '<p class="mx-also">' + esc(t.also) + '</p>';
      h += '<p class="mx-one">' + t.one + '</p>';
      h += row('What it promised', '<p class="mx-v">' + t.promise + '</p>');
      h += row('The leader', '<p class="mx-v">' + t.leader + '</p>');
      h += row('How the cage closed', '<p class="mx-v">' + t.caged + '</p>');
      h += row('The cost of leaving', '<p class="mx-v">' + t.cost + '</p>');
      h += row('How it ended', '<p class="mx-v">' + t.end + '</p>');
      h += '<div class="mx-nav">' +
        '<button class="mx-navb" id="mx-prev"' + (idx === 0 ? ' disabled' : '') + '>&lsaquo; ' + (idx > 0 ? esc(C[ORDER[idx - 1]].name) : '') + '</button>' +
        '<button class="mx-navb" id="mx-next"' + (idx === ORDER.length - 1 ? ' disabled' : '') + '>' + (idx < ORDER.length - 1 ? esc(C[ORDER[idx + 1]].name) : '') + ' &rsaquo;</button>' +
        '</div>';
      h += '</div>';
      return h;
    }

    function tableHtml() {
      var rows = ORDER.map(function (id) {
        var t = C[id], fam = FAMS[t.fam];
        return '<tr>' +
          '<td class="t-name"><b data-id="' + id + '"><span class="fam-dot" style="background:' + fam.color + '"></span>' + esc(t.name) + '</b></td>' +
          '<td>' + esc(t.founded) + '</td>' +
          '<td>' + esc(t.began) + '</td>' +
          '<td>' + esc(t.endshort) + '</td>' +
          '</tr>';
      }).join('');
      return '<div class="mx-tablewrap"><table class="mx-table"><thead><tr>' +
        '<th>Group</th><th>Founded</th><th>Began as</th><th>How it ended</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function render() {
      $('mx-count').innerHTML = '<b>' + ORDER.length + '</b> cases';
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

    function go(id) { if (C[id]) { cur = id; view = 'card'; render(); } }

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
})();
