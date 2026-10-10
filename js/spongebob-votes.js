(function () {
  'use strict';

  const endpoint = String(window.SPONGEBOB_VOTES_ENDPOINT || 'https://spongebob-votes-ethan.snugbay4.chatgpt.site').replace(/\/$/, '');
  let identity;

  // A round belongs to this page load. Keep its ID stable only for safe retries.
  function startRound() {
    identity = crypto.randomUUID();
  }

  function getVoterId() {
    if (!identity) startRound();
    return identity;
  }

  function validateResult(result, pair) {
    const sorted = pair.slice().sort();
    if (!result || !Array.isArray(result.pair) || result.pair.length !== 2 ||
        result.pair.some((id, index) => id !== sorted[index]) ||
        !Number.isSafeInteger(result.total) || result.total < 0 ||
        sorted.some(id => !Number.isSafeInteger(result.counts?.[id]) || result.counts[id] < 0 ||
          !Number.isFinite(result.percentages?.[id]) || result.percentages[id] < 0 || result.percentages[id] > 100) ||
        result.counts[sorted[0]] + result.counts[sorted[1]] !== result.total ||
        sorted.some(id => Math.abs(result.percentages[id] - (result.total ? result.counts[id] / result.total * 100 : 0)) > 0.051) ||
        (result.winner !== null && !sorted.includes(result.winner)) ||
        result.alreadyVoted !== Boolean(result.winner)) {
      throw new Error('The shared vote response could not be verified. Try again.');
    }
    return result;
  }

  async function request(pair, options) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1]) {
      throw new Error('Choose two different characters.');
    }
    const voterId = options?.voterId || getVoterId();
    const url = new URL(endpoint + '/v1/votes');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let init = { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', signal: controller.signal };
    if (options?.winner) {
      init = { ...init, method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair, winner: options.winner, voterId }) };
    } else {
      url.searchParams.set('a', pair[0]);
      url.searchParams.set('b', pair[1]);
      url.searchParams.set('voterId', voterId);
    }
    try {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error('Shared votes are unavailable. Try again.');
      return validateResult(await response.json(), pair);
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) {
        throw new Error('Shared votes could not be reached. Try again.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  window.SpongeBobVotes = Object.freeze({
    endpoint,
    startRound,
    getVoterId,
    get: pair => request(pair),
    vote: ({ pair, winner, voterId }) => {
      if (!pair.includes(winner)) return Promise.reject(new Error('Choose one of these two characters.'));
      return request(pair, { winner, voterId });
    }
  });
})();
