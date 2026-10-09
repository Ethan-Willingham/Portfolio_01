(function () {
  'use strict';
  const shared = window.SpongeBob;
  const $ = id => document.getElementById(id);
  const storageKey = 'spongebob-matchups-v1';
  let data, ids = [], pairs = [], initialized = false, anchorHandled = false;

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
    try { localStorage.setItem(storageKey, JSON.stringify(pairs)); }
    catch (_) { $('sb-matchup-status').textContent = 'Browser storage is unavailable. Copy the matchups link or download them to keep your choices.'; }
  }

  function notifyChange() {
    window.dispatchEvent(new CustomEvent('spongebob-matchups-change', { detail: { pairs: pairs.map(pair => pair.slice()) } }));
  }

  function fillChoices() {
    const available = availableIds();
    const left = $('sb-pair-left'), right = $('sb-pair-right');
    const previous = [left.value, right.value];
    [left, right].forEach((select, index) => {
      select.replaceChildren(new Option(available.length < 2 ? 'No pair available' : 'Choose a character', ''));
      available.filter(id => id !== previous[1 - index]).forEach(id => select.append(new Option(data.byId.get(id).name, id)));
      if (available.includes(previous[index]) && previous[index] !== previous[1 - index]) select.value = previous[index];
      select.disabled = available.length < 2;
      const preview = $('sb-pair-preview-' + (index === 0 ? 'left' : 'right'));
      if (select.value) preview.replaceChildren(shared.picture(data.byId.get(select.value), '', true));
      else preview.textContent = available.length < 2 ? 'No pair available' : 'Choose a character';
    });
    $('sb-pair-add').disabled = !left.value || !right.value || left.value === right.value;
  }

  function render() {
    const available = availableIds(), maxPairs = Math.floor(ids.length / 2);
    $('sb-matchup-editor').hidden = false;
    $('sb-matchup-summary').textContent = pairs.length.toLocaleString() + ' of ' + maxPairs.toLocaleString() +
      ' matchups chosen. ' + available.length.toLocaleString() + (available.length === 1 ? ' character is unpaired.' : ' characters are unpaired.');
    const list = document.createDocumentFragment();
    pairs.forEach((pair, index) => {
      const row = document.createElement('li'); row.className = 'sb-paired-row';
      const heading = document.createElement('div'); heading.className = 'sb-paired-heading';
      const order = document.createElement('span'); order.className = 'sb-paired-order'; order.textContent = 'Matchup ' + (index + 1);
      const remove = document.createElement('button'); remove.className = 'sb-text-button'; remove.type = 'button'; remove.textContent = 'Remove';
      remove.setAttribute('aria-label', 'Remove ' + data.byId.get(pair[0]).name + ' versus ' + data.byId.get(pair[1]).name);
      remove.addEventListener('click', () => {
        pairs.splice(index, 1); $('sb-matchup-status').textContent = 'Matchup removed. Both characters are available again.';
        changed(); $('sb-pair-left').focus({ preventScroll: true });
      });
      heading.append(order, remove); row.append(heading);
      const opponents = document.createElement('div'); opponents.className = 'sb-paired-opponents';
      pair.forEach((id, side) => {
        if (side) { const versus = document.createElement('span'); versus.className = 'sb-pair-versus'; versus.textContent = 'vs.'; opponents.append(versus); }
        const character = data.byId.get(id), entry = document.createElement('div'); entry.className = 'sb-paired-character';
        const name = document.createElement('span'); name.className = 'sb-paired-name'; name.textContent = character.name;
        entry.append(shared.picture(character, '', true), name); opponents.append(entry);
      });
      row.append(opponents); list.append(row);
    });
    $('sb-paired-list').replaceChildren(list);
    $('sb-pairs-empty').hidden = pairs.length > 0;
    $('sb-pair-form').hidden = available.length < 2;
    $('sb-unpaired-summary').textContent = available.length.toLocaleString() + ' unpaired ' + (available.length === 1 ? 'character' : 'characters');
    $('sb-unpaired-names').textContent = available.map(id => data.byId.get(id).name).join(', ') || 'Every selected character has a matchup.';
    if (available.length < 2) $('sb-unpaired-details').open = available.length === 1;
    $('sb-copy-matchups').disabled = pairs.length === 0; $('sb-download-matchups').disabled = pairs.length === 0;
    $('sb-matchup-copy-fallback').hidden = true;
    fillChoices();
  }

  function changed() { savePairs(); render(); notifyChange(); }

  window.addEventListener('spongebob-selection-change', event => {
    if (!event.detail?.data || !Array.isArray(event.detail.ids)) return;
    data = event.detail.data; ids = shared.cleanIds(event.detail.ids, data.byId);
    if (!initialized) {
      let saved;
      try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch (_) {}
      const initial = Array.isArray(saved) ? saved : data.lineup.matchups;
      pairs = prunePairs(initial); initialized = true;
    } else pairs = prunePairs(pairs);
    savePairs(); render(); notifyChange();
    if (!anchorHandled) {
      anchorHandled = true;
      if (location.hash === '#sb-pairing') requestAnimationFrame(() => $('sb-pairing').scrollIntoView({ block: 'start' }));
    }
  });

  $('sb-pair-left').addEventListener('change', fillChoices);
  $('sb-pair-right').addEventListener('change', fillChoices);
  $('sb-pair-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!data) return;
    const pair = [$('sb-pair-left').value, $('sb-pair-right').value];
    const candidate = pairs.concat([pair]);
    if (!shared.cleanMatchups(candidate, ids, data.byId)) return;
    pairs = candidate; $('sb-pair-left').value = ''; $('sb-pair-right').value = '';
    $('sb-matchup-status').textContent = 'Matchup added. It will appear in this order in the round.'; changed();
    ($('sb-pair-left').disabled ? $('sb-copy-matchups') : $('sb-pair-left')).focus({ preventScroll: true });
  });
  $('sb-copy-matchups').addEventListener('click', async () => {
    if (!data || !pairs.length) return;
    const url = shared.fightURL(ids, pairs);
    try { await navigator.clipboard.writeText(url); $('sb-matchup-status').textContent = 'Matchups link copied. It includes your cast and the chosen pair order.'; }
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
    $('sb-matchup-status').textContent = 'Matchups downloaded with your cast and the chosen pair order.';
  });
  window.addEventListener('storage', event => {
    if (!data || event.key !== storageKey) return;
    let value; try { value = JSON.parse(event.newValue); } catch (_) {}
    pairs = prunePairs(value); render(); notifyChange();
  });
  window.SpongeBobMatchups = Object.freeze({ getPairs: () => pairs.map(pair => pair.slice()) });
})();
