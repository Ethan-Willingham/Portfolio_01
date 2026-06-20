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
     - each assistant message with an Edit/Write/MultiEdit tool_use is attributed
       to message.model + the post whose file it touched
     - edit-share  = count of ops
     - token-share = each turn's usage.output_tokens split across the (distinct)
       POST files it edited (shared files like style.css are not the denominator)
     - file -> post key via the git-history topic hrefs + js aliases; Sluice excluded

   *** ADD-ONLY ON PURPOSE ***  Transcripts get PRUNED over time, so re-deriving
   every post from scratch REGRESSES intact tiles (e.g. machine-to-atom dropped
   from 102 to 2 surviving edits). So this keeps every committed tile BYTE-FOR-BYTE
   and only APPENDS posts that have no tile yet. Run without --write first: the
   VALIDATION block must show EXACT (or close) for untouched posts, which proves
   the router/algorithm still matches before you trust the new numbers.

   A post built on ANOTHER machine/account has zero edits here and is correctly
   ABSENT (space-age, star-signs, remote-viewing). Do NOT fabricate a tile for it.
   Per-model fuel totals (models[].tokens/cost) are a blended two-machine ccusage
   snapshot this script does NOT recompute; it only bumps the post/edit counts.
   ============================================================================ */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const REPO = process.cwd();
const TX = join(homedir(), '.claude/projects/-Users-ethan-Portfolio-01');

const GH = JSON.parse(readFileSync(join(REPO, 'js/git-history-data.js'), 'utf8').match(/=\s*(\{[\s\S]*\});?\s*$/m)[1]);
const ATTR = JSON.parse(readFileSync(join(REPO, 'js/git-attribution-data.js'), 'utf8').match(/=\s*(\{[\s\S]*\});?\s*$/m)[1]);

// ============================================================================
// CONFIG — edit this when adding posts. Each NEW entry needs its file set (so the
// router catches every edit) and its tile metadata (label = the post's <h1>).
// Re-add the same entry on the next run is harmless: present tiles are skipped.
// ============================================================================
const NEW = {
  // 'my-post': { files: ['my-post.html', 'js/my-post.js'],
  //              label: 'My Post Title', href: 'my-post.html', kind: 'post' },
  // archived: href: 'archive/my-post/my-post.html', kind: 'archived'
};

// ---- file -> post-key router ----
const route = new Map();
for (const t of GH.topics) {
  if (t.href) { const slug = t.href.replace(/\.html$/, ''); route.set(t.href, t.key); route.set('js/' + slug + '.js', t.key); }
}
const ALIAS = {
  'js/globe.js': 'daylight-globe',
  'the-first-year.html': 'first-year', 'baby-research.html': 'first-year',
  'grand-motherload.html': 'sluice', 'js/grand-motherload.js': 'sluice',
  'js/liquid-wgpu.js': 'sluice', 'js/smoke-wgpu.js': 'sluice',
};
for (const [f, k] of Object.entries(ALIAS)) route.set(f, k);
for (const [k, m] of Object.entries(NEW)) for (const f of (m.files || [])) route.set(f, k);
const EXCLUDE = new Set(['sluice']);

const excludeSession = (process.argv.find(a => a.startsWith('--exclude-session=')) || '').split('=')[1] || '';

function relpath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/^.*\.claude\/worktrees\/[^/]+\//, '').replace(/^.*Portfolio_01\//, '');
}
function keyFor(rel) {
  if (!rel) return '';
  const am = rel.match(/^archive\/([^/]+)\//);
  if (am) return am[1];
  return route.get(rel) || '';
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

const ymd = ts => { const d = new Date(ts * 1000); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
const committed = new Map(ATTR.posts.map(p => [p.key, p]));
const totals = a => ({ te: Object.values(a.edits).reduce((x, y) => x + y, 0), tt: Object.values(a.tokens).reduce((x, y) => x + y, 0) });

const checkKeys = process.argv.slice(2).filter(a => !a.startsWith('--'));
const keys = checkKeys.length ? checkKeys : ['random-galaxy', 'particle-life', 'optional-body', 'all-in'];
console.log('transcripts:', TX, excludeSession ? `(excluding session ${excludeSession})` : '');
console.log('turns with edits:', turns, '| turns counted to a post:', editTurns);
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
  const banner = readFileSync(join(REPO, 'js/git-attribution-data.js'), 'utf8').match(/^[\s\S]*?(?=window\.GIT_ATTRIBUTION)/)[0];
  writeFileSync(join(REPO, 'js/git-attribution-data.js'), banner + 'window.GIT_ATTRIBUTION = ' + JSON.stringify(out) + ';\n');
  console.log(`\nWROTE js/git-attribution-data.js: +${added} tiles, ${out.posts.length} total. Verify on about.html, then commit.`);
}
