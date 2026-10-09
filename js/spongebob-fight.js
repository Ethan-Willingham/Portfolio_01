(function () {
  'use strict';
  const shared = window.SpongeBob;
  const $ = id => document.getElementById(id);
  let data, roster, configuredPairs, roundPairs, totalPairs, position, current, answered, skipped;
  let requestToken = 0, pendingWinner = null, retryMode = null, resultShown = false;
  function randomPairs() {
    const shuffled = [...roster];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    const pairs = [];
    for (let index = 0; index + 1 < shuffled.length; index += 2) pairs.push([shuffled[index], shuffled[index + 1]]);
    return pairs;
  }
  // Each character is consumed by one matchup, including when that matchup is skipped.
  function resetRound() {
    roundPairs = configuredPairs ? configuredPairs.map(pair => [...pair]) : randomPairs();
    totalPairs = roundPairs.length;
    const used = new Set(roundPairs.flat());
    const unpaired = roster.filter(id => !used.has(id));
    $('sb-unpaired-note').hidden = unpaired.length === 0;
    $('sb-unpaired-note').textContent = unpaired.length === 1
      ? data.byId.get(unpaired[0]).name + ' sits out this round.'
      : unpaired.length.toLocaleString() + ' characters sit out this round.';
    $('sb-round-hint').textContent = unpaired.length ? unpaired.length.toLocaleString() + ' sitting out' : 'Pick your winner.';
    position = 0; answered = 0; skipped = 0;
    $('sb-complete').hidden = true; showPair();
  }
  function setChoicesEnabled(enabled) {
    $('sb-fighter-left').disabled = !enabled; $('sb-fighter-right').disabled = !enabled;
  }
  function status(message, error) {
    $('sb-vote-status').textContent = message;
    $('sb-vote-state').classList.toggle('is-error', !!error);
  }
  function paintFighter(side, character) {
    $('sb-image-' + side).replaceChildren(shared.picture(character, '', true));
    $('sb-name-' + side).textContent = character.name;
    $('sb-fighter-' + side).setAttribute('aria-label', 'Choose ' + character.name + ' to win');
    $('sb-fighter-' + side).classList.remove('is-winner');
    $('sb-fighter-' + side).removeAttribute('aria-pressed');
    $('sb-prompt-' + side).textContent = 'Choose winner';
    $('sb-result-' + side).hidden = true; $('sb-count-' + side).hidden = true; $('sb-track-' + side).hidden = true;
  }
  function showPair() {
    requestToken++;
    if (position >= totalPairs) {
      ['sb-matchup', 'sb-vote-state', 'sb-round-actions'].forEach(id => { $(id).hidden = true; });
      $('sb-complete').hidden = false;
      $('sb-progress').textContent = 'All ' + totalPairs.toLocaleString() + ' matchups shown';
      $('sb-round-summary').textContent = answered.toLocaleString() + ' answered, ' + skipped.toLocaleString() + ' skipped. Another round keeps your previous votes.';
      $('sb-restart').focus({ preventScroll: true }); return;
    }
    current = [...roundPairs[position]];
    pendingWinner = null; retryMode = null; resultShown = false;
    $('sb-progress').textContent = 'Matchup ' + (position + 1).toLocaleString() + ' of ' + totalPairs.toLocaleString();
    paintFighter('left', data.byId.get(current[0])); paintFighter('right', data.byId.get(current[1]));
    ['sb-matchup', 'sb-vote-state', 'sb-round-actions'].forEach(id => { $(id).hidden = false; });
    ['sb-vote-total', 'sb-vote-retry', 'sb-next', 'sb-refresh'].forEach(id => { $(id).hidden = true; });
    $('sb-skip').hidden = false; $('sb-skip').disabled = false;
    setChoicesEnabled(false); checkPair();
  }
  function reveal(result, fromRead) {
    const winner = current.includes(result.winner) ? result.winner : pendingWinner;
    if (!winner || !Number.isFinite(result.total) || result.total < 1) throw new Error('The vote service returned an incomplete result.');
    resultShown = true; pendingWinner = null; setChoicesEnabled(false);
    const leftPercent = Math.round(result.percentages[current[0]]);
    if (!Number.isFinite(leftPercent)) throw new Error('The vote service returned an incomplete result.');
    const percents = [leftPercent, 100 - leftPercent];
    ['left', 'right'].forEach((side, index) => {
      const ownWinner = current[index] === winner;
      $('sb-fighter-' + side).classList.toggle('is-winner', ownWinner);
      $('sb-fighter-' + side).setAttribute('aria-pressed', String(ownWinner));
      $('sb-fighter-' + side).setAttribute('aria-label', data.byId.get(current[index]).name + ': ' + percents[index] + '% of votes' + (ownWinner ? ', your choice' : ''));
      $('sb-prompt-' + side).textContent = ownWinner ? 'Your choice' : 'Other choice';
      $('sb-result-' + side).textContent = percents[index] + '%';
      $('sb-result-' + side).hidden = false;
      const count = result.counts[current[index]];
      $('sb-count-' + side).textContent = count.toLocaleString() + (count === 1 ? ' vote' : ' votes');
      $('sb-count-' + side).hidden = false;
      $('sb-track-' + side).hidden = false; $('sb-track-' + side).firstElementChild.style.width = percents[index] + '%';
    });
    const winnerIndex = current.indexOf(winner), winnerName = data.byId.get(winner).name;
    status((fromRead || result.accepted === false ? 'Your saved choice: ' : 'You chose ') + winnerName + '. ' + percents[winnerIndex] + '% chose the same.');
    $('sb-vote-total').textContent = result.total.toLocaleString() + (result.total === 1 ? ' vote' : ' votes') + ' for this pair, including yours.';
    $('sb-vote-total').hidden = false; $('sb-vote-retry').hidden = true;
    $('sb-skip').hidden = true; $('sb-next').hidden = false; $('sb-next').disabled = false;
    $('sb-refresh').hidden = false; $('sb-refresh').disabled = false;
  }
  async function checkPair(refresh) {
    const token = ++requestToken, pair = [...current];
    retryMode = refresh ? 'refresh' : 'get';
    setChoicesEnabled(false); $('sb-vote-retry').hidden = true;
    $('sb-refresh').disabled = true;
    status(refresh ? 'Refreshing votes...' : 'Checking this matchup...');
    try {
      const result = await window.SpongeBobVotes.get(pair);
      if (token !== requestToken) return;
      if (result.alreadyVoted && result.winner) reveal(result, true);
      else if (refresh) throw new Error('Your saved vote could not be read.');
      else { status('Who would win? Choose a character.'); setChoicesEnabled(true); }
      retryMode = null;
    } catch (_) {
      if (token !== requestToken) return;
      status(refresh ? 'The latest results could not be loaded. Your vote is saved.' : 'The vote service could not be reached. Check your connection and try again.', true);
      $('sb-vote-retry').textContent = refresh ? 'Retry results' : 'Retry connection'; $('sb-vote-retry').hidden = false;
      $('sb-refresh').disabled = false;
    }
  }
  async function vote(winner) {
    const token = ++requestToken, pair = [...current];
    pendingWinner = winner; retryMode = 'vote';
    setChoicesEnabled(false); $('sb-skip').disabled = true; $('sb-vote-retry').hidden = true;
    status('Saving your vote for ' + data.byId.get(winner).name + '...');
    try {
      const result = await window.SpongeBobVotes.vote({ pair, winner });
      if (token !== requestToken) return;
      reveal(result); retryMode = null;
    } catch (_) {
      if (token !== requestToken) return;
      status('Your vote could not be confirmed. Retry to check and save it once.', true);
      $('sb-vote-retry').textContent = 'Retry vote'; $('sb-vote-retry').hidden = false;
      $('sb-skip').disabled = false;
    }
  }
  async function load() {
    $('sb-fight').setAttribute('aria-busy', 'true'); $('sb-load-state').hidden = false; $('sb-load-retry').hidden = true;
    ['sb-round-header', 'sb-roster-details', 'sb-unpaired-note'].forEach(id => { $(id).hidden = true; });
    $('sb-roster-label').textContent = '';
    $('sb-load-state').querySelector('p').textContent = 'Finding the first matchup...';
    try {
      data = await shared.load();
      const custom = shared.sharedRoster(data.byId);
      roster = custom === null ? data.defaultIds : custom;
      if (roster.length < 2) throw new Error('This lineup needs at least two valid characters. Choose a new cast in the character picker.');
      const sharedPairs = shared.sharedMatchups(data.byId, roster);
      const isShared = custom !== null || sharedPairs !== null;
      configuredPairs = null;
      if (sharedPairs !== null) {
        if (!sharedPairs.length) throw new Error('These matchups are invalid. Each character can appear only once and must belong to the selected lineup. Choose new matchups in the picker.');
        configuredPairs = sharedPairs;
      } else if (custom === null && data.lineup.matchups !== undefined) {
        configuredPairs = shared.cleanMatchups(data.lineup.matchups, roster, data.byId);
        if (!configuredPairs) throw new Error('The public matchups are invalid. Choose new matchups in the picker.');
      }
      if (!window.SpongeBobVotes) throw new Error('The vote service did not load. Check your connection and try again.');
      $('sb-roster-label').textContent = roster.length.toLocaleString() + ' characters / ' + (isShared ? 'Shared lineup' : 'Public lineup');
      $('sb-roster-summary').textContent = "Who's in this " + (isShared ? 'shared' : 'public') + ' lineup?';
      $('sb-roster-names').textContent = roster.map(id => data.byId.get(id).name).join(', ') + '.';
      ['sb-round-header', 'sb-roster-details'].forEach(id => { $(id).hidden = false; });
      $('sb-load-state').hidden = true; resetRound();
    } catch (error) { $('sb-load-state').querySelector('p').textContent = error.message; $('sb-load-retry').hidden = false; }
    finally { $('sb-fight').setAttribute('aria-busy', 'false'); }
  }
  $('sb-fighter-left').addEventListener('click', () => vote(current[0]));
  $('sb-fighter-right').addEventListener('click', () => vote(current[1]));
  $('sb-next').addEventListener('click', () => { if (!resultShown) return; answered++; position++; showPair(); });
  $('sb-skip').addEventListener('click', () => { skipped++; position++; showPair(); });
  $('sb-restart').addEventListener('click', resetRound);
  $('sb-refresh').addEventListener('click', () => checkPair(true));
  $('sb-vote-retry').addEventListener('click', () => { if (retryMode === 'vote') vote(pendingWinner); else checkPair(retryMode === 'refresh'); });
  $('sb-load-retry').addEventListener('click', load);
  const menu = document.querySelector('.sb-app-menu');
  document.addEventListener('click', event => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  window.addEventListener('hashchange', () => { requestToken++; ['sb-matchup', 'sb-vote-state', 'sb-round-actions', 'sb-complete'].forEach(id => { $(id).hidden = true; }); load(); });
  load();
})();
