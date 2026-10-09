(function () {
  'use strict';
  const SELECTION_KEY = 'spongebob-character-selection-v1';
  let catalogPromise;
  async function fetchJSON(path) {
    const response = await fetch(path + '?v=1', { cache: 'no-cache' });
    if (!response.ok) throw new Error('The character catalog could not be loaded.');
    return response.json();
  }
  function cleanIds(ids, byId) {
    return [...new Set(Array.isArray(ids) ? ids : [])].filter(id => typeof id === 'string' && byId.has(id));
  }
  function load() {
    if (!catalogPromise) catalogPromise = Promise.all([
      fetchJSON('assets/spongebob/characters.json'), fetchJSON('assets/spongebob/lineup.json')
    ]).then(([catalog, lineup]) => {
      if (!Array.isArray(catalog.characters) || !catalog.characters.length) throw new Error('The character catalog is empty.');
      const byId = new Map();
      const characters = catalog.characters.filter(character => {
        if (!character || typeof character.id !== 'string' || !/^[a-z0-9-]+$/.test(character.id) || !character.name || byId.has(character.id)) return false;
        byId.set(character.id, character);
        return true;
      });
      return { catalog, characters, byId, lineup, defaultIds: cleanIds(lineup.characterIds, byId) };
    }).catch(error => { catalogPromise = null; throw error; });
    return catalogPromise;
  }
  function picture(character, className, eager) {
    const wrapper = document.createElement('picture');
    wrapper.className = className || '';
    const image = document.createElement('img');
    image.src = character.image;
    image.alt = character.name;
    image.width = character.width || 300;
    image.height = character.height || 300;
    image.loading = eager ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      image.hidden = true;
      wrapper.classList.add('sb-image-unavailable');
      const message = document.createElement('span');
      message.textContent = 'Image unavailable';
      wrapper.append(message);
    }, { once: true });
    wrapper.append(image);
    return wrapper;
  }
  function readSelection(defaultIds, byId) {
    try {
      const raw = localStorage.getItem(SELECTION_KEY);
      if (raw !== null) {
        const value = JSON.parse(raw);
        if (Array.isArray(value)) return cleanIds(value, byId);
      }
    } catch (_) { /* The page still works when storage is unavailable. */ }
    return [...defaultIds];
  }
  function saveSelection(ids) {
    try { localStorage.setItem(SELECTION_KEY, JSON.stringify(ids)); return true; }
    catch (_) { return false; }
  }
  function fightURL(ids) {
    const url = new URL('spongebob-fight.html', location.href);
    url.hash = new URLSearchParams({ roster: ids.join(',') }).toString();
    return url.href;
  }
  function sharedRoster(byId) {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    const value = hash.get('roster') ?? query.get('roster');
    if (value === null) return null;
    return cleanIds(value.split(','), byId);
  }
  function pairKey(pair) { return [...pair].sort().join('|'); }
  window.SpongeBob = { load, cleanIds, picture, readSelection, saveSelection, fightURL, sharedRoster, pairKey };
})();
