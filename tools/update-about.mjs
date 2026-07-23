#!/usr/bin/env node
/* ============================================================================
   update-about.mjs  -  one command to refresh everything on the About page's
   "How it's made" section. Run it whenever you have shipped posts or burned
   tokens and the page has gone stale.

   What it refreshes, in one pass:
     1. TOKENS    ccusage + the official model registry -> the 3 headline stats
                  in about.html and per-model fuel totals in the attribution viz.
     2. RIVER     git log -> appends every commit since the last refresh to the
                  commit river (js/git-history-data.js), and adds a new topic for
                  each new post so its dots get their own color + legend entry.
     3. TILES     appends a per-post attribution tile for every new post (the
                  "which AI built which page" viz), computed from this machine's
                  Claude Code and Codex transcripts via build-attribution.mjs.
     4. SEARCH    rebuilds search-index.json so new posts are findable.
     5. SIZE      measures the current publishable checkout.
     6. CHECK     validates every generated dataset before it can be published.

   Usage (from the repo root):
     node tools/update-about.mjs            # DRY RUN: show every change, write nothing
     node tools/update-about.mjs --write    # apply all four updates to the files
     node tools/update-about.mjs --write --commit   # ...then git add+commit+push

   DESIGN NOTES
   - The commit river is APPEND-ONLY on purpose. The public history was rewritten
     on 2026-05-29; the pre-rewrite snapshot in git-history-data.js must be kept
     byte-for-byte. This tool never regenerates it, it only appends newer commits.
   - The token headline is a frozen legacy baseline plus a durable daily ledger.
     Each new day keeps all four token categories so it can survive log pruning and
     be checked against tools/about-models.json. The second machine's historical
     contribution remains in the legacy baseline and is not re-derivable here.
   - "New posts" are read from the index.html article list + the archive/ folder,
     the same authoritative list build-search-index.mjs uses. Ship a post (give it
     a homepage card) and it shows up here automatically. Posts built on another
     machine get a river topic (their commits are real) but no attribution tile
     (this machine has no transcripts for them) - that is correct, not a bug.
   ============================================================================ */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const REPO = process.cwd();
const WRITE = process.argv.includes('--write');
const COMMIT = process.argv.includes('--commit');
const F_HIST = join(REPO, 'js/git-history-data.js');
const F_ATTR = join(REPO, 'js/git-attribution-data.js');
const F_ABOUT = join(REPO, 'about.html');
const F_STATS = join(REPO, 'tools/about-stats.json');
const F_MODELS = join(REPO, 'tools/about-models.json');
const MODEL_REGISTRY = JSON.parse(readFileSync(F_MODELS, 'utf8'));

const H = s => `\n\x1b[1m${s}\x1b[0m`;       // bold heading
const dim = s => `\x1b[2m${s}\x1b[0m`;
const ok = s => `\x1b[32m${s}\x1b[0m`;
const warn = s => `\x1b[33m${s}\x1b[0m`;
const log = (...a) => console.log(...a);

if (!existsSync(F_HIST) || !existsSync(F_ABOUT)) {
  console.error('Run this from the repo root (js/git-history-data.js not found).');
  process.exit(1);
}
log(WRITE ? H('UPDATE ABOUT  (--write: applying changes)') : H('UPDATE ABOUT  (dry run: nothing will be written)'));

// ---- load a `window.X = {...};` data file, preserving its banner comment -----
function loadData(file) {
  const raw = readFileSync(file, 'utf8');
  const am = raw.match(/window\.([A-Z_]+)\s*=\s*(\{[\s\S]*\})\s*;?\s*$/m);
  if (!am) throw new Error('could not parse ' + file);
  const banner = raw.slice(0, raw.indexOf('window.' + am[1]));
  return { banner, varName: am[1], obj: JSON.parse(am[2]) };
}
function saveData(file, banner, varName, obj) {
  writeFileSync(file, banner + 'window.' + varName + ' = ' + JSON.stringify(obj) + ';\n');
}
const today = () => { const d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
const nowSec = () => Math.floor(Date.now() / 1000);
const ymdLocal = value => {
  const d = new Date(value);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
};

// ============================================================================
// Enumerate posts the way the rest of the site does: the index.html article
// list (live posts, in order) + the archive/ folder (archived posts).
// ============================================================================
function enumeratePosts() {
  const out = [];
  const seen = new Set();                                            // a post lives in one place; first source wins
  const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  const titleOf = file => {                                          // a post's own canonical title (og:title), for hub members + archive
    try {
      const head = readFileSync(join(REPO, file), 'utf8').slice(0, 4000);
      return strip((head.match(/<meta property="og:title" content="([^"]+)"/) || head.match(/<title>([^<]+)<\/title>/) || [, ''])[1]);
    } catch { return ''; }
  };
  // pull every <a class="article-item"> out of an <ul class="article-list"> (the
  // markup the homepage AND the hub pages share). preferFileTitle: a hub labels its
  // card with a short series name, so take the post's own <title> for the tile.
  const fromList = (html, preferFileTitle) => {
    const listHtml = (html.match(/<ul class="article-list">([\s\S]*?)<\/ul>/) || [, ''])[1];
    for (const block of listHtml.split(/<li class="article-list-item/).slice(1)) {
      const href = (block.match(/<a class="article-item" href="([^"]+)"/) || [])[1];
      if (!href || !/^[a-z0-9-]+\.html$/.test(href)) continue;      // skip external / sub-path links
      if (href === 'grand-motherload.html') continue;               // frozen game demo (Sluice) is excluded from the build viz
      if (seen.has(href)) continue;
      seen.add(href);
      const cardTitle = strip((block.match(/<h2 class="article-item-title">([\s\S]*?)<\/h2>/) || [, ''])[1]);
      const title = (preferFileTitle && titleOf(href)) || cardTitle;
      out.push({ key: href.replace(/\.html$/, ''), href, title, kind: 'post' });
    }
  };

  // 1. live posts on the homepage
  fromList(readFileSync(join(REPO, 'index.html'), 'utf8'), false);

  // 2. the series posts that live INSIDE the hub index pages (religion, philosophy,
  //    ...), not on the homepage. Without this they get no river topic and no
  //    attribution tile at all. Discover the hubs from gen-hubs.mjs (its own source
  //    of truth, so new shelves are picked up), falling back to any root page that
  //    itself renders an article-list.
  let hubs = [];
  try {
    const src = readFileSync(join(REPO, 'tools/gen-hubs.mjs'), 'utf8');
    hubs = [...src.matchAll(/slug:\s*'([a-z0-9-]+)'/g)].map(m => m[1] + '.html');
  } catch {}
  if (!hubs.length) {
    try {
      hubs = readdirSync(REPO).filter(f => /^[a-z0-9-]+\.html$/.test(f) && f !== 'index.html' &&
        /<ul class="article-list">/.test(readFileSync(join(REPO, f), 'utf8')));
    } catch {}
  }
  for (const hub of hubs) if (existsSync(join(REPO, hub))) fromList(readFileSync(join(REPO, hub), 'utf8'), true);

  // 3. archived posts
  let dirs = [];
  try { dirs = readdirSync(join(REPO, 'archive'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch {}
  for (const slug of dirs) {
    const href = `archive/${slug}/${slug}.html`;
    if (!existsSync(join(REPO, href)) || seen.has(href)) continue;
    seen.add(href);
    out.push({ key: slug, href, title: titleOf(href) || slug, kind: 'archived' });
  }
  return out;
}
const POSTS = enumeratePosts();
const postByKey = new Map(POSTS.map(p => [p.key, p]));

// ============================================================================
// PHASE 2 (RIVER) -- append new commits + add a topic for each new post.
// Done first because build-attribution reads the topic list to route files.
// ============================================================================
const hist = loadData(F_HIST);
const topics = hist.obj.topics;
const topicIndexByKey = new Map(topics.map((t, i) => [t.key, i]));
const PALETTE = [...new Set(topics.map(t => t.color))];

// add a river topic for any enumerated post that does not have one yet. Dedup by
// HREF, not key: the same post is keyed short in the curated data ("forty") but
// long by its archive folder ("forty-not-a-hundred"), and the game demo lives
// under the "sluice" topic whose href is grand-motherload.html.
log(H('1/4  RIVER  ') + dim('new posts -> topics'));
const topicHrefs = new Set(topics.map(t => t.href).filter(Boolean));
const newTopics = [];
for (const p of POSTS) {
  if (topicHrefs.has(p.href)) continue;
  const color = PALETTE[(topics.length + newTopics.length) % PALETTE.length];
  const label = p.title || p.key;                               // full post title (relabel pass below keeps it exact)
  const topic = { key: p.key, label, color, kind: p.kind, href: p.href };
  topics.push(topic);
  topicIndexByKey.set(p.key, topics.length - 1);
  topicHrefs.add(p.href);
  newTopics.push(topic);
}
log(newTopics.length ? `  + ${newTopics.length} new topics: ` + newTopics.map(t => t.key).join(', ') : dim('  no new posts'));

// relabel every post topic from its own og:title, so the legend buttons read as
// the actual blog-post titles (not the short hand-picked labels). Works for posts
// that have since left the homepage too (e.g. weather). The frozen game demo
// (grand-motherload.html under the "sluice" topic) keeps its label.
const ENT2 = { amp: '&', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…', nbsp: ' ' };
const titleFromFile = href => {
  if (!href || href === 'grand-motherload.html' || !existsSync(join(REPO, href))) return null;
  const head = readFileSync(join(REPO, href), 'utf8').slice(0, 6000);
  const m = head.match(/<meta property="og:title" content="([^"]+)"/) || head.match(/<title>([^<]+)<\/title>/);
  if (!m) return null;
  return m[1].replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&([a-z0-9]+);/gi, (x, n) => ENT2[n.toLowerCase()] || x).replace(/\s+/g, ' ').trim();
};
const titleByHref = new Map(POSTS.map(p => [p.href, p.title]));   // homepage-card titles (what a visitor sees)
let relabeled = 0;
for (const t of topics) {
  if (t.kind !== 'post' && t.kind !== 'archived') continue;
  const title = titleByHref.get(t.href) || titleFromFile(t.href); // card title first, else the post's own og:title
  if (title && title !== t.label) { t.label = title; relabeled++; }
}
log(relabeled ? `  relabeled ${relabeled} button(s) to their actual post titles` : dim('  topic labels already match'));

// file -> topic-key router (mirrors build-attribution.mjs, plus the new topics)
const route = new Map();
for (const t of topics) if (t.href) {
  route.set(t.href, t.key);
  const slug = t.href.replace(/.*\//, '').replace(/\.html$/, '');
  route.set(slug + '.html', t.key);
  route.set('js/' + slug + '.js', t.key);
}
const ALIAS = {
  'js/globe.js': 'daylight-globe',
  'the-first-year.html': 'first-year',
  'baby-research.html': 'first-year',
  'under-the-street.html': 'under-the-street'
};
for (const [f, k] of Object.entries(ALIAS)) if (topicIndexByKey.has(k)) route.set(f, k);
const GENERIC = new Set(['homepage', 'site', 'docs']);
function fileKey(f) {
  if (route.has(f)) return route.get(f);
  const am = f.match(/^archive\/([^/]+)\//);
  if (am && topicIndexByKey.has(am[1])) return am[1];
  if (/^docs\//.test(f)) return topicIndexByKey.has('docs') ? 'docs' : null;
  return null;
}
function routeCommit(files) {
  const tally = new Map();
  for (const f of files) { const k = fileKey(f); if (k) tally.set(k, (tally.get(k) || 0) + 1); }
  if (!tally.size) return topicIndexByKey.has('site') ? 'site' : topics[topics.length - 1].key;
  const specific = [...tally].filter(([k]) => !GENERIC.has(k));
  const pool = specific.length ? specific : [...tally];
  pool.sort((a, b) => b[1] - a[1]);
  return pool[0][0];
}

// pull commits newer than the snapshot's newest from the live repo
log(H('2/4  RIVER  ') + dim('append new commits'));
const commits = hist.obj.commits;
const lastTs = commits.reduce((m, c) => Math.max(m, c[1]), 0);
const haveHash = new Set(commits.map(c => c[0]));
const SEP = '\x1e';
let raw = '';
try {
  raw = execSync(`git log HEAD --no-merges --date=unix --numstat --pretty=format:"${SEP}%H|%ct|%s"`, { encoding: 'utf8', maxBuffer: 1 << 28 });
} catch (e) { console.error('git log failed:', e.message); process.exit(1); }
const fresh = [];
for (const chunk of raw.split(SEP)) {
  if (!chunk.trim()) continue;
  const nl = chunk.indexOf('\n');
  const header = nl < 0 ? chunk : chunk.slice(0, nl);
  const [hashFull, ctStr, ...subjParts] = header.split('|');
  const hash = (hashFull || '').slice(0, 10);
  const ct = +ctStr;
  if (!hash || !ct || ct <= lastTs || haveHash.has(hash)) continue;
  let add = 0, del = 0, files = 0;
  for (const ln of (nl < 0 ? '' : chunk.slice(nl + 1)).split('\n')) {
    const m = ln.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!m) continue;
    files++;
    if (m[1] !== '-') add += +m[1];
    if (m[2] !== '-') del += +m[2];
  }
  const subject = subjParts.join('|');
  const key = routeCommit([...(nl < 0 ? [] : chunk.slice(nl + 1).split('\n'))].map(l => (l.match(/^(?:\d+|-)\t(?:\d+|-)\t(.+)$/) || [])[1]).filter(Boolean));
  fresh.push({ tuple: [hash, ct, add, del, files, topicIndexByKey.get(key), subject], key });
  haveHash.add(hash);
}
fresh.sort((a, b) => a.tuple[1] - b.tuple[1]);            // keep commits[] chronological (the viz assumes it)
for (const f of fresh) commits.push(f.tuple);
const byTopic = {};
for (const f of fresh) byTopic[f.key] = (byTopic[f.key] || 0) + 1;
log(`  + ${fresh.length} new commits since ${new Date(lastTs * 1000).toISOString().slice(0, 10)}` +
  (fresh.length ? '  ' + dim(Object.entries(byTopic).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join('  ')) : ''));

// ============================================================================
// PHASE 1 (TOKENS) -- read ccusage into the durable daily ledger and compute
// display numbers. (Applied after the tile pass so it can set per-model fuel on
// the freshly-appended attribution file.)
// ============================================================================
function readCcusage() {
  const tries = ['ccusage --json', `bun ${JSON.stringify(join(homedir(), '.bun/bin/ccusage'))} --json`];
  for (const cmd of tries) {
    try {
      const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
      const o = JSON.parse(out);
      if (o && (o.daily || o.totals)) return o;
    } catch {}
  }
  return null;
}
function ccusageVersion() {
  const tries = ['ccusage --version', `bun ${JSON.stringify(join(homedir(), '.bun/bin/ccusage'))} --version`];
  for (const cmd of tries) {
    try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  }
  return 'unknown';
}
function priceFor(model, day) {
  const config = MODEL_REGISTRY.models[model];
  if (!config) throw new Error(`unknown model in ccusage: ${model}. Add it to tools/about-models.json after checking its official price.`);
  const prices = (config.prices || []).filter(p => p.from <= day && (!p.through || day <= p.through));
  if (prices.length !== 1) throw new Error(`no unambiguous price for ${model} on ${day}`);
  return prices[0];
}
function pricedBreakdown(model, day, b) {
  const p = priceFor(model, day);
  const million = 1e6;
  return ((b.inputTokens || 0) * p.input +
    (b.cacheCreationTokens || 0) * p.cacheWrite5m +
    (b.cacheReadTokens || 0) * p.cacheRead +
    (b.outputTokens || 0) * p.output) / million;
}
function jsonlFiles(dir) {
  if (!existsSync(dir)) return [];
  let out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, ent.name);
    if (ent.isDirectory()) out = out.concat(jsonlFiles(file));
    else if (ent.isFile() && ent.name.endsWith('.jsonl')) out.push(file);
  }
  return out;
}
// GPT-5.6 changes price when a single request crosses 272K input tokens. Daily
// ccusage aggregates cannot preserve that threshold, so price Codex per response.
function codexCostsByDay() {
  const out = {};
  for (const file of jsonlFiles(join(homedir(), '.codex/sessions'))) {
    let activeTurn = '';
    const turnModels = new Map();
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      let row; try { row = JSON.parse(line); } catch { continue; }
      const p = row.payload || {};
      if (row.type === 'turn_context') {
        turnModels.set(p.turn_id, p.model);
        continue;
      }
      if (row.type !== 'event_msg') continue;
      if (p.type === 'task_started') {
        activeTurn = p.turn_id || activeTurn;
        continue;
      }
      if (p.type !== 'token_count') continue;
      const model = turnModels.get(p.turn_id || activeTurn);
      if (!model || MODEL_REGISTRY.models[model]?.provider !== 'openai') continue;
      const u = p.info && p.info.last_token_usage;
      if (!u) continue;
      const day = ymdLocal(row.timestamp);
      const rate = priceFor(model, day);
      const input = u.input_tokens || 0;
      const cached = u.cached_input_tokens || 0;
      const uncached = Math.max(0, input - cached);
      const long = rate.longContext && input > rate.longContext.aboveInputTokens;
      const inputMult = long ? rate.longContext.inputMultiplier : 1;
      const outputMult = long ? rate.longContext.outputMultiplier : 1;
      const cost = (uncached * rate.input * inputMult +
        cached * rate.cacheRead * inputMult +
        (u.output_tokens || 0) * rate.output * outputMult) / 1e6;
      const key = day + '\0' + model;
      const a = out[key] || (out[key] = { cost: 0, requests: 0, longRequests: 0 });
      a.cost += cost;
      a.requests += 1;
      if (long) a.longRequests += 1;
    }
  }
  return out;
}
log(H('3/4  TOKENS  ') + dim('durable daily ledger + official list prices'));
const cc = readCcusage();
const attr = loadData(F_ATTR);

if (!cc) throw new Error('ccusage is required. Install it or restore ~/.bun/bin/ccusage before publishing About data.');
let stats = JSON.parse(readFileSync(F_STATS, 'utf8'));
if (stats.version !== 2) {
  stats = {
    version: 2,
    note: 'Durable About-page usage ledger. legacy is the published estimate through its cutoff and cannot be reconstructed after old logs were pruned. days keeps full token categories from the cutoff forward so totals survive pruning and future prices can be audited.',
    methodology: {
      collector: 'ccusage',
      collectorVersion: ccusageVersion(),
      pricingRegistry: 'tools/about-models.json',
      pricingVerified: MODEL_REGISTRY.verified,
      priceMeaning: 'API-equivalent list-price estimate, not an invoice',
      cacheWriteAssumption: 'ccusage does not distinguish cache duration, so cacheCreationTokens use the 5-minute write rate',
      gptLongContext: 'GPT-5.6 is priced per Codex response so requests above 272K input tokens receive the official multiplier'
    },
    legacy: {
      through: stats.lastFoldedDate,
      tokens: stats.tokens,
      cost: stats.cost,
      peakTokens: stats.peakTokens,
      models: stats.models
    },
    days: {},
    daily: stats.daily
  };
  log(dim(`  migrated the flat baseline to a durable daily ledger after ${stats.legacy.through}`));
}
stats.methodology.collectorVersion = ccusageVersion();
stats.methodology.pricingVerified = MODEL_REGISTRY.verified;
stats.methodology.priceMeaning = 'API-equivalent estimate using the published rate for each model and usage date, not an invoice';
stats.updated = today();

const codexCosts = codexCostsByDay();
if (!stats.methodology.legacyGptLongContextCorrected) {
  for (const [id, base] of Object.entries(stats.legacy.models)) {
    if (MODEL_REGISTRY.models[id]?.provider !== 'openai') continue;
    const exact = Object.entries(codexCosts)
      .filter(([key]) => key.endsWith('\0' + id) && key.slice(0, 10) <= stats.legacy.through)
      .reduce((sum, [, row]) => sum + row.cost, 0);
    if (!exact) continue;
    stats.legacy.cost += exact - base.cost;
    base.cost = exact;
  }
  stats.methodology.legacyGptLongContextCorrected = true;
}
for (const d of (cc.daily || []).filter(d => d.period > stats.legacy.through)) {
  const day = { totalTokens: 0, cost: 0, models: {} };
  for (const b of (d.modelBreakdowns || [])) {
    const id = b.modelName;
    const tokens = {
      input: b.inputTokens || 0,
      cacheWrite: b.cacheCreationTokens || 0,
      cacheRead: b.cacheReadTokens || 0,
      output: b.outputTokens || 0
    };
    const totalTokens = tokens.input + tokens.cacheWrite + tokens.cacheRead + tokens.output;
    let cost = pricedBreakdown(id, d.period, b);
    let pricing = 'daily categories';
    const exact = codexCosts[d.period + '\0' + id];
    if (MODEL_REGISTRY.models[id]?.provider === 'openai') {
      if (!exact || !exact.requests) throw new Error(`cannot price ${id} on ${d.period}: the per-response Codex log is missing`);
      cost = exact.cost;
      pricing = `per response (${exact.requests} requests, ${exact.longRequests} long-context)`;
    }
    day.models[id] = { ...tokens, totalTokens, cost, pricing };
    day.totalTokens += totalTokens;
    day.cost += cost;
  }
  const prior = stats.days[d.period];
  if (prior && day.totalTokens < prior.totalTokens) {
    log(warn(`  ${d.period} dropped from ${prior.totalTokens} to ${day.totalTokens} tokens in ccusage; keeping the durable stored day`));
    continue;
  }
  stats.days[d.period] = day;
}

const dayRows = Object.entries(stats.days);
const dispTok = stats.legacy.tokens + dayRows.reduce((sum, [, d]) => sum + d.totalTokens, 0);
const dispCost = stats.legacy.cost + dayRows.reduce((sum, [, d]) => sum + d.cost, 0);
const peak = Math.max(stats.legacy.peakTokens, ...dayRows.map(([, d]) => d.totalTokens));
const modelFuel = {};
for (const [id, base] of Object.entries(stats.legacy.models)) modelFuel[id] = { tokens: base.tokens, cost: base.cost };
for (const [, d] of dayRows) for (const [id, b] of Object.entries(d.models)) {
  const fuel = modelFuel[id] || (modelFuel[id] = { tokens: 0, cost: 0 });
  fuel.tokens += b.totalTokens;
  fuel.cost += b.cost;
}
const tokStr = (dispTok / 1e9).toFixed(1) + 'B';
const peakStr = (peak / 1e9).toFixed(2) + 'B';
const costStr = '~$' + (Math.round(dispCost / 100) * 100).toLocaleString('en-US');
log(`  ${ok(tokStr)} tokens   peak ${ok(peakStr)}   ${ok(costStr)}   ${dim(`${dayRows.length} durable day(s) after ${stats.legacy.through}`)}`);

// ---- FUEL LINE: the orange tokens-per-day band on the commit river ----------
// A frozen hand-built baseline (the array in js/git-history.js, May 1 - Jun 16)
// plus a tail rebuilt from ccusage each run, written as GIT_HISTORY.daily. A day
// ccusage has since pruned keeps its last computed value, so the line never loses
// history. git-history.js reads GIT_HISTORY.daily (falling back to its baseline).
let fuelLine = null, fuelMax = null;
if (cc) {
  if (!stats.daily) {
    const code = readFileSync(join(REPO, 'js/git-history.js'), 'utf8');
    const base = (code.match(/var DAILY\s*=\s*(?:\([^)]*\)\s*\|\|\s*)?\[([\s\S]*?)\]/) || [, ''])[1]
      .split(',').map(x => parseInt(x.trim(), 10)).filter(Number.isFinite);
    stats.daily = { t0: '2026-05-01', frozenLen: base.length, baseline: base };
    log(dim(`  (seeded fuel-line baseline: ${base.length} days from js/git-history.js)`));
  }
  const t0d = stats.daily.t0, prev = hist.obj.daily || [];
  const ccMap = {};
  for (const d of (cc.daily || [])) ccMap[d.period] = d.totalTokens || 0;
  const addDays = (iso, n) => { const dt = new Date(iso + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); };
  const idxOf = iso => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(t0d + 'T00:00:00Z')) / 86400000);
  const todayIdx = idxOf(today());
  fuelLine = stats.daily.baseline.slice();                 // frozen baseline, never mutated
  for (let i = stats.daily.frozenLen; i <= todayIdx; i++) {
    const iso = addDays(t0d, i);
    fuelLine[i] = (iso in ccMap) ? ccMap[iso] : (prev[i] || 0);
  }
  fuelMax = Math.max(1.6e9, ...fuelLine);
  log(`  fuel line  ${dim(stats.daily.frozenLen + 'd')} -> ${ok(fuelLine.length + 'd')}   ${dim('latest ' + addDays(t0d, todayIdx) + ' = ' + ((fuelLine[todayIdx] || 0) / 1e9).toFixed(2) + 'B')}`);
}

// ============================================================================
// Apply writes in dependency order: river -> tiles -> token numbers -> search.
// ============================================================================
log(H('4/4  TILES + SEARCH'));
const newTileKeys = (() => {
  const have = new Set(attr.obj.posts.map(p => p.href));   // dedup by href (keys differ from slugs)
  return POSTS.filter(p => !have.has(p.href));
})();
const ATTR_NEW = {};
for (const p of newTileKeys) ATTR_NEW[p.key] = { files: [p.href, 'js/' + p.key + '.js'], label: p.title, href: p.href, kind: p.kind, file: p.href };
log(`  new tiles to attribute: ${newTileKeys.length}` + (newTileKeys.length ? '  ' + dim(newTileKeys.map(p => p.key).join(', ')) : ''));

if (!WRITE) {
  log(H('DRY RUN -- previewing the attribution pass (no files written):'));
  try {
    execSync('node tools/build-attribution.mjs', { cwd: REPO, stdio: 'inherit', env: { ...process.env, ATTR_NEW_JSON: JSON.stringify(ATTR_NEW) } });
  } catch {}
  log(H('Nothing written.') + ' Re-run with ' + ok('--write') + ' to apply, or ' + ok('--write --commit') + ' to also push.');
  process.exit(0);
}

// 1. river
hist.obj.generated = nowSec();
if (fuelLine) { hist.obj.daily = fuelLine; hist.obj.dailyMax = fuelMax; }
hist.banner = hist.banner.replace(/last refreshed \d{4}-\d{2}-\d{2}/, 'last refreshed ' + today());
saveData(F_HIST, hist.banner, hist.varName, hist.obj);
log(ok(`  wrote js/git-history-data.js`) + dim(`  (${topics.length} topics, ${commits.length} commits)`));

// 2. tiles (build-attribution reads the updated topic list, appends tiles, bumps model.posts/edits)
execSync('node tools/build-attribution.mjs --write', { cwd: REPO, stdio: 'inherit', env: { ...process.env, ATTR_NEW_JSON: JSON.stringify(ATTR_NEW) } });

// 3. token numbers: re-read the attribution file (now with new tiles) and set fuel + dates
const a2 = loadData(F_ATTR);
for (const m of a2.obj.models) if (modelFuel[m.id]) {
  m.tokens = Math.round(modelFuel[m.id].tokens);
  m.cost = Math.round(modelFuel[m.id].cost);
}
a2.obj.generated = nowSec();
if (a2.obj.window) a2.obj.window = a2.obj.window.replace(/to\s+\d{4}-\d{2}-\d{2}\s*$/, 'to ' + today());
saveData(F_ATTR, a2.banner, a2.varName, a2.obj);
let about = readFileSync(F_ABOUT, 'utf8');
const replaceStat = (html, key, value) => {
  const re = new RegExp(`(<span class="n" data-about-stat="${key}">)[^<]*(</span>)`);
  if ((html.match(re) || []).length === 0) throw new Error(`about.html is missing the ${key} data marker`);
  return html.replace(re, (_, a, b) => a + value + b);
};
about = replaceStat(about, 'tokens', tokStr);
about = replaceStat(about, 'peak', peakStr);
about = replaceStat(about, 'cost', costStr);
const stamp = new Date(today() + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const freshnessParagraph = `<p data-about-freshness>Updated ${stamp} from my local Claude Code and Codex logs. The dollar figure applies the published API rates for each model and date; it is not what I was billed. <a href="https://github.com/Ethan-Willingham/Portfolio_01/blob/main/tools/ABOUT-DATA.md">The method and its limits are public.</a></p>`;
if (!/<p data-about-freshness>[\s\S]*?<\/p>/.test(about)) throw new Error('about.html is missing the freshness marker');
about = about.replace(/<p data-about-freshness>[\s\S]*?<\/p>/, freshnessParagraph);
writeFileSync(F_ABOUT, about);
writeFileSync(F_STATS, JSON.stringify(stats, null, 2) + '\n');
log(ok('  wrote about.html token stats') + dim(`  ${tokStr} / ${peakStr} / ${costStr}`));

// 4. search index
execSync('node tools/build-search-index.mjs', { cwd: REPO, stdio: 'inherit' });
log(ok('  rebuilt search-index.json'));

// 5. site-size growth curve (deployed bytes per day, from git blob sizes)
execSync('node tools/build-site-size.mjs --write', { cwd: REPO, stdio: 'inherit' });
log(ok('  rebuilt js/site-size-data.js'));

// 6. fail closed: a stale price, missing page, bad total, or partial generator
// run stops here and cannot be published by the live wrapper.
execSync('node tools/check-about.mjs', { cwd: REPO, stdio: 'inherit' });
log(ok('  validated every About dataset'));

// optional commit + push
if (COMMIT) {
  log(H('COMMIT + PUSH'));
  const files = ['js/git-history-data.js', 'js/git-attribution-data.js', 'js/site-size-data.js', 'about.html', 'search-index.json', 'tools/about-stats.json', 'tools/about-models.json', 'tools/about-attribution-ledger.json'];
  try {
    execSync('git add ' + files.map(f => JSON.stringify(f)).join(' '), { cwd: REPO, stdio: 'inherit' });
    const msg = `about: refresh build stats (+${fresh.length} commits, +${newTopics.length} posts, ${tokStr || 'tokens'})`;
    execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: REPO, stdio: 'inherit' });
    execSync('git push', { cwd: REPO, stdio: 'inherit' });
    log(ok('  committed + pushed.'));
  } catch (e) { console.error(warn('  git step failed (resolve by hand): ' + e.message)); }
} else {
  log(H('Done.') + ' Review the diff, then commit, or re-run with ' + ok('--commit') + ' next time to auto-push.');
}
