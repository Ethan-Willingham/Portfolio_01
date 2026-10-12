/* One gallery selects every scene directly. The grouped native select is the fallback. */
(function () {
  'use strict';

  var select, trigger, thumbnail, value, dialog, grid, search, result, cards = [], headings = [];
  var sceneHints = {
    astar: 'Aim toward the goal', bfs: 'An outward wave', bidir: 'Meet in the middle', dijkstra: 'Find the lowest cost',
    wavefront: 'Many starting points', randomflood: 'A noisy wave', dfs: 'Dive, then backtrack', randomwalk: 'Take random steps',
    bubble: 'Swap neighboring rings', insertion: 'Slide each ring into place', quick: 'Split around a pivot',
    heap: 'Build a heap', bitonic: 'Compare pairs in parallel', pancake: 'Flip whole groups',
    boids: 'A flock in motion', ants: 'Discover food and build trails',
    mulberry: 'Clumps and gaps', grid: 'Even spacing', thomas: 'A woven lattice', lorenz: 'Butterfly loops',
    aizawa: 'A sphere and spike', dadras: 'Four lobes', clifford: 'A folded knot',
    sierpinski: 'Repeating pyramids', jerusalem: 'Hollow cubes', vicsek: 'Repeating crosses',
    primes3d: 'Spherical gaps', gprimes: 'A prime-number grid', collatz: 'A branching tree', pi: 'Paths from digits',
    recaman: 'Jumping loops', metatron: 'Connected forms', hopf: 'Linked circles', lotus: 'A geometric flower',
    harmonics: 'Overlapping waves'
  };

  function image(scene, lazy) {
    var img = document.createElement('img');
    img.src = 'assets/galaxy-previews/' + scene + '.svg?v=1.78';
    img.alt = ''; img.width = 320; img.height = 200;
    img.decoding = 'async'; img.loading = lazy ? 'lazy' : 'eager';
    return img;
  }
  function sync() {
    if (!trigger) return;
    var option = select.selectedOptions[0];
    if (!option) return;
    value.textContent = option.textContent;
    thumbnail.src = 'assets/galaxy-previews/' + option.value + '.svg?v=1.78';
    trigger.setAttribute('aria-label', 'Choose a scene: ' + option.textContent);
    cards.forEach(function (card) {
      card.setAttribute('aria-pressed', String(card.dataset.value === select.value));
    });
  }
  function filter() {
    var terms = search.value.trim().toLowerCase().split(/\s+/);
    cards.forEach(function (card) {
      card.hidden = !terms.every(function (term) { return card.dataset.search.includes(term); });
    });
    headings.forEach(function (heading) {
      heading.hidden = !cards.some(function (card) { return card.dataset.group === heading.dataset.group && !card.hidden; });
    });
    var count = cards.filter(function (card) { return !card.hidden; }).length;
    result.textContent = count ? (search.value.trim() ? count + (count === 1 ? ' scene' : ' scenes') : '') : 'No scenes found. Try another name.';
    result.hidden = !result.textContent;
    grid.scrollTop = 0;
  }
  function open() {
    search.value = ''; filter(); sync();
    trigger.setAttribute('aria-expanded', 'true');
    dialog.showModal();
    var selected = cards.find(function (card) { return card.dataset.value === select.value; }) || cards[0];
    if (selected) {
      selected.focus({ preventScroll: true });
      selected.scrollIntoView({ block: 'nearest' });
    }
  }
  function init(root) {
    if (dialog) return;
    select = root.querySelector('#gx-scene-select');
    if (!select) return;
    dialog = document.createElement('dialog'); dialog.id = 'gx-picker-dialog'; dialog.className = 'gx-picker-dialog';
    dialog.setAttribute('aria-labelledby', 'gx-picker-title');
    var header = document.createElement('div'); header.className = 'gx-picker-header';
    var title = document.createElement('h2'); title.id = 'gx-picker-title'; title.textContent = 'Choose a scene';
    var close = document.createElement('button'); close.type = 'button'; close.className = 'gx-fs-btn';
    close.textContent = 'Close'; close.addEventListener('click', function () { dialog.close(); });
    header.append(title, close);
    search = document.createElement('input'); search.type = 'search'; search.className = 'gx-picker-search';
    search.setAttribute('aria-label', 'Find a scene'); search.setAttribute('aria-controls', 'gx-picker-grid');
    search.placeholder = 'Find a scene...'; search.autocomplete = 'off';
    result = document.createElement('p'); result.className = 'gx-picker-result'; result.setAttribute('role', 'status'); result.hidden = true;
    grid = document.createElement('div'); grid.id = 'gx-picker-grid'; grid.className = 'gx-picker-grid';
    var searchbar = document.createElement('div'); searchbar.className = 'gx-picker-searchbar';
    searchbar.append(search, result);
    dialog.append(header, searchbar, grid); root.appendChild(dialog);
    Array.from(select.querySelectorAll('optgroup')).forEach(function (group) {
      var options = Array.from(group.children).filter(function (option) { return !option.disabled; });
      if (!options.length) return;
      var heading = document.createElement('h3'); heading.className = 'gx-picker-group';
      heading.dataset.group = group.dataset.category; heading.textContent = group.label;
      grid.appendChild(heading); headings.push(heading);
      options.forEach(function (option) {
        var card = document.createElement('button'); card.type = 'button'; card.className = 'gx-picker-card';
        card.dataset.value = option.value; card.dataset.group = group.dataset.category;
        card.dataset.search = [option.textContent, sceneHints[option.value], group.label, group.dataset.category].join(' ').toLowerCase();
        card.setAttribute('aria-label', option.textContent);
        card.appendChild(image(option.value, true));
        var name = document.createElement('span'); name.className = 'gx-picker-name'; name.textContent = option.textContent;
        var hint = document.createElement('span'); hint.className = 'gx-picker-hint'; hint.textContent = sceneHints[option.value] || '';
        card.append(name, hint);
        card.addEventListener('click', function () {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          sync(); dialog.close();
        });
        grid.appendChild(card); cards.push(card);
      });
    });
    search.addEventListener('input', filter);
    search.addEventListener('keydown', function (e) {
      var first = cards.find(function (card) { return !card.hidden; });
      if (first && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); first.focus(); }
    });
    grid.addEventListener('keydown', function (e) {
      var visible = cards.filter(function (card) { return !card.hidden; });
      var index = visible.indexOf(e.target), next;
      if (index < 0) return;
      var columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      if (e.key === 'ArrowRight') next = index + 1;
      else if (e.key === 'ArrowLeft') next = index - 1;
      else if (e.key === 'ArrowDown') next = index + columns;
      else if (e.key === 'ArrowUp') next = index - columns;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = visible.length - 1;
      else return;
      e.preventDefault(); visible[Math.max(0, Math.min(visible.length - 1, next))].focus();
    });
    dialog.addEventListener('close', function () {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', function (e) {
      if (e.target !== dialog) return;
      var b = dialog.getBoundingClientRect();
      if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) dialog.close();
    });
    trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'gx-picker-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-controls', dialog.id); trigger.setAttribute('aria-expanded', 'false');
    thumbnail = image(select.value, false);
    var text = document.createElement('span'); text.className = 'gx-picker-label';
    var action = document.createElement('span'); action.className = 'gx-picker-action'; action.textContent = 'Choose a scene';
    value = document.createElement('span'); value.className = 'gx-picker-value'; text.append(action, value);
    var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('viewBox', '0 0 16 16'); arrow.setAttribute('aria-hidden', 'true');
    arrow.innerHTML = '<path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
    trigger.append(thumbnail, text, arrow); trigger.addEventListener('click', open);
    select.before(trigger); select.hidden = true; root.querySelector('label[for="gx-scene-select"]').hidden = true;
    select.addEventListener('change', sync); sync();
  }
  window.GXPicker = { init: init, sync: sync };
})();
