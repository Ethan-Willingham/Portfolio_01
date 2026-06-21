/* In Praise of Shadows: the five-words gallery.
   Reads the authored .tale cards in the page, builds a one-at-a-time
   gallery with word chips, arrow buttons, and keyboard support.
   No dependencies. Without JS the .tale cards read as a plain list.
   (Cloned from js/frankl.js; same shell, same pattern.) */
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

  var words = [].slice.call(source.querySelectorAll('.tale')).map(function (el) {
    return {
      name: el.getAttribute('data-tradition') || '',
      place: el.getAttribute('data-place') || '',
      ta: el.style.getPropertyValue('--ta') || 'var(--accent)',
      kicker: html(el, '.tale-k'),
      title: html(el, '.tale-h'),
      say: html(el, '.tale-say'),
      body: html(el, '.tale-body'),
      lesson: html(el, '.tale-lesson'),
      src: html(el, '.tale-src')
    };
  });
  if (!words.length) return;

  var frame = document.getElementById('gal-frame');
  var chipsBox = document.getElementById('gal-chips');
  var pos = document.getElementById('gal-pos');
  var prev = document.getElementById('gal-prev');
  var next = document.getElementById('gal-next');
  var cur = 0;

  var chips = words.map(function (d, i) {
    var b = document.createElement('button');
    b.className = 'gal-chip';
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.style.setProperty('--ta', d.ta);
    b.innerHTML = '<span class="dot" aria-hidden="true"></span>' + d.name;
    b.addEventListener('click', function () { go(i); });
    chipsBox.appendChild(b);
    return b;
  });

  function render() {
    var d = words[cur];
    frame.style.setProperty('--ta', d.ta);
    frame.innerHTML =
      '<p class="gal-card-k">' + d.kicker + ' <span class="place">' + d.place + '</span></p>' +
      '<h3 class="gal-card-h">' + d.title + '</h3>' +
      (d.say ? '<p class="gal-card-say">' + d.say + '</p>' : '') +
      '<div class="gal-card-body">' + d.body + '</div>' +
      '<p class="gal-lesson"><span class="lk">the line</span>' + d.lesson + '</p>' +
      '<p class="gal-src">' + d.src + '</p>';
    pos.innerHTML = '<b>' + (cur + 1) + '</b> / ' + words.length;
    prev.disabled = cur === 0;
    next.disabled = cur === words.length - 1;
    chips.forEach(function (c, i) {
      var on = i === cur;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function go(i) {
    cur = Math.max(0, Math.min(words.length - 1, i));
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
