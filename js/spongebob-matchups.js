(function () {
  'use strict';
  const shared = window.SpongeBob;
  const $ = id => document.getElementById(id);
  const storageKey = 'spongebob-matchups-v1';
  let data, ids = [], pairs = [], picked = [], cards = new Map(), initialized = false;

  function prunePairs(value) {
    const selected = new Set(ids), used = new Set();
    return (Array.isArray(value) ? value : []).filter(pair => {
      if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1] ||
          pair.some(id => !selected.has(id) || !data.byId.has(id) || used.has(id))) return false;
      pair.forEach(id => used.add(id));
      return true;
    }).map(pair => pair.slice());
  }

  function availableIds() {
    const used = new Set(pairs.flat());
    return ids.filter(id => !used.has(id));
  }

  function savePairs() {
    let saved = true;
    try { localStorage.setItem(storageKey, JSON.stringify(pairs)); }
    catch (_) { saved = false; }
    $('sb-storage-note').textContent = saved ? 'Your matchups are saved in this browser.'
      : 'Browser storage is unavailable. Copy the link or download your matchups to keep them.';
  }

  function notifyChange() {
    window.dispatchEvent(new CustomEvent('spongebob-matchups-change', { detail: { pairs: pairs.map(pair => pair.slice()) } }));
  }

  function focusCharacter(id) {
    const card = cards.get(id);
    if (!card?.isConnected) return;
    card.focus({ preventScroll: true });
    const bounds = card.getBoundingClientRect();
    if (bounds.top < $('sb-pairing').getBoundingClientRect().bottom + 8 || bounds.bottom > innerHeight) {
      window.scrollBy({ top: bounds.top - $('sb-pairing').offsetHeight - 12, behavior: 'instant' });
    }
  }

  function renderPicks() {
    cards.forEach((card, id) => {
      const index = picked.indexOf(id);
      card.setAttribute('aria-pressed', String(index >= 0));
      const marker = card.querySelector('.sb-pick-number');
      marker.hidden = index < 0;
      marker.textContent = index < 0 ? '' : String(index + 1);
    });
    ['left', 'right'].forEach((side, index) => {
      const preview = $('sb-pair-preview-' + side);
      if (!picked[index]) {
        const placeholder = document.createElement('span'); placeholder.className = 'sb-pair-placeholder';
        const order = document.createElement('span'); order.className = 'sb-preview-order'; order.textContent = index === 0 ? 'First character' : 'Second character';
        const label = document.createElement('span'); label.textContent = index === 0 || picked.length ? 'Click a portrait' : 'Then choose another';
        placeholder.append(order, label); preview.replaceChildren(placeholder);
        return;
      }
      const character = data.byId.get(picked[index]);
      const copy = document.createElement('span');
      const order = document.createElement('span'); order.className = 'sb-preview-order'; order.textContent = index === 0 ? 'First character' : 'Second character';
      const name = document.createElement('span'); name.className = 'sb-preview-name'; name.textContent = character.name;
      copy.append(order, name); preview.replaceChildren(shared.picture(character, '', true), copy);
    });
    $('sb-pair-add').disabled = picked.length !== 2;
    $('sb-pair-cancel').disabled = picked.length === 0;
  }

  function pick(id) {
    if (availableIds().length < 2) return;
    const index = picked.indexOf(id);
    if (index >= 0) picked.splice(index, 1);
    else if (picked.length === 2) picked[1] = id;
    else picked.push(id);
    $('sb-matchup-status').textContent = picked.length === 2
      ? data.byId.get(picked[0]).name + ' versus ' + data.byId.get(picked[1]).name + '. Ready to confirm.'
      : picked.length === 1 ? 'Choose a second character for ' + data.byId.get(picked[0]).name + '.' : 'Choose two characters.';
    renderPicks();
  }

  function buildCards() {
    cards = new Map();
    ids.forEach((id, index) => {
      const character = data.byId.get(id);
      const card = document.createElement('button'); card.type = 'button'; card.className = 'sb-character'; card.dataset.id = id;
      card.setAttribute('aria-pressed', 'false'); card.setAttribute('aria-label', 'Choose ' + character.name);
      const name = document.createElement('span'); name.className = 'sb-character-name'; name.textContent = character.name;
      const marker = document.createElement('span'); marker.className = 'sb-pick-number'; marker.hidden = true; marker.setAttribute('aria-hidden', 'true');
      card.append(shared.picture(character, 'sb-character-image', index < 5), name, marker);
      card.addEventListener('click', () => pick(id));
      cards.set(id, card);
    });
  }

  function renderPairs() {
    const list = document.createDocumentFragment();
    pairs.forEach((pair, index) => {
      const row = document.createElement('li'); row.className = 'sb-paired-row';
      row.dataset.left = pair[0]; row.dataset.right = pair[1];
      const heading = document.createElement('div'); heading.className = 'sb-paired-heading';
      const order = document.createElement('span'); order.className = 'sb-paired-order'; order.textContent = 'Matchup ' + (index + 1);
      const remove = document.createElement('button'); remove.className = 'sb-pair-remove'; remove.type = 'button'; remove.textContent = 'Remove';
      remove.setAttribute('aria-label', 'Remove ' + data.byId.get(pair[0]).name + ' versus ' + data.byId.get(pair[1]).name);
      remove.addEventListener('click', () => {
        pairs.splice(index, 1);
        $('sb-matchup-status').textContent = 'Matchup removed. Both characters are back in the grid.';
        changed(); focusCharacter(pair[0]);
      });
      heading.append(order, remove); row.append(heading);
      const opponents = document.createElement('div'); opponents.className = 'sb-paired-opponents';
      pair.forEach((id, side) => {
        if (side) { const versus = document.createElement('span'); versus.className = 'sb-pair-versus'; versus.textContent = 'vs.'; opponents.append(versus); }
        const character = data.byId.get(id), entry = document.createElement('div'); entry.className = 'sb-paired-character';
        const name = document.createElement('span'); name.className = 'sb-paired-name'; name.textContent = character.name;
        entry.append(shared.picture(character, '', false), name); opponents.append(entry);
      });
      row.append(opponents); list.append(row);
    });
    $('sb-paired-list').replaceChildren(list);
    $('sb-pairs-empty').hidden = pairs.length > 0;
  }

  function render() {
    const available = availableIds();
    picked = picked.filter(id => available.includes(id));
    $('sb-pair-summary').textContent = pairs.length.toLocaleString() + (pairs.length === 1 ? ' matchup confirmed. ' : ' matchups confirmed. ') + available.length.toLocaleString() + ' remaining.';
    const fragment = document.createDocumentFragment();
    available.forEach(id => { const card = cards.get(id); card.disabled = available.length < 2; fragment.append(card); });
    $('sb-character-grid').replaceChildren(fragment);
    $('sb-pair-form').hidden = available.length < 2;
    $('sb-pick-hint').hidden = available.length < 2;
    $('sb-remaining-title').hidden = available.length === 0;
    $('sb-complete').hidden = ids.length === 0 || available.length !== 0;
    $('sb-empty-cast').hidden = ids.length >= 2;
    $('sb-empty-cast-title').textContent = ids.length === 1 ? 'Your saved cast has one character' : 'Your saved cast is empty';
    $('sb-empty-cast-note').textContent = ids.length === 1 ? 'At least two characters are needed for a matchup. Load the public cast to choose pairs.' : 'Load the public cast to start choosing matchups.';
    $('sb-odd-state').hidden = available.length !== 1 || ids.length < 2;
    $('sb-odd-state').textContent = available.length === 1 ? data.byId.get(available[0]).name + ' is the only character left. Remove a matchup to change the pairs, or try the confirmed matchups.' : '';
    renderPicks(); renderPairs();
    const ready = pairs.length > 0;
    const preview = $('sb-preview-matchups');
    preview.href = shared.fightURL(ids, pairs); preview.setAttribute('aria-disabled', String(!ready)); preview.tabIndex = ready ? 0 : -1;
    $('sb-copy-matchups').disabled = !ready; $('sb-download-matchups').disabled = !ready;
    $('sb-matchup-copy-fallback').hidden = true;
  }

  function changed() { savePairs(); render(); notifyChange(); }

  window.addEventListener('spongebob-selection-change', event => {
    if (!event.detail?.data || !Array.isArray(event.detail.ids)) return;
    data = event.detail.data; ids = shared.cleanIds(event.detail.ids, data.byId);
    if (!initialized) {
      let saved;
      try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch (_) {}
      pairs = prunePairs(Array.isArray(saved) ? saved : data.lineup.matchups); initialized = true;
    } else pairs = prunePairs(pairs);
    picked = []; buildCards(); changed();
  });

  $('sb-pair-cancel').addEventListener('click', () => {
    const first = picked[0]; picked = [];
    $('sb-matchup-status').textContent = 'Choices cleared. Choose two characters.';
    renderPicks(); focusCharacter(first || availableIds()[0]);
  });
  $('sb-pair-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!data || picked.length !== 2) return;
    const candidate = pairs.concat([picked.slice()]);
    if (!shared.cleanMatchups(candidate, ids, data.byId)) return;
    pairs = candidate; picked = [];
    const remaining = availableIds().length;
    $('sb-matchup-status').textContent = 'Matchup ' + pairs.length + ' confirmed. ' + (remaining === 0 ? 'Every character is paired.' : remaining + (remaining === 1 ? ' character remains.' : ' characters remain.'));
    changed();
    if (remaining >= 2) focusCharacter(availableIds()[0]);
    else if (pairs.length) $('sb-preview-matchups').focus();
  });
  $('sb-preview-matchups').addEventListener('click', event => { if (!pairs.length) event.preventDefault(); });
  $('sb-copy-matchups').addEventListener('click', async () => {
    if (!data || !pairs.length) return;
    const url = shared.fightURL(ids, pairs);
    try { await navigator.clipboard.writeText(url); $('sb-matchup-status').textContent = 'Matchups link copied.'; }
    catch (_) {
      $('sb-matchup-copy-fallback').hidden = false; $('sb-matchup-share-url').value = url;
      $('sb-matchup-share-url').focus(); $('sb-matchup-share-url').select();
      $('sb-matchup-status').textContent = 'Select and copy the matchups link below.';
    }
  });
  $('sb-download-matchups').addEventListener('click', () => {
    if (!data || !pairs.length) return;
    const lineup = { version: 3, title: 'Chosen SpongeBob matchups', updatedAt: new Date().toISOString().slice(0, 10),
      characterIds: ids.slice(), matchups: pairs.map(pair => pair.slice()) };
    const retained = (data.retainedCharacters || []).filter(character => ids.includes(character.id));
    if (retained.length) lineup.retainedCharacters = retained;
    const url = URL.createObjectURL(new Blob([JSON.stringify(lineup, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'spongebob-matchups.json';
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('sb-matchup-status').textContent = 'Matchups downloaded in the order you chose them.';
  });
  window.addEventListener('storage', event => {
    if (!data || event.key !== storageKey) return;
    let value; try { value = JSON.parse(event.newValue); } catch (_) {}
    pairs = prunePairs(value); render(); notifyChange();
    $('sb-matchup-status').textContent = 'Matchups updated from another tab.';
  });
  window.SpongeBobMatchups = Object.freeze({ getPairs: () => pairs.map(pair => pair.slice()) });
})();
