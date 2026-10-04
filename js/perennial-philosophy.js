/* The Perennial Philosophy: passages in context.
   Reads the authored .tale cards and presents one at a time, with passage
   tabs, arrow buttons, and keyboard support. The source cards stay readable
   until the gallery initializes, and supply the no-JS and print versions. */
(function () {
  'use strict';

  // ---- gentle reveal-on-scroll (runs first, so a later error can never
  //      leave a .reveal element stuck at opacity 0) ----
  var reveals = [].slice.call(document.querySelectorAll('.reveal'));
  if (reveals.length) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -10% 0px' });
      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add('in'); });
    }
  }

  // ---- the gallery ----
  var wrap = document.querySelector('.gal-wrap');
  var source = document.getElementById('tales-data');
  if (!wrap || !source) return;

  function html(el, sel) {
    var node = el.querySelector(sel);
    return node ? node.innerHTML : '';
  }

  var claims = [].slice.call(source.querySelectorAll('.tale')).map(function (el) {
    return {
      name: el.getAttribute('data-tradition') || '',
      place: el.getAttribute('data-place') || '',
      ta: el.style.getPropertyValue('--ta') || 'var(--accent)',
      kicker: html(el, '.tale-k'),
      title: html(el, '.tale-h'),
      body: html(el, '.tale-body'),
      lesson: html(el, '.tale-lesson'),
      src: html(el, '.tale-src')
    };
  });
  if (!claims.length) return;

  var frame = document.getElementById('gal-frame');
  var chipsBox = document.getElementById('gal-chips');
  var pos = document.getElementById('gal-pos');
  var prev = document.getElementById('gal-prev');
  var next = document.getElementById('gal-next');
  if (!frame || !chipsBox || !pos || !prev || !next) return;
  var cur = 0;
  frame.setAttribute('role', 'tabpanel');
  frame.tabIndex = 0;

  var chips = claims.map(function (d, i) {
    var b = document.createElement('button');
    b.className = 'gal-chip';
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.id = 'perennial-tab-' + (i + 1);
    b.setAttribute('aria-controls', frame.id);
    b.style.setProperty('--ta', d.ta);
    b.innerHTML = '<span class="dot" aria-hidden="true"></span>' + d.name;
    b.addEventListener('click', function () { go(i); });
    chipsBox.appendChild(b);
    return b;
  });

  function render() {
    var d = claims[cur];
    frame.style.setProperty('--ta', d.ta);
    frame.innerHTML =
      '<p class="gal-card-k">' + d.kicker + ' <span class="place">' + d.place + '</span></p>' +
      '<h3 class="gal-card-h">' + d.title + '</h3>' +
      '<div class="gal-card-body">' + d.body + '</div>' +
      (d.lesson ? '<p class="gal-lesson">' + d.lesson + '</p>' : '') +
      '<p class="gal-src">' + d.src + '</p>';
    frame.setAttribute('aria-labelledby', chips[cur].id);
    pos.innerHTML = '<b>' + (cur + 1) + '</b> / ' + claims.length;
    prev.disabled = cur === 0;
    next.disabled = cur === claims.length - 1;
    chips.forEach(function (c, i) {
      var on = i === cur;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
      c.tabIndex = on ? 0 : -1;
    });
  }

  function go(i) {
    cur = Math.max(0, Math.min(claims.length - 1, i));
    render();
  }

  prev.addEventListener('click', function () { go(cur - 1); });
  next.addEventListener('click', function () { go(cur + 1); });

  // Navigation keys belong to the gallery while focus is inside it.
  wrap.addEventListener('keydown', function (e) {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) < 0) return;
    e.preventDefault();
    var fromTab = chips.indexOf(document.activeElement) >= 0;
    if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(claims.length - 1);
    else go(cur + (e.key === 'ArrowLeft' ? -1 : 1));
    if (fromTab) chips[cur].focus();
  });

  render();
  source.classList.add('gallery-ready');
  wrap.hidden = false;
})();
