// The build embeds the published character IDs, leaving one standalone Worker.
const ROSTER_IDS = new Set(/* SITES_ROSTER_IDS */ []);
const PUBLIC_ORIGINS = new Set([
  'https://ethanwillingham.com',
  'https://www.ethanwillingham.com',
  'https://ethan-willingham.github.io'
]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VOTER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowedOrigin(origin, request) {
  return PUBLIC_ORIGINS.has(origin) || origin === new URL(request.url).origin ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

function response(request, body, status = 200, extra = {}) {
  const origin = request.headers.get('Origin');
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin',
      ...(origin && allowedOrigin(origin, request) ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600'
      } : {}),
      ...extra
    }
  });
}

function pairFrom(value) {
  if (!Array.isArray(value) || value.length !== 2 || value[0] === value[1] ||
      value.some(id => typeof id !== 'string' || id.length > 100 || !ID_PATTERN.test(id) || !ROSTER_IDS.has(id))) {
    return null;
  }
  return value.slice().sort();
}

async function voterHash(voterId) {
  const bytes = new TextEncoder().encode('spongebob-votes:v1:' + voterId.toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function statsStatement(db, pair, hash) {
  return db.prepare(`SELECT
    COALESCE(SUM(winner = ?1), 0) AS votes_a,
    COALESCE(SUM(winner = ?2), 0) AS votes_b,
    MAX(CASE WHEN voter_hash = ?3 THEN winner END) AS visitor_winner
    FROM matchup_votes WHERE pair_a = ?1 AND pair_b = ?2`).bind(pair[0], pair[1], hash);
}

function resultFor(pair, stats, accepted) {
  const a = Number(stats.votes_a);
  const b = Number(stats.votes_b);
  const total = a + b;
  const first = total ? Math.round(a / total * 1000) / 10 : 0;
  return {
    pair,
    counts: { [pair[0]]: a, [pair[1]]: b },
    percentages: { [pair[0]]: first, [pair[1]]: total ? Math.round((100 - first) * 10) / 10 : 0 },
    total,
    winner: stats.visitor_winner || null,
    alreadyVoted: Boolean(stats.visitor_winner),
    ...(accepted === undefined ? {} : { accepted })
  };
}

// Owner maintenance is disabled unless a short-lived secret is configured.
// Match the entire reviewed row so a cleanup can remove at most one response.
async function removeVote(request, env) {
  const expires = Number(env.VOTE_MAINTENANCE_EXPIRES_AT);
  if (request.method !== 'POST' || request.headers.has('Origin') ||
      !env.VOTE_MAINTENANCE_TOKEN || env.VOTE_MAINTENANCE_TOKEN.length < 40 ||
      !Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000) ||
      request.headers.get('Authorization') !== 'Bearer ' + env.VOTE_MAINTENANCE_TOKEN) {
    return response(request, { error: 'not_found' }, 404);
  }
  let input;
  try {
    const body = await request.text();
    if (body.length > 2048) return response(request, { error: 'request_too_large' }, 413);
    input = JSON.parse(body);
  } catch { return response(request, { error: 'invalid_json' }, 400); }
  const pair = pairFrom(input?.pair);
  if (!pair || !pair.includes(input.winner) ||
      !/^[0-9a-f]{64}$/.test(input.voterHash) ||
      !Number.isSafeInteger(input.createdAt) || input.createdAt < 1) {
    return response(request, { error: 'invalid_vote' }, 400);
  }
  if (!env.DB) return response(request, { error: 'votes_unavailable' }, 503);
  try {
    const db = typeof env.DB.withSession === 'function' ? env.DB.withSession('first-primary') : env.DB;
    const deleted = db.prepare(`DELETE FROM matchup_votes
      WHERE pair_a = ?1 AND pair_b = ?2 AND voter_hash = ?3 AND winner = ?4 AND created_at = ?5`)
      .bind(pair[0], pair[1], input.voterHash, input.winner, input.createdAt);
    const batch = await db.batch([deleted, statsStatement(db, pair, '')]);
    return response(request, { removed: Number(batch[0].meta.changes), ...resultFor(pair, batch[1].results[0]) });
  } catch { return response(request, { error: 'votes_unavailable' }, 503); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/internal/remove-vote') return removeVote(request, env);
    const origin = request.headers.get('Origin');
    if (origin && !allowedOrigin(origin, request)) {
      return response(request, { error: 'origin_not_allowed' }, 403);
    }
    if (request.method === 'OPTIONS') {
      return response(request, null, 204);
    }
    if (url.pathname === '/' || url.pathname === '/health') {
      if (request.method !== 'GET') return response(request, { error: 'method_not_allowed' }, 405, { Allow: 'GET' });
      return response(request, { service: 'SpongeBob matchup votes', ready: Boolean(env.DB), rosterSize: ROSTER_IDS.size });
    }
    if (url.pathname !== '/v1/votes') return response(request, { error: 'not_found' }, 404);
    if (!env.DB) return response(request, { error: 'votes_unavailable' }, 503);
    if (request.method !== 'GET' && request.method !== 'POST') {
      return response(request, { error: 'method_not_allowed' }, 405, { Allow: 'GET, POST, OPTIONS' });
    }

    let input;
    if (request.method === 'GET') {
      input = { pair: [url.searchParams.get('a'), url.searchParams.get('b')], voterId: url.searchParams.get('voterId') };
    } else {
      // JSON POSTs require an approved browser origin, preventing cross-site forms.
      if (!origin) return response(request, { error: 'origin_required' }, 403);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
        return response(request, { error: 'json_required' }, 415);
      }
      if (Number(request.headers.get('Content-Length')) > 2048) {
        return response(request, { error: 'request_too_large' }, 413);
      }
      try {
        const body = await request.text();
        if (body.length > 2048) return response(request, { error: 'request_too_large' }, 413);
        input = JSON.parse(body);
      } catch {
        return response(request, { error: 'invalid_json' }, 400);
      }
    }
    const pair = pairFrom(input?.pair);
    if (!pair) return response(request, { error: 'invalid_pair' }, 400);
    if (typeof input.voterId !== 'string' || !VOTER_PATTERN.test(input.voterId)) {
      return response(request, { error: 'invalid_voter' }, 400);
    }
    if (request.method === 'POST' && !pair.includes(input.winner)) {
      return response(request, { error: 'invalid_winner' }, 400);
    }

    try {
      const hash = await voterHash(input.voterId);
      // D1 sessions keep a read after a vote current even with read replication.
      const db = typeof env.DB.withSession === 'function' ? env.DB.withSession('first-primary') : env.DB;
      if (request.method === 'GET') {
        return response(request, resultFor(pair, await statsStatement(db, pair, hash).first()));
      }
      const inserted = db.prepare(`INSERT INTO matchup_votes (pair_a, pair_b, voter_hash, winner)
        VALUES (?1, ?2, ?3, ?4) ON CONFLICT(pair_a, pair_b, voter_hash) DO NOTHING`)
        .bind(pair[0], pair[1], hash, input.winner);
      // Both statements run in one atomic batch. Repeated clicks and retries count once.
      const batch = await db.batch([inserted, statsStatement(db, pair, hash)]);
      return response(request, resultFor(pair, batch[1].results[0], Number(batch[0].meta.changes) === 1));
    } catch {
      return response(request, { error: 'votes_unavailable' }, 503);
    }
  }
};
