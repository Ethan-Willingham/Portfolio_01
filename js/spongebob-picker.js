(function () {
  'use strict';
  const shared = window.SpongeBob;
  const $ = id => document.getElementById(id);
  let data, selected = new Set(), cards = new Map(), visibleIds = [];
  function chosenIds() { return [...data.characters, ...data.retainedCharacters].filter(character => selected.has(character.id)).map(character => character.id); }
  function chosenMatchups() { return window.SpongeBobMatchups?.getPairs() || []; }
  function updateFightLink() { $('sb-play').href = shared.fightURL(chosenIds(), chosenMatchups()); }
  function updateSelection(save) {
    const ids = chosenIds();
    if (save) $('sb-storage-note').textContent = shared.saveSelection(ids)
      ? 'Your selection is saved in this browser.'
      : 'Browser storage is unavailable. Download your lineup or copy its link to keep these choices.';
    $('sb-selected-count').textContent = ids.length;
    const pairs = Math.floor(ids.length / 2);
    $('sb-pair-count').textContent = ids.length < 2 ? '/ choose at least 2' : '/ up to ' + pairs.toLocaleString() + (pairs === 1 ? ' matchup' : ' matchups') + (ids.length % 2 ? ', 1 sits out' : '');
    $('sb-play').setAttribute('aria-disabled', String(ids.length < 2));
    $('sb-play').href = shared.fightURL(ids, chosenMatchups());
    $('sb-copy-link').disabled = ids.length < 2;
    $('sb-download').disabled = ids.length < 2;
    $('sb-copy-fallback').hidden = true;
    cards.forEach((card, id) => { card.querySelector('input').checked = selected.has(id); });
    const list = document.createDocumentFragment();
    ids.forEach(id => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = data.byId.get(id).name;
      button.setAttribute('aria-label', 'Remove ' + data.byId.get(id).name + ' from lineup');
      const icon = document.createElement('span');
      icon.className = 'sb-remove'; icon.setAttribute('aria-hidden', 'true'); button.append(icon);
      button.addEventListener('click', () => {
        selected.delete(id); updateSelection(true); applyFilters();
        const first = $('sb-chosen-list').querySelector('button');
        (first || $('sb-defaults')).focus({ preventScroll: true });
      });
      item.append(button); list.append(item);
    });
    if (!ids.length) {
      const item = document.createElement('li'); item.className = 'sb-note';
      item.textContent = 'No characters selected yet. Choose at least two to make a fight lineup.'; list.append(item);
    }
    $('sb-chosen-list').replaceChildren(list);
    window.dispatchEvent(new CustomEvent('spongebob-selection-change', { detail: { data, ids } }));
    updateFightLink();
  }
  function applyFilters() {
    const search = $('sb-search').value.trim().toLocaleLowerCase();
    const group = $('sb-group').value;
    const selectedOnly = $('sb-only-selected').checked;
    visibleIds = data.characters.filter(character => {
      const names = [character.name, ...(Array.isArray(character.aliases) ? character.aliases : [])].join(' ').toLocaleLowerCase();
      const matches = (!search || names.includes(search)) && (!group || (character.group || 'Other characters') === group) && (!selectedOnly || selected.has(character.id));
      cards.get(character.id).hidden = !matches;
      return matches;
    }).map(character => character.id);
    $('sb-showing').textContent = 'Showing ' + visibleIds.length.toLocaleString() + ' of ' + data.characters.length.toLocaleString() + ' characters';
    $('sb-no-results').hidden = visibleIds.length > 0;
    $('sb-select-visible').disabled = visibleIds.length === 0;
  }
  function buildCards() {
    cards = new Map();
    const fragment = document.createDocumentFragment();
    const groupCounts = new Map();
    data.characters.forEach((character, index) => {
      groupCounts.set(character.group || 'Other characters', (groupCounts.get(character.group || 'Other characters') || 0) + 1);
      const card = document.createElement('article'); card.className = 'sb-character'; card.dataset.id = character.id;
      const label = document.createElement('label');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = character.id;
      checkbox.setAttribute('aria-label', 'Select ' + character.name);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(character.id); else selected.delete(character.id);
        updateSelection(true); applyFilters();
        if (card.hidden) ($('sb-character-grid').querySelector('article:not([hidden]) input') || $('sb-only-selected')).focus({ preventScroll: true });
      });
      label.append(checkbox, shared.picture(character, 'sb-character-image', index < 4));
      const name = document.createElement('span'); name.className = 'sb-character-name'; name.textContent = character.name;
      const group = document.createElement('span'); group.className = 'sb-character-group'; group.textContent = character.group || 'Other characters';
      label.append(name, group); card.append(label);
      if (typeof character.seriesEpisode === 'string') {
        const episode = document.createElement('span'); episode.className = 'sb-character-episode';
        episode.textContent = 'TV: ' + character.seriesEpisode;
        card.append(episode);
      }
      if (typeof character.sourcePage === 'string' && /^https?:\/\//.test(character.sourcePage)) {
        const source = document.createElement('a'); source.className = 'sb-source-link'; source.href = character.sourcePage;
        source.textContent = 'Character source'; source.target = '_blank'; source.rel = 'noopener noreferrer';
        source.setAttribute('aria-label', 'Source for ' + character.name + ' (opens in a new tab)'); card.append(source);
      }
      fragment.append(card); cards.set(character.id, card);
    });
    $('sb-character-grid').replaceChildren(fragment);
    $('sb-group').replaceChildren(new Option('All characters (' + data.characters.length + ')', ''));
    groupCounts.forEach((count, group) => $('sb-group').append(new Option(group + ' (' + count + ')', group)));
  }
  async function load() {
    $('sb-picker').setAttribute('aria-busy', 'true');
    $('sb-load-state').hidden = false; $('sb-load-retry').hidden = true;
    $('sb-load-state').querySelector('p').textContent = 'Gathering the cast...';
    try {
      data = await shared.load();
      selected = new Set(shared.readSelection(data.defaultIds, data.byId));
      buildCards(); updateSelection(true); applyFilters();
      ['sb-filters', 'sb-list-tools', 'sb-lineup'].forEach(id => { $(id).hidden = false; });
      $('sb-load-state').hidden = true;
    } catch (_) {
      $('sb-load-state').querySelector('p').textContent = 'The character catalog could not be loaded. Check your connection and try again.';
      $('sb-load-retry').hidden = false;
    } finally { $('sb-picker').setAttribute('aria-busy', 'false'); }
  }
  $('sb-search').addEventListener('input', applyFilters);
  $('sb-group').addEventListener('change', applyFilters);
  $('sb-only-selected').addEventListener('change', applyFilters);
  $('sb-load-retry').addEventListener('click', load);
  $('sb-reset-filters').addEventListener('click', () => {
    $('sb-search').value = ''; $('sb-group').value = ''; $('sb-only-selected').checked = false; applyFilters(); $('sb-search').focus();
  });
  $('sb-select-visible').addEventListener('click', () => { visibleIds.forEach(id => selected.add(id)); updateSelection(true); applyFilters(); });
  $('sb-clear').addEventListener('click', () => { selected.clear(); updateSelection(true); applyFilters(); });
  $('sb-defaults').addEventListener('click', () => { selected = new Set(data.defaultIds); updateSelection(true); applyFilters(); });
  $('sb-play').addEventListener('click', event => { if (selected.size < 2) event.preventDefault(); });
  $('sb-copy-link').addEventListener('click', async () => {
    const url = shared.fightURL(chosenIds(), chosenMatchups());
    try { await navigator.clipboard.writeText(url); $('sb-export-status').textContent = 'Fight link copied. It includes your chosen characters.'; }
    catch (_) {
      $('sb-copy-fallback').hidden = false; $('sb-share-url').value = url; $('sb-share-url').focus(); $('sb-share-url').select();
      $('sb-export-status').textContent = 'Select and copy the link below.';
    }
  });
  $('sb-download').addEventListener('click', () => {
    const lineup = { version: 1, title: 'Chosen SpongeBob lineup', updatedAt: new Date().toISOString().slice(0, 10), characterIds: chosenIds() };
    const matchups = chosenMatchups();
    if (matchups.length) lineup.matchups = matchups;
    const retained = data.retainedCharacters.filter(character => selected.has(character.id));
    if (retained.length) lineup.retainedCharacters = retained;
    const blobURL = URL.createObjectURL(new Blob([JSON.stringify(lineup, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = blobURL; anchor.download = 'spongebob-lineup.json';
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
    $('sb-export-status').textContent = 'Lineup downloaded. This file can replace the public lineup when the site is updated.';
  });
  window.addEventListener('storage', event => {
    if (data && event.key === 'spongebob-character-selection-v1') { selected = new Set(shared.readSelection(data.defaultIds, data.byId)); updateSelection(false); applyFilters(); }
  });
  window.addEventListener('spongebob-matchups-change', updateFightLink);
  load();
})();
