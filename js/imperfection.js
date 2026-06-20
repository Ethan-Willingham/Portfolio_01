/* The Spirituality of Imperfection: the cross-tradition story gallery.
   Reads the authored .tale cards in the page, builds a one-at-a-time
   gallery with tradition chips, arrow buttons, and keyboard support.
   No dependencies. Without JS the .tale cards read as a plain list. */
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

  var tales = [].slice.call(source.querySelectorAll('.tale')).map(function (el) {
    return {
      tradition: el.getAttribute('data-tradition') || '',
      place: el.getAttribute('data-place') || '',
      ta: el.style.getPropertyValue('--ta') || 'var(--accent)',
      title: html(el, '.tale-h'),
      body: html(el, '.tale-body'),
      lesson: html(el, '.tale-lesson'),
      src: html(el, '.tale-src')
    };
  });
  if (!tales.length) return;

  var frame = document.getElementById('gal-frame');
  var chipsBox = document.getElementById('gal-chips');
  var pos = document.getElementById('gal-pos');
  var prev = document.getElementById('gal-prev');
  var next = document.getElementById('gal-next');
  var cur = 0;

  var chips = tales.map(function (t, i) {
    var b = document.createElement('button');
    b.className = 'gal-chip';
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.style.setProperty('--ta', t.ta);
    b.innerHTML = '<span class="dot" aria-hidden="true"></span>' + t.tradition;
    b.addEventListener('click', function () { go(i); });
    chipsBox.appendChild(b);
    return b;
  });

  function render() {
    var t = tales[cur];
    frame.style.setProperty('--ta', t.ta);
    frame.innerHTML =
      '<p class="gal-card-k">' + t.tradition + ' <span class="place">' + t.place + '</span></p>' +
      '<h3 class="gal-card-h">' + t.title + '</h3>' +
      '<div class="gal-card-body">' + t.body + '</div>' +
      '<p class="gal-lesson"><span class="lk">what it teaches</span>' + t.lesson + '</p>' +
      '<p class="gal-src">' + t.src + '</p>';
    pos.innerHTML = '<b>' + (cur + 1) + '</b> / ' + tales.length;
    prev.disabled = cur === 0;
    next.disabled = cur === tales.length - 1;
    chips.forEach(function (c, i) {
      var on = i === cur;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function go(i) {
    cur = Math.max(0, Math.min(tales.length - 1, i));
    render();
  }

  prev.addEventListener('click', function () { go(cur - 1); });
  next.addEventListener('click', function () { go(cur + 1); });

  // left/right arrows step the gallery, but only while it is on screen
  // and the user is not typing in a field
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var r = wrap.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    go(cur + (e.key === 'ArrowLeft' ? -1 : 1));
  });

  wrap.hidden = false;
  render();
})();
