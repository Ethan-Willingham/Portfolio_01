#!/usr/bin/env node
/* ============================================================================
   build-attribution.mjs  -  rebuild the About-page "Which mind built which page"
   attribution data (js/git-attribution-data.js), the per-post model viz.

   Run from the repo root:
     node tools/build-attribution.mjs                 # validate + preview only
     node tools/build-attribution.mjs --write         # write the new dataset
     node tools/build-attribution.mjs --exclude-session=<uuid>   # drop a session
     node tools/build-attribution.mjs random-galaxy machine-to-atom   # spot-check keys

   WHY THIS EXISTS: the original generator kept being written to /tmp and lost, so
   it has been reconstructed from scratch more than once. This is the committed,
   reusable version. Edit the NEW config block below, run with --write, verify on
   about.html, commit.

   THE ALGORITHM (matches the committed data):
     - scan THIS machine's Claude Code transcripts (~/.claude/projects/-Users-...)
       and Codex transcripts (~/.codex/sessions)
     - each assistant message with an Edit/Write/MultiEdit tool_use is attributed
       to message.model + the post whose file it touched
     - each successful Codex patch_apply_end event is attributed the same way
     - tools/about-attribution-ledger.json keeps hashed Claude and Codex session
       snapshots, so pruned transcripts never remove already-published credit
     - edit-share  = count of ops
     - token-share = each turn's usage.output_tokens split across the (distinct)
       POST files it edited (shared files like style.css are not the denominator)
     - file -> post key via the git-history topic hrefs + js aliases

   Transcripts get pruned over time. The ledger keeps the last known snapshot of
   each hashed session and a one-time residual for work whose original transcript
   was already gone at migration. Existing sessions can grow, new sessions can be
   added, and missing sessions do not make a post's credit go backward.

   A post built on ANOTHER machine/account has zero edits here and is correctly
   ABSENT. Do NOT fabricate a tile for it.
   Per-model fuel totals (models[].tokens/cost) are a blended two-machine ccusage
   snapshot this script does NOT recompute; it only bumps the post/edit counts.
   ============================================================================ */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const REPO = process.cwd();
const TX = join(homedir(), '.claude/projects/-Users-ethan-Portfolio-01');
const CODEX_TX = join(homedir(), '.codex/sessions');
const LEDGER_FILE = join(REPO, 'tools/about-attribution-ledger.json');
const OLD_CODEX_LEDGER = join(REPO, 'tools/about-codex-attribution.json');
const MODEL_REGISTRY = JSON.parse(readFileSync(join(REPO, 'tools/about-models.json'), 'utf8'));
const TRACKED_MODELS = MODEL_REGISTRY.models;

const GH = JSON.parse(readFileSync(join(REPO, 'js/git-history-data.js'), 'utf8').match(/=\s*(\{[\s\S]*\});?\s*$/m)[1]);
const ATTR = JSON.parse(readFileSync(join(REPO, 'js/git-attribution-data.js'), 'utf8').match(/=\s*(\{[\s\S]*\});?\s*$/m)[1]);

// ============================================================================
// CONFIG — edit this when adding posts. Each NEW entry needs its file set (so the
// router catches every edit) and its tile metadata (label = the post's <h1>).
// Re-add the same entry on the next run is harmless: present tiles are skipped.
// ============================================================================
// tools/update-about.mjs feeds the new-post set in via ATTR_NEW_JSON so it does
// not have to duplicate the attribution algorithm. Hand-edit the literal below
// only when running this script standalone.
const NEW = process.env.ATTR_NEW_JSON ? JSON.parse(process.env.ATTR_NEW_JSON) : {
  // 'my-post': { files: ['my-post.html', 'js/my-post.js'],
  //              label: 'My Post Title', href: 'my-post.html', kind: 'post' },
  // archived: href: 'archive/my-post/my-post.html', kind: 'archived'
  sluice: { files: ['grand-motherload.html', 'js/sluice.js'], label: 'Sluice', href: 'grand-motherload.html', kind: 'post' },
  'under-the-street': { files: ['under-the-street.html'], label: "What's Under a Twin Cities Street", href: 'under-the-street.html', kind: 'post' },
  kant: { files: ['kant.html', 'js/kant.js'], label: 'Kant', href: 'kant.html', kind: 'post' },
  euclid: { files: ['euclid.html', 'js/euclid.js'], label: 'Euclid', href: 'euclid.html', kind: 'post' },
};

// ---- file -> post-key router ----
const route = new Map();
for (const t of GH.topics) {
  if (t.href) {
    const slug = t.href.replace(/.*\//, '').replace(/\.html$/, '');
    route.set(t.href, t.key);
    route.set(slug + '.html', t.key);
    route.set('js/' + slug + '.js', t.key);
  }
}
const ALIAS = {
  'js/globe.js': 'daylight-globe',
  'the-first-year.html': 'first-year', 'baby-research.html': 'first-year',
  'under-the-street.html': 'under-the-street',
  'grand-motherload.html': 'sluice', 'js/grand-motherload.js': 'sluice',
  'js/liquid-wgpu.js': 'sluice', 'js/smoke-wgpu.js': 'sluice',
};
for (const [f, k] of Object.entries(ALIAS)) route.set(f, k);
for (const [k, m] of Object.entries(NEW)) for (const f of (m.files || [])) route.set(f, k);
const EXCLUDE = new Set();  // (was ['sluice']) the game is now a first-class tile, like every other build

const excludeSession = (process.argv.find(a => a.startsWith('--exclude-session=')) || '').split('=')[1] || '';

function relpath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/^.*\.claude\/worktrees\/[^/]+\//, '').replace(/^.*Portfolio_01\//, '');
}
function keyFor(rel) {
  if (!rel) return '';
  // Sluice game files: most game code lives under js/sluice/ plus the wgpu/audio
  // engines, build script, and game assets, none of which the topic/alias routes
  // below would catch. Route them all to the one "sluice" tile.
  if (/(^|\/)(js\/sluice(\.js|\/)|grand-motherload\.(html|js)|js\/(liquid|smoke|jello)-wgpu\.js|js\/audio\.js|build-sluice\.sh|assets\/(shop|music|sfx)\/|docs\/game\/)/.test(rel)) return 'sluice';
  // Try the path and each trailing suffix, so an edit made in ANY sibling clone or
  // worktree routes like one in the main checkout. The posts were drafted in oddly
  // named clones (/Users/ethan/portfolio-mach/machiavelli.html, /Users/ethan/
  // pf-sapiens/sapiens.html, /Users/ethan/Portfolio_01-camus/camus.html, ...) whose
  // prefixes relpath() does not strip, so a plain route.get(rel) missed them.
  const parts = rel.split('/');
  for (let i = 0; i < parts.length; i++) {
    const tail = parts.slice(i).join('/');
    if (route.has(tail)) return route.get(tail);
    const am = tail.match(/^archive\/([^/]+)\//);
    if (am) return am[1];
  }
  return '';
}

const DENOM_ALL = process.argv.includes('--denom-all');
let turns = 0, editTurns = 0;
function bumpSnapshot(models, key, model, ed, tok, day) {
  const posts = models[model] || (models[model] = {});
  const a = posts[key] || (posts[key] = { edits: 0, tokens: 0, first: day, last: day });
  a.edits += ed;
  a.tokens += tok;
  if (day && day < a.first) a.first = day;
  if (day && day > a.last) a.last = day;
}
function cleanSnapshot(models) {
  for (const posts of Object.values(models)) for (const a of Object.values(posts)) a.tokens = Math.round(a.tokens);
  return models;
}
function claudeSession(file) {
  let sessionId = basename(file);
  const models = {};
  for (const ln of readFileSync(file, 'utf8').split('\n')) {
    if (!ln) continue;
    let o; try { o = JSON.parse(ln); } catch { continue; }
    sessionId = o.sessionId || sessionId;
    if (excludeSession && o.sessionId === excludeSession) continue;
    const msg = o.message;
    if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    const model = msg.model;
    if (!model || TRACKED_MODELS[model]?.provider !== 'anthropic') continue;
    const tools = msg.content.filter(c => c.type === 'tool_use' && /^(Edit|Write|MultiEdit)$/.test(c.name));
    if (!tools.length) continue;
    turns++;
    const outTok = (msg.usage && msg.usage.output_tokens) || 0;
    const day = (o.timestamp || '').slice(0, 10);
    const ops = tools.map(t => relpath(t.input && t.input.file_path));
    const distinct = [...new Set(ops.filter(Boolean))];
    const denom = DENOM_ALL ? distinct : distinct.filter(rel => keyFor(rel));
    const perFileTok = denom.length ? outTok / denom.length : 0;
    let counted = false;
    for (const rel of ops) {
      const key = keyFor(rel);
      if (!key || EXCLUDE.has(key)) continue;
      bumpSnapshot(models, key, model, 1, 0, day);
      counted = true;
    }
    for (const rel of denom) {
      const key = keyFor(rel);
      if (!key || EXCLUDE.has(key)) continue;
      bumpSnapshot(models, key, model, 0, perFileTok, day);
    }
    if (counted) editTurns++;
  }
  if (!Object.keys(models).length) return null;
  const id = createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
  return ['claude:' + id, { provider: 'claude', models: cleanSnapshot(models) }];
}

// ---- Codex transcripts -> durable per-session ledger ----
// Codex records successful file mutations as patch_apply_end events. A token_count
// event follows the model response that issued each patch, so its output tokens can
// be divided across the distinct post files changed by that response just like the
// Claude transcript pass above.
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

function codexSession(file) {
  let sessionId = basename(file);
  let excluded = false;
  let activeTurn = '';
  const turnModels = new Map();
  const pending = new Map();
  const models = {};

  const flush = (model, outTok) => {
    if (TRACKED_MODELS[model]?.provider !== 'openai' || !pending.size) { pending.clear(); return; }
    const paths = [...pending.values()].reduce((n, x) => n + x.paths.size, 0);
    const perPathTok = paths ? outTok / paths : 0;
    const posts = models[model] || (models[model] = {});
    for (const [key, item] of pending) {
      const a = posts[key] || (posts[key] = { edits: 0, tokens: 0, first: item.first, last: item.last });
      a.edits += item.edits;
      a.tokens += perPathTok * item.paths.size;
      if (item.first < a.first) a.first = item.first;
      if (item.last > a.last) a.last = item.last;
    }
    pending.clear();
  };

  for (const ln of readFileSync(file, 'utf8').split('\n')) {
    if (!ln) continue;
    let o; try { o = JSON.parse(ln); } catch { continue; }
    const p = o.payload || {};
    if (o.type === 'session_meta') {
      sessionId = p.id || p.session_id || sessionId;
      excluded = Boolean(excludeSession && sessionId === excludeSession);
      continue;
    }
    if (o.type === 'turn_context') {
      turnModels.set(p.turn_id, p.model);
      continue;
    }
    if (o.type !== 'event_msg') continue;
    if (p.type === 'task_started') {
      activeTurn = p.turn_id || '';
      pending.clear();
      continue;
    }
    if (p.type === 'patch_apply_end' && p.success) {
      const model = turnModels.get(p.turn_id || activeTurn);
      if (TRACKED_MODELS[model]?.provider !== 'openai') continue;
      const ts = o.timestamp || '';
      for (const path of Object.keys(p.changes || {})) {
        const key = keyFor(path);
        if (!key || EXCLUDE.has(key)) continue;
        const item = pending.get(key) || { edits: 0, paths: new Set(), first: ts, last: ts };
        item.edits += 1;
        item.paths.add(path.replace(/\\/g, '/'));
        if (ts && ts < item.first) item.first = ts;
        if (ts && ts > item.last) item.last = ts;
        pending.set(key, item);
      }
      continue;
    }
    if (p.type === 'token_count') {
      const model = turnModels.get(activeTurn);
      flush(model, (p.info && p.info.last_token_usage && p.info.last_token_usage.output_tokens) || 0);
      continue;
    }
    if (p.type === 'task_complete') {
      flush(turnModels.get(activeTurn), 0);
      activeTurn = '';
    }
  }
  flush(turnModels.get(activeTurn), 0);

  const clean = {};
  for (const [model, posts] of Object.entries(models)) {
    clean[model] = {};
    for (const [key, a] of Object.entries(posts)) {
      clean[model][key] = {
        edits: a.edits,
        tokens: Math.round(a.tokens),
        first: (a.first || '').slice(0, 10),
        last: (a.last || '').slice(0, 10),
      };
    }
  }
  if (excluded || !Object.keys(clean).length) return null;
  const id = createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
  return ['codex:' + id, { provider: 'codex', models: clean }];
}

const committed = new Map(ATTR.posts.map(p => [p.key, p]));
let ledger;
if (existsSync(LEDGER_FILE)) {
  ledger = JSON.parse(readFileSync(LEDGER_FILE, 'utf8'));
} else {
  ledger = {
    note: 'Durable hashed-session ledger for Claude Code and Codex per-post attribution. Session snapshots only grow, retained entries survive local transcript pruning, and residuals preserve already-published work whose transcript was gone at migration.',
    version: 2,
    sessions: {},
    residuals: {}
  };
  if (existsSync(OLD_CODEX_LEDGER)) {
    const old = JSON.parse(readFileSync(OLD_CODEX_LEDGER, 'utf8'));
    for (const [id, session] of Object.entries(old.sessions || {})) {
      ledger.sessions['codex:' + id] = { provider: 'codex', models: session.models || {} };
    }
  }
}
if (ledger.version !== 2) throw new Error('unsupported attribution ledger version');
if (excludeSession) {
  const hash = createHash('sha256').update(excludeSession).digest('hex').slice(0, 16);
  delete ledger.sessions['claude:' + hash];
  delete ledger.sessions['codex:' + hash];
}

function mergeSession(id, fresh) {
  const prior = ledger.sessions[id];
  if (!prior) {
    ledger.sessions[id] = fresh;
    return;
  }
  for (const [model, posts] of Object.entries(fresh.models || {})) for (const [key, a] of Object.entries(posts)) {
    const old = prior.models?.[model]?.[key];
    if (!prior.models[model]) prior.models[model] = {};
    if (!old) {
      prior.models[model][key] = a;
      continue;
    }
    old.edits = Math.max(old.edits || 0, a.edits || 0);
    old.tokens = Math.max(old.tokens || 0, a.tokens || 0);
    if (a.first && (!old.first || a.first < old.first)) old.first = a.first;
    if (a.last && (!old.last || a.last > old.last)) old.last = a.last;
  }
}

let claudeScanned = 0;
if (existsSync(TX)) for (const f of readdirSync(TX)) {
  if (!f.endsWith('.jsonl')) continue;
  const found = claudeSession(join(TX, f));
  if (!found) continue;
  mergeSession(found[0], found[1]);
  claudeScanned++;
}
let codexScanned = 0;
for (const file of jsonlFiles(CODEX_TX)) {
  const found = codexSession(file);
  if (!found) continue;
  mergeSession(found[0], found[1]);
  codexScanned++;
}

function addTotal(map, model, key, a) {
  const id = model + '\0' + key;
  const total = map.get(id) || { model, key, edits: 0, tokens: 0, first: a.first || '', last: a.last || '' };
  total.edits += a.edits || 0;
  total.tokens += a.tokens || 0;
  if (a.first && (!total.first || a.first < total.first)) total.first = a.first;
  if (a.last && (!total.last || a.last > total.last)) total.last = a.last;
  map.set(id, total);
}
function aggregate(includeResiduals) {
  const map = new Map();
  for (const session of Object.values(ledger.sessions)) {
    for (const [model, posts] of Object.entries(session.models || {})) {
      for (const [key, a] of Object.entries(posts)) addTotal(map, model, key, a);
    }
  }
  if (includeResiduals) for (const [model, posts] of Object.entries(ledger.residuals || {})) {
    for (const [key, a] of Object.entries(posts)) addTotal(map, model, key, a);
  }
  return map;
}

// One-time migration: preserve the public number for work whose transcript had
// already been pruned, while letting any newly-discovered work raise it.
if (!ledger.residualsInitialized) {
  const scanned = aggregate(false);
  for (const post of ATTR.posts) for (const [model, row] of Object.entries(post.models || {})) {
    const seen = scanned.get(model + '\0' + post.key) || { edits: 0, tokens: 0 };
    const edits = Math.max(0, (row.edits || 0) - seen.edits);
    const tokens = Math.max(0, (row.tokens || 0) - seen.tokens);
    if (!edits && !tokens) continue;
    if (!ledger.residuals[model]) ledger.residuals[model] = {};
    ledger.residuals[model][post.key] = { edits, tokens, first: post.first, last: post.last };
  }
  ledger.residualsInitialized = new Date().toISOString().slice(0, 10);
}

const durable = aggregate(true);
const byPost = new Map();
for (const a of durable.values()) {
  if (!byPost.has(a.key)) byPost.set(a.key, []);
  byPost.get(a.key).push(a);
}
console.log('Claude sessions with post edits:', claudeScanned, '| Codex sessions with post edits:', codexScanned);
console.log('durable sessions:', Object.keys(ledger.sessions).length, '| model/post rows:', durable.size, '| residual migration:', ledger.residualsInitialized);
console.log('turns with Claude edits:', turns, '| turns counted to a post:', editTurns);
for (const key of process.argv.slice(2).filter(a => !a.startsWith('--'))) {
  const rows = byPost.get(key) || [];
  console.log(`  ${key}: ` + (rows.length ? rows.map(a => `${a.model}:${a.edits}ed/${Math.round(a.tokens)}tok`).join('  ') : 'no attributed edits'));
}

if (process.argv.includes('--write')) {
  const wordCount = file => {
    try {
      let h = readFileSync(join(REPO, file), 'utf8');
      h = (h.match(/<main[\s\S]*?<\/main>/i) || h.match(/<body[\s\S]*?<\/body>/i) || [h])[0]
        .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
      return h.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
    } catch { return 0; }
  };
  const out = JSON.parse(JSON.stringify(ATTR));
  const topicByKey = new Map(GH.topics.map(t => [t.key, t]));
  const postByKey = new Map(out.posts.map(p => [p.key, p]));
  let added = 0;

  // Every tracked row is rebuilt from the durable ledger. Other metadata and the
  // order of existing tiles stay intact.
  for (const post of out.posts) {
    for (const model of Object.keys(post.models || {})) if (TRACKED_MODELS[model]) delete post.models[model];
  }
  for (const a of durable.values()) {
    let post = postByKey.get(a.key);
    if (!post) {
      const supplied = NEW[a.key];
      const topic = topicByKey.get(a.key);
      const meta = supplied || topic;
      if (!meta || !meta.href || !['post', 'archived'].includes(meta.kind)) continue;
      post = {
        key: a.key,
        label: supplied?.label || topic.label,
        href: meta.href,
        kind: meta.kind,
        first: a.first,
        last: a.last,
        edits: 0,
        tokens: 0,
        models: {},
        words: wordCount(meta.file || meta.href)
      };
      out.posts.push(post);
      postByKey.set(a.key, post);
      added++;
    }
    post.models[a.model] = { edits: a.edits, tokens: Math.round(a.tokens) };
  }
  for (const post of out.posts) {
    const rows = Object.entries(post.models || {}).map(([model, a]) => ({ model, ...a, ...(durable.get(model + '\0' + post.key) || {}) }));
    if (!rows.length) continue;
    post.edits = rows.reduce((n, a) => n + (a.edits || 0), 0);
    post.tokens = rows.reduce((n, a) => n + (a.tokens || 0), 0);
    const firsts = rows.map(a => a.first).filter(Boolean);
    const lasts = rows.map(a => a.last).filter(Boolean);
    if (firsts.length) post.first = firsts.sort()[0];
    if (lasts.length) post.last = lasts.sort().at(-1);
  }

  const oldModels = new Map(out.models.map(m => [m.id, m]));
  out.models = [];
  for (const [id, config] of Object.entries(TRACKED_MODELS)) {
    if (!config.showInAttribution) continue;
    const old = oldModels.get(id) || { tokens: 0, cost: 0 };
    const credited = out.posts.filter(p => p.models && p.models[id]);
    out.models.push({
      id,
      label: config.label,
      short: config.short,
      color: config.color,
      tokens: old.tokens || 0,
      cost: old.cost || 0,
      posts: credited.length,
      edits: credited.reduce((n, p) => n + p.models[id].edits, 0)
    });
  }
  out.generated = Math.floor(Date.now() / 1000);
  const windowStart = (out.window.match(/\d{4}-\d{2}-\d{2}/) || ['2026-05-21'])[0];
  const windowEnd = out.posts.reduce((last, p) => p.last > last ? p.last : last, windowStart);
  out.window = windowStart + ' to ' + windowEnd;
  out.note = 'Attribution derived from Claude Code and Codex session transcripts. Each Edit/Write or successful Codex patch op counts as one edit; assistant output tokens are divided across the distinct post files edited in that response. Shared site files are excluded from the per-post token denominator. A durable hashed-session ledger retains published credit after local transcripts are pruned.';

  const banner = readFileSync(join(REPO, 'js/git-attribution-data.js'), 'utf8').match(/^[\s\S]*?(?=window\.GIT_ATTRIBUTION)/)[0];
  writeFileSync(join(REPO, 'js/git-attribution-data.js'), banner + 'window.GIT_ATTRIBUTION = ' + JSON.stringify(out) + ';\n');
  writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`\nWROTE js/git-attribution-data.js: +${added} tiles, ${out.posts.length} total, ${Object.keys(ledger.sessions).length} durable sessions.`);
}
