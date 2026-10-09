(function () {
  'use strict';
  const shared = window.SpongeBob;
  const $ = id => document.getElementById(id);
  let data;

  function showCast() {
    const ids = shared.readSelection(data.defaultIds, data.byId);
    window.dispatchEvent(new CustomEvent('spongebob-selection-change', { detail: { data, ids } }));
  }

  async function load() {
    $('sb-picker').setAttribute('aria-busy', 'true');
    $('sb-load-state').hidden = false;
    $('sb-load-retry').hidden = true;
    $('sb-load-state').querySelector('p').textContent = 'Loading your cast...';
    try {
      data = await shared.load();
      showCast();
      $('sb-lineup').hidden = false;
      $('sb-load-state').hidden = true;
      if (location.hash === '#sb-lineup' || location.hash === '#sb-pairing') {
        requestAnimationFrame(() => document.querySelector(location.hash).scrollIntoView({ block: 'start' }));
      }
    } catch (_) {
      $('sb-load-state').querySelector('p').textContent = 'Your cast could not be loaded. Check your connection and try again.';
      $('sb-load-retry').hidden = false;
    } finally {
      $('sb-picker').setAttribute('aria-busy', 'false');
    }
  }

  $('sb-load-retry').addEventListener('click', load);
  $('sb-use-public-cast').addEventListener('click', () => {
    if (!data) return;
    shared.saveSelection(data.defaultIds);
    window.dispatchEvent(new CustomEvent('spongebob-selection-change', { detail: { data, ids: data.defaultIds.slice() } }));
    $('sb-matchup-status').textContent = 'Public cast loaded. Choose two characters.';
  });
  window.addEventListener('storage', event => {
    if (data && event.key === 'spongebob-character-selection-v1') showCast();
  });
  load();
})();
