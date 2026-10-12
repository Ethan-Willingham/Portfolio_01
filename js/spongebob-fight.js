(function () {
  'use strict';
  const shared = window.SpongeBob;
  const $ = id => document.getElementById(id);
  let data, roster, configuredPairs, roundPairs, totalPairs, position, current;
  let storageKey, savedRound = null, roundResults = [], summary = null;
  let requestToken = 0, pendingWinner = null, retryMode = null, resultShown = false;
  const voteCount = count => count.toLocaleString() + (count === 1 ? ' vote' : ' votes');
  function otherAgreement(result, choice) {
    if (!result || !choice) return null;
    const total = result.total - (result.winner ? 1 : 0);
    return total ? (result.counts[choice] - (result.winner === choice ? 1 : 0)) / total * 100 : null;
  }
  function percentages(result, pair) {
    if (!result.total) return [0, 0];
    const left = Math.round(result.counts[pair[0]] / result.total * 100);
    return [left, 100 - left];
  }
  function readSavedRound() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      const pairs = shared.cleanMatchups(saved?.pairs, roster, data.byId);
      if (!pairs || pairs.length !== (configuredPairs?.length || Math.floor(roster.length / 2)) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.voterId) ||
          !Array.isArray(saved.choices) || saved.choices.length !== pairs.length ||
          pairs.some((pair, index) => !pair.includes(saved.choices[index])) ||
          (configuredPairs && JSON.stringify(pairs) !== JSON.stringify(configuredPairs))) return null;
      return { voterId: saved.voterId, pairs, choices: saved.choices };
    } catch (_) { return null; }
  }
  function rememberCompletedRound() {
    if (roundResults.filter(Boolean).length !== totalPairs) return;
    savedRound = { voterId: window.SpongeBobVotes.getVoterId(), pairs: roundPairs.map(pair => [...pair]), choices: roundResults.map(result => result.winner) };
    try { localStorage.setItem(storageKey, JSON.stringify(savedRound)); } catch (_) { /* Results still work for this visit. */ }
  }
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
    position = 0; roundResults = []; summary = null;
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
      showResults(); return;
    }
    $('sb-fight').classList.remove('is-results'); $('sb-complete').hidden = true;
    $('sb-view-results').hidden = position !== 0 || !!roundResults[0];
    $('sb-view-results').textContent = savedRound ? 'Skip to your results' : 'Skip to results';
    $('sb-next').textContent = position === totalPairs - 1 ? 'See all results' : 'Next matchup';
    current = [...roundPairs[position]];
    pendingWinner = null; retryMode = null; resultShown = false;
    paintFighter('left', data.byId.get(current[0])); paintFighter('right', data.byId.get(current[1]));
    ['sb-matchup', 'sb-vote-state'].forEach(id => { $(id).hidden = false; });
    ['sb-vote-total', 'sb-vote-retry', 'sb-next', 'sb-refresh', 'sb-round-actions'].forEach(id => { $(id).hidden = true; });
    setChoicesEnabled(false); checkPair();
  }
  function reveal(result, fromRead) {
    const winner = current.includes(result.winner) ? result.winner : null;
    if (!winner || !Number.isFinite(result.total) || result.total < 1) throw new Error('The vote service returned an incomplete result.');
    resultShown = true; pendingWinner = null; setChoicesEnabled(false);
    roundResults[position] = result; rememberCompletedRound();
    $('sb-view-results').hidden = true;
    const percents = percentages(result, current);
    ['left', 'right'].forEach((side, index) => {
      const ownWinner = current[index] === winner;
      $('sb-fighter-' + side).classList.toggle('is-winner', ownWinner);
      $('sb-fighter-' + side).setAttribute('aria-pressed', String(ownWinner));
      $('sb-fighter-' + side).setAttribute('aria-label', data.byId.get(current[index]).name + ': ' + voteCount(result.counts[current[index]]) + ', ' + percents[index] + '%' + (ownWinner ? ', your choice' : ''));
      $('sb-prompt-' + side).textContent = ownWinner ? 'Your choice' : 'Other choice';
      $('sb-result-' + side).textContent = percents[index] + '%';
      $('sb-result-' + side).hidden = false;
      const count = result.counts[current[index]];
      $('sb-count-' + side).textContent = voteCount(count);
      $('sb-count-' + side).hidden = false;
      $('sb-track-' + side).hidden = false; $('sb-track-' + side).firstElementChild.style.width = percents[index] + '%';
    });
    const agreement = otherAgreement(result, winner), winnerName = data.byId.get(winner).name;
    status((fromRead || result.accepted === false ? 'Your saved choice: ' : 'You chose ') + winnerName + '. ' + (agreement === null ? "You're the first to vote." : Math.round(agreement) + '% of other votes agree.'));
    $('sb-vote-total').textContent = voteCount(result.total) + ' for this pair, including yours.';
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
      if (result.alreadyVoted && result.winner) { $('sb-vote-state').hidden = false; reveal(result, true); }
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
  async function vote(winner, retry = false) {
    if (resultShown || (!retry && $('sb-fighter-left').disabled)) return;
    const token = ++requestToken, pair = [...current];
    pendingWinner = winner; retryMode = 'vote';
    $('sb-view-results').hidden = true;
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
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function paintSummary(loading) {
    const rows = summary.pairs.map((pair, index) => {
      const result = summary.results[index], choice = result?.winner || summary.choices[index];
      const row = element('li', 'sb-summary-row');
      row.append(element('p', 'sb-summary-pair', 'Matchup ' + (index + 1) + (result ? ' · ' + voteCount(result.total) : '')));
      const fighters = element('div', 'sb-summary-fighters');
      pair.forEach((id, side) => {
        const character = data.byId.get(id), ownChoice = id === choice;
        const fighter = element('div', 'sb-summary-fighter' + (ownChoice ? ' is-chosen' : ''));
        const portrait = shared.picture(character, 'sb-summary-portrait');
        portrait.querySelector('img').alt = '';
        const name = element('p', 'sb-summary-name', character.name);
        if (ownChoice) name.append(element('span', 'sb-your-pick', 'Your pick'));
        fighter.append(portrait, name, element('p', 'sb-summary-count', result ? voteCount(result.counts[id]) + ' · ' + percentages(result, pair)[side] + '%' : loading ? 'Loading votes...' : 'Votes unavailable'));
        fighters.append(fighter);
      });
      row.append(fighters);
      return row;
    });
    $('sb-results-list').replaceChildren(...rows);
    const choices = summary.results.map((result, index) => result?.winner || summary.choices[index]);
    const hasChoices = choices.some(Boolean), allLoaded = summary.results.every(Boolean);
    $('sb-results-title').textContent = hasChoices ? 'Your results' : 'All results';
    const agreements = summary.results.map((result, index) => otherAgreement(result, choices[index])).filter(value => value !== null);
    const comparison = $('sb-comparison');
    comparison.replaceChildren();
    if (!hasChoices) comparison.textContent = 'Vote to see how your picks compare.';
    else if (!allLoaded) comparison.textContent = loading ? 'Loading your comparison...' : 'Refresh the results to see your comparison.';
    else if (!agreements.length) comparison.textContent = 'No other votes to compare with yet.';
    else {
      const average = Math.round(agreements.reduce((sum, value) => sum + value, 0) / agreements.length);
      comparison.append(element('strong', 'sb-agreement', average + '%'), document.createTextNode('of other votes agreed with your picks, on average.'));
    }
    $('sb-comparison-note').textContent = hasChoices && allLoaded && agreements.length
      ? 'Across ' + agreements.length + (agreements.length === 1 ? ' matchup' : ' matchups') + ' with other votes. Counts below include all votes.'
      : 'Counts show all votes for each matchup.';
  }
  async function refreshSummary() {
    const token = ++requestToken, displayed = summary;
    $('sb-summary-refresh').disabled = true;
    $('sb-summary-status').textContent = 'Updating vote totals...';
    $('sb-results-list').setAttribute('aria-busy', 'true');
    const results = await Promise.allSettled(displayed.pairs.map(pair => window.SpongeBobVotes.get(pair, displayed.voterId)));
    if (token !== requestToken) return;
    results.forEach((result, index) => { if (result.status === 'fulfilled') displayed.results[index] = result.value; });
    paintSummary(false);
    const failed = results.some(result => result.status === 'rejected');
    $('sb-summary-status').textContent = failed ? 'Some votes could not be refreshed. Try again for the latest totals.' : '';
    $('sb-summary-refresh').textContent = failed ? 'Retry results' : 'Refresh results';
    $('sb-summary-refresh').disabled = false;
    $('sb-results-list').setAttribute('aria-busy', 'false');
  }
  function showResults(useSaved) {
    requestToken++;
    summary = useSaved && savedRound
      ? { ...savedRound, results: savedRound.pairs.map(() => null), isCurrent: false }
      : { voterId: window.SpongeBobVotes.getVoterId(), pairs: roundPairs, choices: roundPairs.map((_, index) => roundResults[index]?.winner || null), results: roundPairs.map((_, index) => roundResults[index] || null), isCurrent: true };
    ['sb-matchup', 'sb-vote-state', 'sb-round-actions', 'sb-view-results'].forEach(id => { $(id).hidden = true; });
    $('sb-fight').classList.add('is-results'); $('sb-complete').hidden = false;
    $('sb-restart').textContent = summary.isCurrent && position < totalPairs ? 'Back to voting' : 'Play another round';
    paintSummary(true); refreshSummary();
    $('sb-results-title').focus({ preventScroll: true });
    window.scrollTo(0, 0);
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
      storageKey = 'spongebob-results-v1:' + JSON.stringify(configuredPairs || [...roster].sort());
      savedRound = readSavedRound();
      $('sb-load-state').hidden = true; resetRound();
    } catch (error) { $('sb-load-state').querySelector('p').textContent = error.message; $('sb-load-retry').hidden = false; }
    finally { $('sb-fight').setAttribute('aria-busy', 'false'); }
  }
  $('sb-fighter-left').addEventListener('click', () => vote(current[0]));
  $('sb-fighter-right').addEventListener('click', () => vote(current[1]));
  $('sb-next').addEventListener('click', () => { if (!resultShown) return; position++; showPair(); });
  $('sb-restart').addEventListener('click', () => { if (summary?.isCurrent && position < totalPairs) showPair(); else resetRound(); });
  $('sb-view-results').addEventListener('click', () => showResults(true));
  $('sb-summary-refresh').addEventListener('click', refreshSummary);
  $('sb-refresh').addEventListener('click', () => checkPair(true));
  $('sb-vote-retry').addEventListener('click', () => { if (retryMode === 'vote') vote(pendingWinner, true); else checkPair(retryMode === 'refresh'); });
  $('sb-load-retry').addEventListener('click', load);
  window.addEventListener('hashchange', () => { requestToken++; ['sb-matchup', 'sb-vote-state', 'sb-round-actions', 'sb-complete', 'sb-view-results'].forEach(id => { $(id).hidden = true; }); $('sb-fight').classList.remove('is-results'); load(); });
  load();
})();
