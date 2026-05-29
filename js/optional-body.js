/* ============================================================
   OPTIONAL BODY — "How Much of You Do You Need?"
   The scroll engine. Vanilla, single IIFE, var-style to match
   the rest of the site. One IntersectionObserver drives a
   cumulative, idempotent state: which figure parts are gone,
   the running counter, the cost ledger, the per-tier mood, the
   head-zoom, the no-pulse beat, and the closing turn.
   Content lives as real HTML steps (readable without JS); this
   file is enhancement only. See OPTIONAL_BODY.md.
   ============================================================ */
(function () {
  'use strict';

  var figure  = document.getElementById('ob-figure');
  var figWrap = document.getElementById('ob-figure-wrap');
  if (!figure || !figWrap) return;

  function each(list, fn) { for (var i = 0; i < list.length; i++) fn(list[i], i); }

  var steps = [];
  each(document.querySelectorAll('.ob-step'), function (s) { steps.push(s); });
  if (!steps.length) return;

  // Every figure part that any step can remove (so we can toggle them all).
  var masterTokens = {};
  each(steps, function (s) {
    var r = s.getAttribute('data-remove');
    if (!r) return;
    each(r.split(/\s+/), function (t) { if (t) masterTokens[t] = true; });
  });

  var el = {
    check:   document.getElementById('ob-check'),
    alive:   document.getElementById('ob-alive'),
    count:   document.getElementById('ob-count'),
    cost:    document.getElementById('ob-cost'),
    costTxt: document.getElementById('ob-cost-txt'),
    costDot: document.getElementById('ob-cost-dot'),
    depth:   document.getElementById('ob-depth')
  };

  var TIER_LABEL = { '1': 'Spare parts', '2': 'Organs', '3': 'Limbs', '4': 'Life support', '5': 'The brain' };
  var COST_RANK  = { A: 1, B: 2, C: 3, D: 4 };
  var COST = {
    1: { t: 'free',         c: '#6aa978' },
    2: { t: 'a daily pill', c: '#d9b36a' },
    3: { t: 'a machine',    c: 'var(--t-accent)' },
    4: { t: 'a donor',      c: 'var(--t-accent)' }
  };

  // The no-pulse beat lives inside the heart card.
  var ecgBox   = document.getElementById('ecg-heart');
  var ecgTrace = document.getElementById('ecg-trace');
  var ecgLbl   = document.getElementById('ecg-lbl');
  var ecgBeat  = ecgTrace ? ecgTrace.getAttribute('points') : '';
  var ecgTimer = null;

  function handleEcg(stepId) {
    if (!ecgBox || !ecgTrace) return;
    if (ecgTimer) { clearTimeout(ecgTimer); ecgTimer = null; }
    // reset to a beating pulse
    ecgBox.classList.remove('flat');
    ecgTrace.setAttribute('points', ecgBeat);
    if (ecgLbl) ecgLbl.innerHTML = '<b>pulse</b>';
    if (stepId === 'heart') {
      ecgTimer = setTimeout(function () {
        ecgBox.classList.add('flat');
        ecgTrace.setAttribute('points', '0,11 120,11');
        if (ecgLbl) ecgLbl.innerHTML = '<b>no pulse</b> &mdash; still alive';
      }, 2200);
    }
  }

  var lastActive = null;

  function update(active) {
    if (active === lastActive) return;
    lastActive = active;

    var ai = steps.indexOf(active);
    var removed = {}, count = 0, costRank = 0, machines = false;

    for (var i = 0; i <= ai; i++) {
      var s = steps[i];
      if (s.hasAttribute('data-remove')) {
        count++;
        each(s.getAttribute('data-remove').split(/\s+/), function (t) { if (t) removed[t] = true; });
      }
      var c = s.getAttribute('data-cost');
      if (c && COST_RANK[c]) costRank = Math.max(costRank, COST_RANK[c]);
      if (s.getAttribute('data-machines') === 'on') machines = true;
    }

    // Apply / restore removals on the figure (idempotent on scroll-up).
    for (var token in masterTokens) {
      if (!masterTokens.hasOwnProperty(token)) continue;
      var pe = document.getElementById(token);
      if (pe) pe.classList.toggle('removed', !!removed[token]);
    }

    // Counter
    if (el.count) el.count.textContent = count;

    // Cost ledger
    if (costRank > 0 && COST[costRank]) {
      if (el.costTxt) el.costTxt.textContent = COST[costRank].t;
      if (el.costDot) el.costDot.style.background = COST[costRank].c;
      if (el.cost) el.cost.classList.add('show');
    } else if (el.cost) {
      el.cost.classList.remove('show');
    }

    // Focus highlight
    each(figure.querySelectorAll('.focus'), function (n) { n.classList.remove('focus'); });
    var fid = active.getAttribute('data-focus');
    if (fid) {
      var fe = document.getElementById(fid);
      if (fe && !fe.classList.contains('removed')) fe.classList.add('focus');
    }

    // Tier + depth + mood
    var tier = active.getAttribute('data-tier');
    if (tier) document.body.setAttribute('data-tier', tier);
    var depthText = active.getAttribute('data-depth') || TIER_LABEL[tier] || '';
    if (el.depth) { el.depth.textContent = depthText; el.depth.classList.add('show'); }

    // Machines on at the life-support tier and below
    figure.classList.toggle('machines-on', machines || (tier && +tier >= 4));

    // Zoom to the head for the brain tier; never dissolved while in the descent
    figWrap.classList.toggle('zoom-head', tier === '5');
    figWrap.classList.remove('dissolve');

    // The turn: the counter stops promising you're still alive
    var q = active.getAttribute('data-questioning') === 'yes';
    document.body.classList.toggle('questioning', q);
    if (el.alive) el.alive.textContent = q ? 'Still you?' : 'Still alive';
    if (el.check) el.check.textContent = q ? '?' : '✓';

    handleEcg(active.getAttribute('data-step'));
  }

  if ('IntersectionObserver' in window) {
    // One observer, fired at the vertical middle of the viewport.
    var io = new IntersectionObserver(function (entries) {
      each(entries, function (e) {
        e.target.classList.toggle('is-active', e.isIntersecting);
        if (e.isIntersecting) update(e.target);
      });
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 });
    each(steps, function (s) { io.observe(s); });

    // The finale: light it up, dissolve the figure, go to the void.
    var finale = document.getElementById('ob-finale');
    if (finale) {
      var fio = new IntersectionObserver(function (entries) {
        each(entries, function (e) {
          if (e.isIntersecting) {
            finale.classList.add('lit');
            figWrap.classList.add('dissolve');
            document.body.setAttribute('data-tier', '6');
            document.body.classList.add('questioning');
            if (el.alive) el.alive.textContent = 'Still you?';
            if (el.check) el.check.textContent = '?';
          } else if (e.boundingClientRect.top > 0) {
            // scrolled back up above the finale
            finale.classList.remove('lit');
            figWrap.classList.remove('dissolve');
          }
        });
      }, { rootMargin: '-35% 0px -35% 0px', threshold: 0 });
      fio.observe(finale);
    }
  } else {
    // No IntersectionObserver: reveal everything so the piece still reads.
    each(steps, function (s) { s.classList.add('is-active'); });
    var fin = document.getElementById('ob-finale');
    if (fin) fin.classList.add('lit');
  }

  // Body-check interactions (palmaris, ear-wiggle, ...).
  each(document.querySelectorAll('.ob-check'), function (check) {
    var btns   = check.querySelectorAll('.ob-cbtn');
    var result = check.querySelector('.ob-check-result');
    var mini   = check.querySelector('.ob-mini');
    each(btns, function (btn) {
      btn.addEventListener('click', function () {
        each(btns, function (b) { b.classList.remove('sel'); });
        btn.classList.add('sel');
        if (result) { result.textContent = btn.getAttribute('data-msg') || ''; result.classList.add('show'); }
        if (mini) mini.classList.toggle('show-it', btn.getAttribute('data-show') === '1');
      });
    });
  });

  // "Put yourself back together" — return to the top.
  var restart = document.getElementById('ob-restart');
  if (restart) {
    restart.addEventListener('click', function (ev) {
      ev.preventDefault();
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  }
})();
