#!/usr/bin/env node
/* ============================================================================
   update-about.mjs  -  one command to refresh everything on the About page's
   "How it's made" section. Run it whenever you have shipped posts or burned
   tokens and the page has gone stale.

   What it refreshes, in one pass:
     1. TOKENS    ccusage -> the 3 headline stats in about.html (tokens / peak day
                  / cost) and the per-model fuel totals in the attribution viz.
     2. RIVER     git log -> appends every commit since the last refresh to the
                  commit river (js/git-history-data.js), and adds a new topic for
                  each new post so its dots get their own color + legend entry.
     3. TILES     appends a per-post attribution tile for every new post (the
                  "which AI built which page" viz), computed from this machine's
                  Claude Code transcripts via build-attribution.mjs.
     4. SEARCH    rebuilds search-index.json so new posts are findable.

   Usage (from the repo root):
     node tools/update-about.mjs            # DRY RUN: show every change, write nothing
     node tools/update-about.mjs --write    # apply all four updates to the files
     node tools/update-about.mjs --write --commit   # ...then git add+commit+push

   DESIGN NOTES
   - The commit river is APPEND-ONLY on purpose. The public history was rewritten
     on 2026-05-29; the pre-rewrite snapshot in git-history-data.js must be kept
     byte-for-byte. This tool never regenerates it, it only appends newer commits.
   - The token headline is a frozen baseline + live ccusage. The published number
     ("everything through the last refresh") lives in tools/about-stats.json, and
     each run adds this machine's usage since. Folded days persist in that file so
     the number never drops when old ccusage logs get pruned. The second machine's
     historical contribution is the seeded baseline (it is not re-derivable here).
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

// ============================================================================
// Enumerate posts the way the rest of the site does: the index.html article
// list (live posts, in order) + the archive/ folder (archived posts).
// ============================================================================
function enumeratePosts() {
  const out = [];
  const idx = readFileSync(join(REPO, 'index.html'), 'utf8');
  const listHtml = (idx.match(/<ul class="article-list">([\s\S]*?)<\/ul>/) || [, ''])[1];
  const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  for (const block of listHtml.split(/<li class="article-list-item/).slice(1)) {
    const href = (block.match(/<a class="article-item" href="([^"]+)"/) || [])[1];
    if (!href || !/^[a-z0-9-]+\.html$/.test(href)) continue;       // skip external / sub-path links
    if (href === 'grand-motherload.html') continue;                // frozen game demo (Sluice) is excluded from the build viz
    const title = strip((block.match(/<h2 class="article-item-title">([\s\S]*?)<\/h2>/) || [, ''])[1]);
    out.push({ key: href.replace(/\.html$/, ''), href, title, kind: 'post' });
  }
  let dirs = [];
  try { dirs = readdirSync(join(REPO, 'archive'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch {}
  for (const slug of dirs) {
    const href = `archive/${slug}/${slug}.html`;
    if (!existsSync(join(REPO, href))) continue;
    const head = readFileSync(join(REPO, href), 'utf8').slice(0, 4000);
    const title = strip((head.match(/<meta property="og:title" content="([^"]+)"/) || head.match(/<title>([^<]+)<\/title>/) || [, slug])[1]);
    out.push({ key: slug, href, title, kind: 'archived' });
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
  const label = p.title.split(/[,:]/)[0].trim() || p.key;       // short label for the legend
  const topic = { key: p.key, label, color, kind: p.kind, href: p.href };
  topics.push(topic);
  topicIndexByKey.set(p.key, topics.length - 1);
  topicHrefs.add(p.href);
  newTopics.push(topic);
}
log(newTopics.length ? `  + ${newTopics.length} new topics: ` + newTopics.map(t => t.key).join(', ') : dim('  no new posts'));

// file -> topic-key router (mirrors build-attribution.mjs, plus the new topics)
const route = new Map();
for (const t of topics) if (t.href) {
  route.set(t.href, t.key);
  const slug = t.href.replace(/.*\//, '').replace(/\.html$/, '');
  route.set('js/' + slug + '.js', t.key);
}
const ALIAS = { 'js/globe.js': 'daylight-globe', 'the-first-year.html': 'first-year', 'baby-research.html': 'first-year' };
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
// PHASE 1 (TOKENS) -- read ccusage, fold completed days into the durable
// baseline, compute the display numbers. (Applied after the tile pass so it can
// set per-model fuel on the freshly-appended attribution file.)
// ============================================================================
function readCcusage() {
  const tries = ['ccusage --json', `bun ${JSON.stringify(join(homedir(), '.bun/bin/ccusage'))} --json`, 'npx -y ccusage@latest --json'];
  for (const cmd of tries) {
    try {
      const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
      const o = JSON.parse(out);
      if (o && (o.daily || o.totals)) return o;
    } catch {}
  }
  return null;
}
log(H('3/4  TOKENS  ') + dim('ccusage -> headline stats + per-model fuel'));
const cc = readCcusage();
const attr = loadData(F_ATTR);

// seed the durable baseline from the currently-published numbers on first run
let stats;
if (existsSync(F_STATS)) {
  stats = JSON.parse(readFileSync(F_STATS, 'utf8'));
} else {
  const seedModels = {};
  for (const m of attr.obj.models) seedModels[m.id] = { tokens: m.tokens, cost: m.cost };
  stats = {
    note: 'Durable baseline for the About-page token stats. tokens/cost/peak are everything through lastFoldedDate; update-about.mjs adds this machine\'s ccusage since, and folds completed days back in here so the totals survive ccusage log pruning. Edit by hand only to re-baseline.',
    lastFoldedDate: '2026-06-16',
    tokens: 18100000000, cost: 17000, peakTokens: 1540000000,
    models: seedModels,
  };
  log(dim('  (seeded tools/about-stats.json from the published 18.1B / $17,000 baseline)'));
}

let tokStr, peakStr, costStr, modelFuel = null, foldInfo = '';
if (!cc) {
  log(warn('  ccusage not available -- leaving token numbers unchanged'));
} else {
  const daily = cc.daily || [];
  const t0 = today();
  const after = daily.filter(d => d.period > stats.lastFoldedDate);   // everything new since last fold
  const liveTok = after.reduce((s, d) => s + (d.totalTokens || 0), 0);
  const liveCost = after.reduce((s, d) => s + (d.totalCost || 0), 0);
  const dispTok = stats.tokens + liveTok;
  const dispCost = stats.cost + liveCost;
  const peak = Math.max(stats.peakTokens, ...daily.map(d => d.totalTokens || 0));
  // per-model display fuel = baseline + this machine since lastFoldedDate
  const liveModel = {};
  for (const d of after) for (const b of (d.modelBreakdowns || [])) {
    const id = b.modelName; if (!liveModel[id]) liveModel[id] = { tokens: 0, cost: 0 };
    liveModel[id].tokens += (b.cacheReadTokens || 0) + (b.cacheCreationTokens || 0) + (b.inputTokens || 0) + (b.outputTokens || 0);
    liveModel[id].cost += b.cost || 0;
  }
  modelFuel = {};
  for (const m of attr.obj.models) {
    const base = stats.models[m.id] || { tokens: m.tokens, cost: m.cost };
    const live = liveModel[m.id] || { tokens: 0, cost: 0 };
    modelFuel[m.id] = { tokens: Math.round(base.tokens + live.tokens), cost: Math.round(base.cost + live.cost) };
  }
  tokStr = (dispTok / 1e9).toFixed(1) + 'B';
  peakStr = (peak / 1e9).toFixed(2) + 'B';
  costStr = '~$' + (Math.round(dispCost / 100) * 100).toLocaleString('en-US');
  log(`  tokens  ${dim('18.1B'.padEnd(8))} -> ${ok(tokStr)}     peak ${ok(peakStr)}     cost ${ok(costStr)}   ${dim(`(+${(liveTok / 1e9).toFixed(2)}B, +$${Math.round(liveCost)} since ${stats.lastFoldedDate})`)}`);
  // fold completed days (strictly before today) into the durable baseline
  const fold = after.filter(d => d.period < t0);
  if (fold.length) {
    const foldTok = fold.reduce((s, d) => s + (d.totalTokens || 0), 0);
    stats.tokens += foldTok; stats.cost += fold.reduce((s, d) => s + (d.totalCost || 0), 0);
    stats.peakTokens = peak;
    stats.lastFoldedDate = fold.reduce((m, d) => d.period > m ? d.period : m, stats.lastFoldedDate);
    for (const d of fold) for (const b of (d.modelBreakdowns || [])) {
      const id = b.modelName; if (!stats.models[id]) stats.models[id] = { tokens: 0, cost: 0 };
      stats.models[id].tokens += (b.cacheReadTokens || 0) + (b.cacheCreationTokens || 0) + (b.inputTokens || 0) + (b.outputTokens || 0);
      stats.models[id].cost += b.cost || 0;
    }
    foldInfo = `folded ${fold.length} day(s) through ${stats.lastFoldedDate}`;
  }
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
hist.banner = hist.banner.replace(/last refreshed \d{4}-\d{2}-\d{2}/, 'last refreshed ' + today());
saveData(F_HIST, hist.banner, hist.varName, hist.obj);
log(ok(`  wrote js/git-history-data.js`) + dim(`  (${topics.length} topics, ${commits.length} commits)`));

// 2. tiles (build-attribution reads the updated topic list, appends tiles, bumps model.posts/edits)
try {
  execSync('node tools/build-attribution.mjs --write', { cwd: REPO, stdio: 'inherit', env: { ...process.env, ATTR_NEW_JSON: JSON.stringify(ATTR_NEW) } });
} catch (e) { console.error(warn('  build-attribution failed: ' + e.message)); }

// 3. token numbers: re-read the attribution file (now with new tiles) and set fuel + dates
if (cc) {
  const a2 = loadData(F_ATTR);
  for (const m of a2.obj.models) if (modelFuel[m.id]) { m.tokens = modelFuel[m.id].tokens; m.cost = modelFuel[m.id].cost; }
  a2.obj.generated = nowSec();
  if (a2.obj.window) a2.obj.window = a2.obj.window.replace(/to\s+\d{4}-\d{2}-\d{2}\s*$/, 'to ' + today());
  saveData(F_ATTR, a2.banner, a2.varName, a2.obj);
  let about = readFileSync(F_ABOUT, 'utf8');
  // function replacements: costStr contains a '$', which would be read as a
  // backreference ($1) in a string replacement and corrupt the markup.
  about = about
    .replace(/(<span class="n">)[^<]*(<\/span><span class="l">[^<]*and counting)/, (_, a, b) => a + tokStr + b)
    .replace(/(<span class="n">)[^<]*(<\/span><span class="l">in a single day)/, (_, a, b) => a + peakStr + b)
    .replace(/(<span class="n">)[^<]*(<\/span><span class="l">at list prices)/, (_, a, b) => a + costStr + b);
  writeFileSync(F_ABOUT, about);
  writeFileSync(F_STATS, JSON.stringify(stats, null, 2) + '\n');
  log(ok('  wrote about.html token stats') + dim(`  ${tokStr} / ${peakStr} / ${costStr}`) + (foldInfo ? dim('  + ' + foldInfo) : ''));
}

// 4. search index
try {
  execSync('node tools/build-search-index.mjs', { cwd: REPO, stdio: 'inherit' });
  log(ok('  rebuilt search-index.json'));
} catch (e) { console.error(warn('  build-search-index failed: ' + e.message)); }

// optional commit + push
if (COMMIT) {
  log(H('COMMIT + PUSH'));
  const files = ['js/git-history-data.js', 'js/git-attribution-data.js', 'about.html', 'search-index.json', 'tools/about-stats.json'];
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
