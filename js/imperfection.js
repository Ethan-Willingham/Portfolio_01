/* The Spirituality of Imperfection: sourced stories and passages.
   Source cards remain readable until the gallery has rendered successfully.
   Keyboard navigation belongs to the story tabs, not the rest of the page. */
(function () {
  'use strict';

  var reveals = [].slice.call(document.querySelectorAll('.reveal'));
  if (reveals.length) {
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -10% 0px' });
      reveals.forEach(function (element) { io.observe(element); });
    } else {
      reveals.forEach(function (element) { element.classList.add('in'); });
    }
  }

  var wrap = document.querySelector('.gal-wrap');
  var source = document.getElementById('tales-data');
  var frame = document.getElementById('gal-frame');
  var tabsBox = document.getElementById('gal-chips');
  var position = document.getElementById('gal-pos');
  var previous = document.getElementById('gal-prev');
  var next = document.getElementById('gal-next');
  if (!wrap || !source || !frame || !tabsBox || !position || !previous || !next) return;

  function content(element, selector) {
    var node = element.querySelector(selector);
    return node ? node.innerHTML : '';
  }

  var stories = [].slice.call(source.querySelectorAll('.tale')).map(function (element) {
    var heading = element.querySelector('.tale-h');
    return {
      name: element.getAttribute('data-tradition') || '',
      label: heading ? heading.textContent : '',
      place: element.getAttribute('data-place') || '',
      accent: element.style.getPropertyValue('--ta') || 'var(--accent)',
      kicker: content(element, '.tale-k'),
      title: content(element, '.tale-h'),
      body: content(element, '.tale-body'),
      comment: content(element, '.tale-lesson'),
      citation: content(element, '.tale-src')
    };
  });
  if (!stories.length) return;

  var current = 0;
  frame.setAttribute('role', 'tabpanel');
  frame.tabIndex = 0;

  var tabs = stories.map(function (story, index) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'gal-chip';
    button.id = 'imperfection-tab-' + (index + 1);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-label', story.label);
    button.setAttribute('aria-controls', frame.id);
    button.style.setProperty('--ta', story.accent);
    var dot = document.createElement('span');
    dot.className = 'dot';
    dot.setAttribute('aria-hidden', 'true');
    button.appendChild(dot);
    button.appendChild(document.createTextNode(story.name));
    button.addEventListener('click', function () { select(index); });
    tabsBox.appendChild(button);
    return button;
  });

  function render() {
    var story = stories[current];
    frame.style.setProperty('--ta', story.accent);
    frame.innerHTML =
      '<p class="gal-card-k">' + story.kicker + ' <span class="place">' + story.place + '</span></p>' +
      '<h3 class="gal-card-h">' + story.title + '</h3>' +
      '<div class="gal-card-body">' + story.body + '</div>' +
      (story.comment ? '<p class="gal-lesson">' + story.comment + '</p>' : '') +
      '<p class="gal-src">' + story.citation + '</p>';
    frame.setAttribute('aria-labelledby', tabs[current].id);
    position.innerHTML = '<b>' + (current + 1) + '</b> / ' + stories.length;
    previous.disabled = current === 0;
    next.disabled = current === stories.length - 1;
    tabs.forEach(function (tab, index) {
      var selected = index === current;
      tab.classList.toggle('is-on', selected);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
    });
  }

  function select(index) {
    current = Math.max(0, Math.min(stories.length - 1, index));
    render();
    tabs[current].focus();
  }

  previous.addEventListener('click', function () { select(current - 1); });
  next.addEventListener('click', function () { select(current + 1); });

  tabsBox.addEventListener('keydown', function (event) {
    if (tabs.indexOf(document.activeElement) < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) < 0) return;
    event.preventDefault();
    if (event.key === 'Home') select(0);
    else if (event.key === 'End') select(stories.length - 1);
    else select((current + (event.key === 'ArrowLeft' ? -1 : 1) + stories.length) % stories.length);
  });

  render();
  source.classList.add('gallery-ready');
  wrap.hidden = false;
})();
