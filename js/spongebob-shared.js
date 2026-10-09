(function () {
  'use strict';
  const SELECTION_KEY = 'spongebob-character-selection-v1';
  let catalogPromise;
  async function fetchJSON(path) {
    const response = await fetch(path + '?v=3', { cache: 'no-cache' });
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
      // Keep the owner's chosen cast usable when its members fall outside a new catalog scope.
      const retainedCharacters = (Array.isArray(lineup.retainedCharacters) ? lineup.retainedCharacters : []).filter(character => {
        if (!character || typeof character.id !== 'string' || !/^[a-z0-9-]+$/.test(character.id) || !character.name || byId.has(character.id)) return false;
        byId.set(character.id, character);
        return true;
      });
      return { catalog, characters, retainedCharacters, byId, lineup, defaultIds: cleanIds(lineup.characterIds, byId) };
    }).catch(error => { catalogPromise = null; throw error; });
    return catalogPromise;
  }
  function picture(character, className, eager) {
    const wrapper = document.createElement('picture');
    wrapper.className = className || '';
    if (character.fallbackImage) {
      const source = document.createElement('source');
      source.type = 'image/webp';
      source.srcset = character.image;
      wrapper.append(source);
    }
    const image = document.createElement('img');
    image.src = character.fallbackImage || character.image;
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
  function cleanMatchups(pairs, ids, byId) {
    if (!Array.isArray(pairs) || !pairs.length) return null;
    const allowed = new Set(cleanIds(ids, byId)), used = new Set();
    const result = [];
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1] || pair.some(id => !allowed.has(id) || used.has(id))) return null;
      pair.forEach(id => used.add(id));
      result.push([...pair]);
    }
    return result;
  }
  function fightURL(ids, matchups) {
    const url = new URL('spongebob-fight.html', location.href);
    const hash = new URLSearchParams({ roster: ids.join(',') });
    if (Array.isArray(matchups) && matchups.length) hash.set('matchups', JSON.stringify(matchups));
    url.hash = hash.toString();
    return url.href;
  }
  function sharedRoster(byId) {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    const value = hash.get('roster') ?? query.get('roster');
    if (value === null) return null;
    return cleanIds(value.split(','), byId);
  }
  function sharedMatchups(byId, ids) {
    const query = new URLSearchParams(location.search), hash = new URLSearchParams(location.hash.slice(1));
    const value = hash.get('matchups') ?? query.get('matchups');
    if (value === null) return null;
    try { return cleanMatchups(JSON.parse(value), ids, byId) || []; }
    catch (_) { return []; }
  }
  function pairKey(pair) { return [...pair].sort().join('|'); }
  window.SpongeBob = { load, cleanIds, cleanMatchups, picture, readSelection, saveSelection, fightURL, sharedRoster, sharedMatchups, pairKey };
})();
