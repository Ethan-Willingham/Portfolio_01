(function () {
  'use strict';
  const shared = window.SpongeBob;
  const $ = id => document.getElementById(id);
  let data, roster, configuredPairs, roundPairs, totalPairs, position, current;
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
  // Each character appears in one matchup per round.
  function resetRound() {
    window.SpongeBobVotes.startRound();
    roundPairs = configuredPairs ? configuredPairs.map(pair => [...pair]) : randomPairs();
    totalPairs = roundPairs.length;
    position = 0;
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
      $('sb-restart').focus({ preventScroll: true }); return;
    }
    current = [...roundPairs[position]];
    pendingWinner = null; retryMode = null; resultShown = false;
    paintFighter('left', data.byId.get(current[0])); paintFighter('right', data.byId.get(current[1]));
    ['sb-matchup', 'sb-vote-state'].forEach(id => { $(id).hidden = false; });
    ['sb-vote-total', 'sb-vote-retry', 'sb-next', 'sb-refresh', 'sb-round-actions'].forEach(id => { $(id).hidden = true; });
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
    $('sb-round-actions').hidden = false; $('sb-next').hidden = false; $('sb-next').disabled = false;
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
      if (refresh && result.alreadyVoted && result.winner) reveal(result, true);
      else if (refresh) throw new Error('Your saved vote could not be read.');
      else { $('sb-vote-state').hidden = true; status(''); setChoicesEnabled(true); }
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
    $('sb-vote-state').hidden = false;
    setChoicesEnabled(false); $('sb-vote-retry').hidden = true;
    status('Saving your vote for ' + data.byId.get(winner).name + '...');
    try {
      const result = await window.SpongeBobVotes.vote({ pair, winner });
      if (token !== requestToken) return;
      reveal(result); retryMode = null;
    } catch (_) {
      if (token !== requestToken) return;
      status('Your vote could not be confirmed. Retry to check and save it once.', true);
      $('sb-vote-retry').textContent = 'Retry vote'; $('sb-vote-retry').hidden = false;
    }
  }
  async function load() {
    $('sb-fight').setAttribute('aria-busy', 'true'); $('sb-load-state').hidden = false; $('sb-load-retry').hidden = true;
    $('sb-load-state').querySelector('p').textContent = 'Finding the first matchup...';
    try {
      data = await shared.load();
      const custom = shared.sharedRoster(data.byId);
      roster = custom === null ? data.defaultIds : custom;
      if (roster.length < 2) throw new Error('This lineup needs at least two valid characters. Open the public round to try again.');
      const sharedPairs = shared.sharedMatchups(data.byId, roster);
      configuredPairs = null;
      if (sharedPairs !== null) {
        if (!sharedPairs.length) throw new Error('These matchups are invalid. Each character can appear only once and must belong to the selected lineup.');
        configuredPairs = sharedPairs;
      } else if (custom === null && data.lineup.matchups !== undefined) {
        configuredPairs = shared.cleanMatchups(data.lineup.matchups, roster, data.byId);
        if (!configuredPairs) throw new Error('The public matchups are invalid. Please try again later.');
      }
      if (!window.SpongeBobVotes) throw new Error('The vote service did not load. Check your connection and try again.');
      $('sb-load-state').hidden = true; resetRound();
    } catch (error) { $('sb-load-state').querySelector('p').textContent = error.message; $('sb-load-retry').hidden = false; }
    finally { $('sb-fight').setAttribute('aria-busy', 'false'); }
  }
  $('sb-fighter-left').addEventListener('click', () => vote(current[0]));
  $('sb-fighter-right').addEventListener('click', () => vote(current[1]));
  $('sb-next').addEventListener('click', () => { if (!resultShown) return; position++; showPair(); });
  $('sb-restart').addEventListener('click', resetRound);
  $('sb-refresh').addEventListener('click', () => checkPair(true));
  $('sb-vote-retry').addEventListener('click', () => { if (retryMode === 'vote') vote(pendingWinner); else checkPair(retryMode === 'refresh'); });
  $('sb-load-retry').addEventListener('click', load);
  window.addEventListener('hashchange', () => { requestToken++; ['sb-matchup', 'sb-vote-state', 'sb-round-actions', 'sb-complete'].forEach(id => { $(id).hidden = true; }); load(); });
  load();
})();
