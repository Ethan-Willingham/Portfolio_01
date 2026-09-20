/* Smoke library presentation and local shortlist. The sampler stays portable. */
(function () {
  'use strict';
  function init() {
    var toy = window.__toy, library = window.SmokePresets;
    if (!toy || !library || !document.getElementById('toy-fallback').hidden) return;
    var shell = document.getElementById('toy');
    var panel = document.getElementById('toy-panel-smoke');
    var body = panel.querySelector('[data-presets]');
    var row = body.querySelector('[data-preset="smoke:default"]').parentNode;
    var scaleRow = body.querySelector('[data-preset="smokeScale:default"]').parentNode;
    var favorites = {}, storageKey = 'sluice-smoke-favorites-v1';
    try {
      var stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
      library.recipes.forEach(function (p) {
        if (stored && stored[p.id] && stored[p.id].preset && stored[p.id].preset.id === p.id) favorites[p.id] = stored[p.id];
      });
    } catch (e) {}
    panel.querySelector('h2').textContent = 'Exhaust library';
    var intro = document.createElement('div');
    intro.className = 'smoke-library-intro';
    intro.innerHTML = '<p>30 exhausts. Choose a look, then try it at idle, on the move, or under boost.</p>' +
      '<button class="toy-chip" id="smoke-audition">Preview on rig</button>' +
      '<div class="smoke-selection" aria-live="polite"><h3 id="smoke-name"></h3><p id="smoke-description"></p></div>' +
      '<div class="smoke-actions"><button class="toy-chip" id="smoke-favorite" aria-pressed="false">Save favorite</button>' +
      '<button class="toy-chip" id="smoke-export">Export this look</button></div>' +
      '<label class="smoke-filter-label" for="smoke-family">Collection</label>' +
      '<select id="smoke-family"><option value="all">All 30 exhausts</option><option value="favorites">Favorites</option></select>';
    body.insertBefore(intro, row);
    row.querySelector('label').remove();
    row.className = 'smoke-catalog';
    row.setAttribute('aria-label', 'Exhaust recipes');
    var filter = intro.querySelector('select');
    var families = [];
    library.recipes.forEach(function (recipe) {
      if (families.indexOf(recipe.family) < 0) {
        families.push(recipe.family);
        var option = document.createElement('option');
        option.value = recipe.family; option.textContent = recipe.family;
        filter.appendChild(option);
      }
      var button = row.querySelector('[data-preset="smoke:' + recipe.id + '"]');
      button.classList.add('smoke-recipe');
      button.dataset.family = recipe.family;
      button.title = recipe.description;
      var swatch = document.createElement('i');
      swatch.className = 'smoke-recipe-swatch'; swatch.setAttribute('aria-hidden', 'true');
      swatch.style.background = 'linear-gradient(135deg,' + recipe.colors.join(',') + ')';
      button.prepend(swatch);
      button.addEventListener('click', function () {
        if (filter.value === 'favorites') restore(favorites[recipe.id]);
        sync();
      });
    });
    var empty = document.createElement('p'); empty.className = 'smoke-empty';
    empty.textContent = 'Save a favorite above to start your shortlist.'; empty.hidden = true;
    body.insertBefore(empty, scaleRow);
    var tuning = document.createElement('details'); tuning.className = 'toy-details smoke-tuning';
    tuning.innerHTML = '<summary>Tune this exhaust</summary><div class="toy-sliders"></div>';
    body.appendChild(tuning);
    tuning.appendChild(scaleRow);
    [['mass', 'Mass'], ['motion', 'Liveliness'], ['size', 'Size']].forEach(function (pair) {
      var wrap = document.createElement('div'); wrap.className = 'toy-slider';
      wrap.innerHTML = '<label for="smoke-' + pair[0] + '">' + pair[1] + '<b>100%</b></label>' +
        '<input type="range" id="smoke-' + pair[0] + '" min="25" max="250" value="100" step="5">';
      wrap.querySelector('input').addEventListener('input', function (event) {
        toy.smokeTune(pair[0], Number(event.target.value) / 100); sync();
      });
      tuning.querySelector('.toy-sliders').appendChild(wrap);
    });
    var reset = document.createElement('button'); reset.className = 'toy-chip'; reset.textContent = 'Reset tuning';
    reset.addEventListener('click', function () {
      ['mass', 'motion', 'size'].forEach(function (key) { toy.smokeTune(key, 1); });
      toy.set('smokeScale', 'default'); toy.clearSmoke(); sync();
    });
    tuning.appendChild(reset);
    var footer = document.createElement('div'); footer.className = 'smoke-library-footer';
    footer.innerHTML = '<label><input type="checkbox" id="smoke-clean" checked> Clear smoke when switching</label>' +
      '<div class="smoke-actions"><button class="toy-chip" id="smoke-clear">Clear smoke</button>' +
      '<button class="toy-chip" id="smoke-export-favorites">Export favorites</button></div>' +
      '<p id="smoke-notice" role="status">Favorites stay in this browser. Exports include your tuning.</p>';
    body.appendChild(footer);

    // This compact strip stays available with the library closed.
    var transport = document.createElement('div'); transport.className = 'toy-rig-controls'; transport.hidden = true;
    transport.innerHTML = '<button class="toy-chip" id="smoke-prev" aria-label="Previous exhaust">Previous</button>' +
      '<button class="smoke-now" id="smoke-current" title="Open exhaust library"></button>' +
      '<button class="toy-chip" id="smoke-next" aria-label="Next exhaust">Next</button>' +
      '<label for="smoke-rig-mode">Rig</label><select id="smoke-rig-mode" aria-label="Rig preview motion">' +
      '<option value="idle">Idle</option><option value="drive">Drive</option><option value="boost">Boost</option></select>';
    shell.querySelector('.toy-top').appendChild(transport);
    function visibleRecipes() {
      return library.recipes.filter(function (p) {
        return filter.value === 'all' || filter.value === p.family || (filter.value === 'favorites' && favorites[p.id]);
      });
    }
    function restore(saved) {
      if (!saved) return;
      if (saved.scale) toy.set('smokeScale', saved.scale.id);
      if (saved.tuning) ['mass', 'motion', 'size'].forEach(function (k) { toy.smokeTune(k, saved.tuning[k]); });
    }
    function next(direction) {
      var list = visibleRecipes(); if (!list.length) return;
      var index = list.findIndex(function (p) { return p.id === toy.smokePreset().id; });
      var recipe = list[(index + direction + list.length) % list.length];
      toy.set('smokePreset', recipe.id);
      if (filter.value === 'favorites') restore(favorites[recipe.id]);
      sync();
    }
    function sync() {
      var state = toy.smokePreset(), recipe = library.byId[state.id];
      document.getElementById('smoke-name').textContent = recipe.name;
      document.getElementById('smoke-description').textContent = recipe.description;
      document.getElementById('smoke-current').textContent = recipe.name;
      var favorite = document.getElementById('smoke-favorite');
      favorite.textContent = favorites[state.id] ? 'Remove favorite' : 'Save favorite';
      favorite.setAttribute('aria-pressed', String(!!favorites[state.id]));
      row.querySelectorAll('[data-preset]').forEach(function (button) {
        var id = button.dataset.preset.split(':')[1];
        button.hidden = !(filter.value === 'all' || filter.value === button.dataset.family ||
          (filter.value === 'favorites' && favorites[id]));
        button.setAttribute('aria-pressed', String(id === state.id));
      });
      empty.hidden = visibleRecipes().length > 0;
      document.getElementById('smoke-export-favorites').disabled = !Object.keys(favorites).length;
      filter.options[1].textContent = 'Favorites (' + Object.keys(favorites).length + ')';
      ['mass', 'motion', 'size'].forEach(function (key) {
        var input = document.getElementById('smoke-' + key);
        input.value = Math.round(state.tuning[key] * 100);
        input.previousElementSibling.querySelector('b').textContent = input.value + '%';
      });
      transport.hidden = toy.stats().scene !== 'rig';
      shell.classList.toggle('smoke-library-open', !panel.hidden);
      toy.resize();
    }
    function notice(message) { document.getElementById('smoke-notice').textContent = message; }
    function download(name, value) {
      var url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
      var link = document.createElement('a'); link.href = url; link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      notice('Exported ' + name + '.');
    }
    filter.addEventListener('change', sync);
    document.getElementById('smoke-favorite').addEventListener('click', function () {
      var id = toy.smokePreset().id;
      if (favorites[id]) delete favorites[id]; else favorites[id] = toy.smokeExport();
      try { localStorage.setItem(storageKey, JSON.stringify(favorites)); notice('Shortlist saved in this browser.'); }
      catch (e) { notice('Browser storage is unavailable. Export your favorites to keep them.'); }
      sync();
    });
    document.getElementById('smoke-audition').addEventListener('click', function () {
      toy.scene('rig'); toy.pause(false); sync();
    });
    document.getElementById('smoke-prev').addEventListener('click', function () { next(-1); });
    document.getElementById('smoke-next').addEventListener('click', function () { next(1); });
    document.getElementById('smoke-current').addEventListener('click', function () {
      if (panel.hidden) document.querySelector('[data-panel="smoke"]').click();
    });
    document.getElementById('smoke-rig-mode').addEventListener('change', function (event) { toy.smokeRigMode(event.target.value); });
    document.getElementById('smoke-clean').addEventListener('change', function (event) { toy.smokeClean(event.target.checked); });
    document.getElementById('smoke-clear').addEventListener('click', function () { toy.clearSmoke(); });
    document.getElementById('smoke-export').addEventListener('click', function () {
      download('sluice-smoke-' + toy.smokePreset().id + '.json', toy.smokeExport());
    });
    document.getElementById('smoke-export-favorites').addEventListener('click', function () {
      download('sluice-smoke-shortlist.json', { schema: 'sluice-smoke-shortlist', version: 1, recipes: Object.values(favorites) });
    });
    var observer = new MutationObserver(sync);
    observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    shell.querySelectorAll('[data-scene], [data-preset]').forEach(function (button) {
      observer.observe(button, { attributes: true, attributeFilter: ['class'] });
    });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
