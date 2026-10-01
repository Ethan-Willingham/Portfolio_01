/* Illustrated scene previews, with native selects retained as the fallback. */
(function () {
  'use strict';

  var pickers = [], dialog, grid, title, subtitle, activePicker, remembered;
  var categoryHints = {
    pathfinding: 'Find a route', sorting: 'Put rings in order', emergence: 'Small rules, living worlds',
    randomness: 'Clumps and order', attractors: 'Chaotic trails', fractals: 'Repeating forms',
    numbers: 'Patterns in numbers', geometry: 'Linked shapes'
  };
  var sceneHints = {
    astar: 'Aim toward the goal', bfs: 'Outward wave', bidir: 'Meet in the middle', dijkstra: 'Lowest cost',
    wavefront: 'Many starting points', randomflood: 'Noisy wave', dfs: 'Dive, then backtrack', randomwalk: 'Random steps',
    bubble: 'Neighbor swaps', insertion: 'Slide into place',
    quick: 'Split around a pivot', heap: 'Build a heap', bitonic: 'Parallel comparisons',
    pancake: 'Flip whole groups',
    boids: 'A flock in motion', ocean: 'Moving waves', lsystem: 'Branches grow and sway',
    ants: 'Discover food and build trails',
    mulberry: 'Clumps and gaps', grid: 'Even spacing', thomas: 'Woven lattice', lorenz: 'Butterfly loops',
    aizawa: 'Sphere and spike', dadras: 'Four lobes', clifford: 'Folded knot',
    sierpinski: 'Repeating pyramids', jerusalem: 'Hollow cubes', vicsek: 'Repeating crosses',
    primes3d: 'Spherical gaps', gprimes: 'Prime-number grid', collatz: 'Branching tree', pi: 'Paths from digits',
    recaman: 'Jumping loops', metatron: 'Connected forms', hopf: 'Linked circles', lotus: 'Geometric flower',
    harmonics: 'Overlapping waves'
  };

  function preview(picker, value) {
    return 'assets/galaxy-previews/' + (picker.category ? remembered[value] : value) + '.svg?v=1.75';
  }
  function image(src, lazy) {
    var img = document.createElement('img');
    if (src) img.src = src;
    img.alt = ''; img.width = 320; img.height = 200;
    img.decoding = 'async'; img.loading = lazy ? 'lazy' : 'eager';
    return img;
  }
  function sync() {
    pickers.forEach(function (picker) {
      var option = picker.select.selectedOptions[0];
      if (!option || !option.value) option = Array.from(picker.select.options).find(function (o) { return o.value; });
      picker.value.textContent = option.textContent;
      picker.image.src = preview(picker, option.value);
      picker.button.setAttribute('aria-label', picker.select.getAttribute('aria-label') + ': ' + option.textContent);
      picker.button.classList.toggle('gx-picker-trigger--active', picker.select.classList.contains('gx-cat-select--active'));
    });
  }
  function open(picker) {
    activePicker = picker;
    var categorySelect = picker.select.closest('.gx-group').querySelector('.gx-category-select');
    title.textContent = picker.category
      ? (picker.select.id === 'gx-watch-category' ? 'Watch algorithms' : 'Explore math')
      : categorySelect.selectedOptions[0].textContent;
    var noun = picker.label.toLowerCase();
    subtitle.textContent = picker.category ? 'Choose a category' : 'Choose ' + (noun === 'algorithm' ? 'an ' : 'a ') + noun;
    grid.replaceChildren();
    Array.from(picker.select.options).filter(function (o) { return o.value && !o.disabled; }).forEach(function (option) {
      var card = document.createElement('button');
      card.type = 'button'; card.className = 'gx-picker-card';
      card.dataset.value = option.value;
      card.setAttribute('aria-label', option.textContent);
      card.setAttribute('aria-pressed', String(option.value === picker.select.value));
      card.appendChild(image(preview(picker, option.value), true));
      var name = document.createElement('span'); name.className = 'gx-picker-name'; name.textContent = option.textContent;
      var hint = document.createElement('span'); hint.className = 'gx-picker-hint';
      hint.textContent = (picker.category ? categoryHints : sceneHints)[option.value] || '';
      card.append(name, hint);
      card.addEventListener('click', function () {
        dialog.close();
        picker.select.value = option.value;
        picker.select.dispatchEvent(new Event('change', { bubbles:true }));
        sync();
      });
      grid.appendChild(card);
    });
    picker.button.setAttribute('aria-expanded', 'true');
    dialog.showModal();
    var selected = grid.querySelector('[aria-pressed="true"]') || grid.firstElementChild;
    selected.focus({ preventScroll:true });
    selected.scrollIntoView({ block:'nearest' });
  }
  function init(root, categoryScenes) {
    if (dialog) return;
    remembered = categoryScenes;
    dialog = document.createElement('dialog'); dialog.id = 'gx-picker-dialog'; dialog.className = 'gx-picker-dialog';
    dialog.setAttribute('aria-labelledby', 'gx-picker-title');
    var header = document.createElement('div'); header.className = 'gx-picker-header';
    var heading = document.createElement('div');
    subtitle = document.createElement('p'); subtitle.className = 'gx-picker-subtitle';
    title = document.createElement('h2'); title.id = 'gx-picker-title';
    heading.append(subtitle, title);
    var close = document.createElement('button'); close.type = 'button'; close.className = 'gx-fs-btn';
    close.textContent = 'Close'; close.addEventListener('click', function () { dialog.close(); });
    header.append(heading, close);
    grid = document.createElement('div'); grid.className = 'gx-picker-grid';
    dialog.append(header, grid); root.appendChild(dialog);
    dialog.addEventListener('close', function () {
      if (activePicker) activePicker.button.setAttribute('aria-expanded', 'false');
      activePicker = null;
    });
    dialog.addEventListener('click', function (e) {
      if (e.target !== dialog) return;
      var b = dialog.getBoundingClientRect();
      if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) dialog.close();
    });
    grid.addEventListener('keydown', function (e) {
      var cards = Array.from(grid.children), index = cards.indexOf(e.target);
      if (index < 0) return;
      var columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length, next;
      if (e.key === 'ArrowRight') next = index + 1;
      else if (e.key === 'ArrowLeft') next = index - 1;
      else if (e.key === 'ArrowDown') next = index + columns;
      else if (e.key === 'ArrowUp') next = index - columns;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = cards.length - 1;
      else return;
      e.preventDefault(); cards[Math.max(0, Math.min(cards.length - 1, next))].focus();
    });
    root.querySelectorAll('.gx-category-select, .gx-cat-select').forEach(function (select) {
      var picker = { select:select, category:select.classList.contains('gx-category-select'), label:select.parentElement.querySelector('span').textContent };
      picker.button = document.createElement('button'); picker.button.type = 'button'; picker.button.className = 'gx-picker-trigger';
      picker.button.setAttribute('aria-haspopup', 'dialog'); picker.button.setAttribute('aria-controls', dialog.id);
      picker.button.setAttribute('aria-expanded', 'false');
      picker.image = image('', false);
      picker.value = document.createElement('span'); picker.value.className = 'gx-picker-value';
      var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      arrow.setAttribute('viewBox', '0 0 16 16'); arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
      picker.button.append(picker.image, picker.value, arrow);
      picker.button.addEventListener('click', function () { open(picker); });
      select.hidden = true; select.parentElement.appendChild(picker.button);
      select.addEventListener('change', sync); pickers.push(picker);
    });
    sync();
  }
  window.GXPicker = { init:init, sync:sync };
})();
