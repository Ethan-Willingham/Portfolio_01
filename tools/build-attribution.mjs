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
     - each successful Codex patch_apply_end event is attributed the same way;
       tools/about-codex-attribution.json keeps a hashed per-session ledger so
       pruned transcripts never remove already-published credit
     - edit-share  = count of ops
     - token-share = each turn's usage.output_tokens split across the (distinct)
       POST files it edited (shared files like style.css are not the denominator)
     - file -> post key via the git-history topic hrefs + js aliases

   *** ADD-ONLY ON PURPOSE ***  Transcripts get PRUNED over time, so re-deriving
   every post from scratch REGRESSES intact tiles (e.g. machine-to-atom dropped
   from 102 to 2 surviving edits). The Claude pass therefore keeps committed
   rows unchanged and only appends missing posts. Codex rows are rebuilt from
   the durable per-session ledger, which preserves sessions after their local
   transcripts disappear. Run without --write first to inspect both passes.

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
const CODEX_LEDGER = join(REPO, 'tools/about-codex-attribution.json');
const CODEX_MODELS = {
  'gpt-5.6-sol': { label: 'GPT-5.6 Sol', short: 'G5.6', color: '#8FB3C7' },
};

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
};

// ---- file -> post-key router ----
const route = new Map();
for (const t of GH.topics) {
  if (t.href) {
    const slug = t.href.replace(/.*\//, '').replace(/\.html$/, '');
    route.set(t.href, t.key);
    route.set('js/' + slug + '.js', t.key);
  }
}
const ALIAS = {
  'js/globe.js': 'daylight-globe',
  'the-first-year.html': 'first-year', 'baby-research.html': 'first-year',
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

const acc = new Map();
function bump(key, model, ed, tok, ts) {
  if (!acc.has(key)) acc.set(key, { edits: {}, tokens: {}, first: Infinity, last: -Infinity });
  const a = acc.get(key);
  if (ed) a.edits[model] = (a.edits[model] || 0) + ed;
  if (tok) a.tokens[model] = (a.tokens[model] || 0) + tok;
  if (ts != null) { if (ts < a.first) a.first = ts; if (ts > a.last) a.last = ts; }
}

const DENOM_ALL = process.argv.includes('--denom-all');
let turns = 0, editTurns = 0;
for (const f of readdirSync(TX)) {
  if (!f.endsWith('.jsonl')) continue;
  for (const ln of readFileSync(join(TX, f), 'utf8').split('\n')) {
    if (!ln) continue;
    let o; try { o = JSON.parse(ln); } catch { continue; }
    if (excludeSession && o.sessionId === excludeSession) continue;
    const msg = o.message;
    if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    const model = msg.model;
    if (!model || !/^claude/.test(model)) continue;
    const tools = msg.content.filter(c => c.type === 'tool_use' && /^(Edit|Write|MultiEdit)$/.test(c.name));
    if (!tools.length) continue;
    turns++;
    const outTok = (msg.usage && msg.usage.output_tokens) || 0;
    const ts = o.timestamp ? Math.floor(new Date(o.timestamp).getTime() / 1000) : null;
    const ops = tools.map(t => relpath(t.input && t.input.file_path));
    const distinct = [...new Set(ops.filter(Boolean))];
    const denom = DENOM_ALL ? distinct : distinct.filter(rel => keyFor(rel));
    const perFileTok = denom.length ? outTok / denom.length : 0;
    let counted = false;
    for (const rel of ops) { const key = keyFor(rel); if (!key || EXCLUDE.has(key)) continue; bump(key, model, 1, 0, ts); counted = true; }
    for (const rel of denom) { const key = keyFor(rel); if (!key || EXCLUDE.has(key)) continue; bump(key, model, 0, perFileTok, ts); }
    if (counted) editTurns++;
  }
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
  let activeTurn = '';
  const turnModels = new Map();
  const pending = new Map();
  const models = {};

  const flush = (model, outTok) => {
    if (!CODEX_MODELS[model] || !pending.size) { pending.clear(); return; }
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
      if (!CODEX_MODELS[model]) continue;
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
  if (!Object.keys(clean).length) return null;
  const id = createHash('sha256').update(sessionId).digest('hex').slice(0, 16);
  return [id, { models: clean }];
}

const ledger = existsSync(CODEX_LEDGER)
  ? JSON.parse(readFileSync(CODEX_LEDGER, 'utf8'))
  : {
      note: 'Durable hashed-session ledger for Codex per-post attribution. Rebuilt by tools/build-attribution.mjs; retained entries survive local transcript pruning.',
      version: 1,
      sessions: {},
    };
let codexScanned = 0;
for (const file of jsonlFiles(CODEX_TX)) {
  const found = codexSession(file);
  if (!found) continue;
  const [id, data] = found;
  ledger.sessions[id] = data;
  codexScanned++;
}

const codexAcc = new Map();
for (const session of Object.values(ledger.sessions)) {
  for (const [model, posts] of Object.entries(session.models || {})) {
    for (const [key, a] of Object.entries(posts)) {
      const id = model + '\0' + key;
      const total = codexAcc.get(id) || { model, key, edits: 0, tokens: 0, first: a.first, last: a.last };
      total.edits += a.edits || 0;
      total.tokens += a.tokens || 0;
      if (a.first && a.first < total.first) total.first = a.first;
      if (a.last && a.last > total.last) total.last = a.last;
      codexAcc.set(id, total);
    }
  }
}

const ymd = ts => { const d = new Date(ts * 1000); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
const committed = new Map(ATTR.posts.map(p => [p.key, p]));
const totals = a => ({ te: Object.values(a.edits).reduce((x, y) => x + y, 0), tt: Object.values(a.tokens).reduce((x, y) => x + y, 0) });

const checkKeys = process.argv.slice(2).filter(a => !a.startsWith('--'));
const keys = checkKeys.length ? checkKeys : ['random-galaxy', 'particle-life', 'optional-body', 'all-in'];
console.log('transcripts:', TX, excludeSession ? `(excluding session ${excludeSession})` : '');
console.log('turns with edits:', turns, '| turns counted to a post:', editTurns);
console.log('Codex sessions with post edits:', codexScanned, '| durable model/post rows:', codexAcc.size);
for (const a of [...codexAcc.values()].sort((x, y) => y.tokens - x.tokens)) {
  console.log(`  ${a.model} -> ${a.key}: ${a.edits}ed / ${Math.round(a.tokens)}tok [${a.first}..${a.last}]`);
}
console.log('\nVALIDATION (computed vs committed — expect EXACT/close for untouched posts):');
for (const k of keys) {
  const a = acc.get(k), c = committed.get(k);
  if (!a) { console.log(`  ${k}: NOT FOUND in transcripts`); continue; }
  const { te, tt } = totals(a);
  const match = c && te === c.edits && Math.round(tt) === Math.round(c.tokens) ? 'EXACT' : 'DIFF';
  console.log(`  ${k}: computed ${te}ed / ${Math.round(tt)}tok | committed ${c ? c.edits + 'ed / ' + Math.round(c.tokens) + 'tok' : 'absent'} [${match}]`);
}
console.log('\nNEW posts (to be appended):');
for (const k of Object.keys(NEW)) {
  const a = acc.get(k);
  if (!a) { console.log(`  ${k}: NONE in this machine's transcripts (built elsewhere? leave absent)`); continue; }
  const { te, tt } = totals(a);
  console.log(`  ${k}: ${te}ed / ${Math.round(tt)}tok [${ymd(a.first)}..${ymd(a.last)}] ` +
    Object.keys(a.edits).map(m => `${m}:${a.edits[m]}ed/${Math.round(a.tokens[m])}tok`).join('  '));
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
  const have = new Set(out.posts.map(p => p.key));
  let added = 0;
  for (const [k, meta] of Object.entries(NEW)) {
    if (have.has(k)) { console.log(`  SKIP (present): ${k}`); continue; }
    const a = acc.get(k);
    if (!a) { console.log(`  SKIP (no transcripts): ${k}`); continue; }
    const models = {};
    for (const m of Object.keys(a.edits)) models[m] = { edits: a.edits[m], tokens: Math.round(a.tokens[m]) };
    const { te, tt } = totals(a);
    out.posts.push({ key: k, label: meta.label, href: meta.href, kind: meta.kind, first: ymd(a.first), last: ymd(a.last), edits: te, tokens: Math.round(tt), models, words: wordCount(meta.file || meta.href) });
    for (const m of Object.keys(models)) { const md = out.models.find(x => x.id === m); if (md) { md.posts += 1; md.edits += models[m].edits; } }
    added++;
  }

  // Codex owns the configured gpt-* rows in each tile. Replacing those rows from
  // the durable ledger makes reruns idempotent while leaving the add-only Claude
  // attribution untouched.
  const postByKey = new Map(out.posts.map(p => [p.key, p]));
  const topicByKey = new Map(GH.topics.map(t => [t.key, t]));
  for (const a of codexAcc.values()) {
    let post = postByKey.get(a.key);
    if (!post) {
      const meta = topicByKey.get(a.key);
      if (!meta || !meta.href || !['post', 'archived'].includes(meta.kind)) continue;
      post = {
        key: a.key,
        label: meta.label,
        href: meta.href,
        kind: meta.kind,
        first: a.first,
        last: a.last,
        edits: 0,
        tokens: 0,
        models: {},
        words: wordCount(meta.href),
      };
      out.posts.push(post);
      postByKey.set(a.key, post);
      added++;
    }
    post.models[a.model] = { edits: a.edits, tokens: Math.round(a.tokens) };
    if (a.first && a.first < post.first) post.first = a.first;
    if (a.last && a.last > post.last) post.last = a.last;
    post.edits = Object.values(post.models).reduce((n, m) => n + (m.edits || 0), 0);
    post.tokens = Object.values(post.models).reduce((n, m) => n + (m.tokens || 0), 0);
  }

  for (const [id, config] of Object.entries(CODEX_MODELS)) {
    let model = out.models.find(m => m.id === id);
    if (!model) {
      let fuel = { tokens: 0, cost: 0 };
      try { fuel = JSON.parse(readFileSync(join(REPO, 'tools/about-stats.json'), 'utf8')).models[id] || fuel; } catch {}
      model = { id, ...config, tokens: fuel.tokens, cost: Math.round(fuel.cost), posts: 0, edits: 0 };
      out.models.push(model);
    }
    Object.assign(model, config);
    delete model.note;
    const credited = out.posts.filter(p => p.models && p.models[id]);
    model.posts = credited.length;
    model.edits = credited.reduce((n, p) => n + p.models[id].edits, 0);
  }
  out.generated = Math.floor(Date.now() / 1000);
  const windowStart = (out.window.match(/\d{4}-\d{2}-\d{2}/) || ['2026-05-21'])[0];
  const windowEnd = out.posts.reduce((last, p) => p.last > last ? p.last : last, windowStart);
  out.window = windowStart + ' to ' + windowEnd;
  out.note = out.note
    .replace('derived from Claude Code session transcripts', 'derived from Claude Code and Codex session transcripts')
    .replace('Each Edit/Write op', 'Each Edit/Write or successful Codex patch op');

  const banner = readFileSync(join(REPO, 'js/git-attribution-data.js'), 'utf8').match(/^[\s\S]*?(?=window\.GIT_ATTRIBUTION)/)[0];
  writeFileSync(join(REPO, 'js/git-attribution-data.js'), banner + 'window.GIT_ATTRIBUTION = ' + JSON.stringify(out) + ';\n');
  writeFileSync(CODEX_LEDGER, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`\nWROTE js/git-attribution-data.js: +${added} tiles, ${out.posts.length} total. Verify on about.html, then commit.`);
}
