#!/usr/bin/env node
/*
  build-post-prompts.mjs: the prompt archive behind each post's About-page tile.

  WHAT IT DOES
    For a post, it finds the Claude Code session(s) that actually EDITED that post's
    files (Edit/Write/MultiEdit tool calls on the post's html/js/research paths), pulls
    the human's substantive prompts from those sessions in time order, and writes a
    reviewable per-post file at  research/prompts/<slug>.json.

    That JSON has two arrays:
      raw[]    : extracted verbatim from the transcripts (refreshed on every --extract).
      prompts[]: the PUBLISHED text. Seeded from raw on first extract, then HAND-EDITED
                  (fix typos, drop profanity, keep it public-safe) and never clobbered.
                  The instruction content stays faithful on purpose: these prompts get
                  re-run against future models, so they must still mean what they meant.

    --bundle then stitches every research/prompts/*.json into js/post-prompts-data.js
    (window.POST_PROMPTS), which the About page loads to fill the tile tray.

  USAGE
    node tools/build-post-prompts.mjs --extract the-other-side      # refresh raw[], keep prompts[]
    node tools/build-post-prompts.mjs --extract the-other-side --session <id>   # force a session
    node tools/build-post-prompts.mjs --bundle                      # (re)write js/post-prompts-data.js

  ADDING A POST: give it an entry in POSTS below (or rely on the slug defaults), run
  --extract, clean research/prompts/<slug>.json's prompts[], then --bundle.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// This repo is worked on from several checkouts, each with its OWN transcript folder under
// ~/.claude/projects: the main checkout, its worktrees (-Users-ethan-Portfolio-01--claude-
// worktrees-*, and siblings), plus the old sluice-alpha checkout that held early site history
// before the 2026-06-19 consolidation. Scan them ALL (a single-dir scan badly undercounts a
// post's prompts). Excludes unrelated projects (AAStPaul, Documents-work, etc.).
const PROJECTS = path.join(process.env.HOME, '.claude', 'projects');
const TX_DIRS = fs.readdirSync(PROJECTS)
  .filter(d => d.includes('Portfolio-01') || d === '-Users-ethan-sluice-alpha')
  .map(d => path.join(PROJECTS, d))
  .filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
const SRC_DIR = path.join(ROOT, 'research', 'prompts');
const OUT_JS = path.join(ROOT, 'js', 'post-prompts-data.js');

// Pull each post's display label + href from the committed attribution data, so most
// posts need no hand-config below.
global.window = {};
await import('file://' + path.join(ROOT, 'js/git-attribution-data.js'));
const ATTR_BY_KEY = new Map(((global.window.GIT_ATTRIBUTION && global.window.GIT_ATTRIBUTION.posts) || []).map(p => [p.key, p]));

// Optional per-post overrides. `match` = path fragments that mark an edit as "building this
// post"; only add an entry when the slug defaults + attribution href are not enough.
const POSTS = {
  'the-other-side': { match: ['the-other-side.html', 'research/other-side/'] },
};

function cfg(slug) {
  const c = POSTS[slug] || {};
  const a = ATTR_BY_KEY.get(slug) || {};
  const href = c.href || a.href || (slug + '.html');
  const base = href.split('/').pop();
  return {
    slug,
    title: c.title || a.label || slug,
    href,
    match: c.match || [base, 'js/' + slug + '.js', '/' + slug + '/'],
  };
}

// ---- prompt cleaning / noise gate ----
const FILLER = new Set(['continue', 'continue.', 'go', 'go on', 'yes', 'yeah', 'yep', 'ok', 'okay', 'k', 'sure']);
function textOf(msg) {
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    if (msg.content.some(c => c && c.type === 'tool_result')) return '';
    return msg.content.filter(c => c && c.type === 'text').map(c => c.text).join('\n');
  }
  return '';
}
function isSubstantive(text) {
  const t = (text || '').trim();
  if (!t) return false;
  if (t.startsWith('<') && t.includes('system-reminder')) return false;
  if (t.includes('<command-name>') || t.includes('<command-message>') || t.includes('<command-args>')) return false;
  if (t.includes('<local-command-stdout>') || t.includes('<local-command-stderr>')) return false;
  if (t.includes('<task-notification')) return false; // background sub-agent completion notices, not human prompts
  if (t.includes('Request interrupted by user')) return false;
  if (FILLER.has(t.toLowerCase())) return false;
  return true;
}

function readJsonl(file) {
  const out = [];
  let data; try { data = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const line of data.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip partial */ }
  }
  return out;
}

// index every transcript ONCE (edits + substantive prompts per session); lazy so --bundle
// never pays for it. A batch of --extract calls then shares the single build.
let _INDEX = null;
function index() {
  if (_INDEX) return _INDEX;
  _INDEX = [];
  const files = TX_DIRS.flatMap(dir => fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => path.join(dir, f)));
  for (const full of files) {
    const edits = [], prompts = [];
    let firstTs = null;
    for (const o of readJsonl(full)) {
      const ts = o.timestamp ? Date.parse(o.timestamp) : null;
      if (ts && firstTs == null) firstTs = ts;
      const msg = o.message;
      if (msg && Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c && c.type === 'tool_use' && /^(Edit|Write|MultiEdit)$/i.test(c.name || '')) {
            const fp = (c.input && (c.input.file_path || c.input.path)) || '';
            if (fp) edits.push({ fp, ts });
          }
        }
      }
      if (o.type === 'user' && !o.isMeta) {
        const t = textOf(o.message).trim();
        if (isSubstantive(t)) prompts.push({ when: o.timestamp ? o.timestamp.slice(0, 16) : '', ts, text: t });
      }
    }
    _INDEX.push({ id: path.basename(full, '.jsonl'), firstTs: firstTs || 0, edits, prompts });
  }
  return _INDEX;
}

// sessions whose Edit/Write/MultiEdit touched one of the post's match fragments
function findSessions(match) {
  return index().filter(s => s.edits.some(e => match.some(m => e.fp.includes(m))))
    .sort((a, b) => a.firstTs - b.firstTs).map(s => s.id);
}

// every post's match fragments, so we can tell when a session ALSO built other posts
let _ALLM = null;
function allMatchers() {
  if (_ALLM) return _ALLM;
  _ALLM = [...ATTR_BY_KEY.values()].map(p => {
    const base = (p.href || (p.key + '.html')).split('/').pop();
    return { key: p.key, frags: [base, 'js/' + p.key + '.js', '/' + p.key + '/'] };
  });
  return _ALLM;
}

// Pull the human prompts for a post. A session DEDICATED to this post (edits no other post's
// files) contributes its whole prompt stream. A SHARED session (also built other posts)
// contributes only prompts within winMin before / 15 min after an edit to THIS post, so the
// neighbours it also built do not bleed in.
function extractPrompts(sessionIds, targetKey, match, winMin) {
  const byId = new Map(index().map(s => [s.id, s]));
  const others = allMatchers().filter(o => o.key !== targetKey);
  const win = (winMin || 45) * 60000, padA = 15 * 60000;
  const seen = new Set();
  const rows = [];
  for (const id of sessionIds) {
    const s = byId.get(id); if (!s) continue;
    const shared = others.some(o => s.edits.some(e => o.frags.some(fr => e.fp.includes(fr))));
    let lo = -Infinity, hi = Infinity;
    if (shared) {
      const ets = s.edits.filter(e => e.ts && match.some(m => e.fp.includes(m))).map(e => e.ts);
      if (!ets.length) continue;
      lo = Math.min(...ets) - win; hi = Math.max(...ets) + padA;
    }
    for (const p of s.prompts) {
      if (shared && (p.ts == null || p.ts < lo || p.ts > hi)) continue;
      const key = p.text.slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ when: p.when, session: id, text: p.text });
    }
  }
  rows.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));
  return rows;
}

function extract(slug, forceSession, winMin) {
  const c = cfg(slug);
  const sessions = forceSession ? [forceSession] : findSessions(c.match);
  if (!sessions.length) throw new Error(`no editing sessions found for ${slug} (match: ${c.match.join(', ')})`);
  const raw = extractPrompts(sessions, c.slug, c.match, winMin);
  const dst = path.join(SRC_DIR, slug + '.json');
  let prev = {};
  if (fs.existsSync(dst)) { try { prev = JSON.parse(fs.readFileSync(dst, 'utf8')); } catch {} }
  const doc = {
    slug: c.slug, title: c.title, href: c.href,
    sessions, extractedAt: new Date().toISOString().slice(0, 19) + 'Z',
    // prompts[] is the published, hand-cleaned copy. Seed from raw once, then keep edits.
    prompts: (prev.prompts && prev.prompts.length) ? prev.prompts : raw.map(r => ({ when: r.when, text: r.text })),
    raw,
  };
  fs.mkdirSync(SRC_DIR, { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(doc, null, 2) + '\n');
  console.log(`  ${slug.padEnd(26)} ${String(raw.length).padStart(3)} prompts  ${sessions.length} session(s)  ${sessions.map(s => s.slice(0, 8)).join(',')}`);
  return raw.length;
}

function extractMany(slugs, winMin) {
  console.log(`extracting ${slugs.length} posts (${winMin ? '±' + winMin + 'min window' : 'whole session'}):`);
  let total = 0;
  for (const s of slugs) { try { total += extract(s, null, winMin) || 0; } catch (e) { console.log(`  ${s.padEnd(26)} SKIP: ${e.message}`); } }
  console.log(`\ndone: ${total} prompts across ${slugs.length} posts. Now CLEAN each research/prompts/<slug>.json prompts[], then --bundle.`);
}

function bundle() {
  // Seed from the already-published bundle, so running this on a checkout that is
  // missing some (gitignored) research/prompts sources never wipes a live post.
  const data = {};
  if (fs.existsSync(OUT_JS)) {
    const m = fs.readFileSync(OUT_JS, 'utf8').match(/window\.POST_PROMPTS\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (m) { try { Object.assign(data, JSON.parse(m[1])); } catch {} }
  }
  if (!fs.existsSync(SRC_DIR)) { console.error('no research/prompts dir: nothing to (re)build'); process.exit(1); }
  const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json')).sort();
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8'));
    const prompts = (doc.prompts || []).filter(p => p && p.text && p.text.trim());
    // A source with hide:true or no prompts REMOVES the post from the bundle (used when the
    // surviving trail does not represent how the post was built). Overrides the live seed.
    if (doc.hide || !prompts.length) { delete data[doc.slug]; continue; }
    data[doc.slug] = {
      title: doc.title, href: doc.href, count: prompts.length,
      prompts: prompts.map(p => ({ when: p.when || '', text: p.text.trim() })),
    };
  }
  const header =
    '/* Per-post Claude prompt archive: the human prompts that built each post, shown in\n' +
    '   the About-page tile tray. Extracted from this machine\'s Claude Code session transcripts\n' +
    '   (sessions that edited the post\'s files), then hand-cleaned for typos/profanity/public\n' +
    '   safety while keeping the instructions faithful (they get re-run against future models).\n' +
    '   Source of truth: research/prompts/<slug>.json. Rebuild: node tools/build-post-prompts.mjs --bundle */\n';
  fs.writeFileSync(OUT_JS, header + 'window.POST_PROMPTS = ' + JSON.stringify(data) + ';\n');
  const total = Object.values(data).reduce((n, p) => n + p.count, 0);
  console.log(`wrote ${path.relative(ROOT, OUT_JS)}: ${Object.keys(data).length} post(s), ${total} prompts`);
}

const args = process.argv.slice(2);
const wi = args.indexOf('--window');
const winMin = wi > -1 ? parseInt(args[wi + 1], 10) : null; // e.g. --window 40  (multi-session posts)
if (args[0] === '--extract' && args[1]) {
  const si = args.indexOf('--session');
  try { extract(args[1], si > -1 ? args[si + 1] : null, winMin); }
  catch (e) { console.error(e.message); process.exit(1); }
} else if (args[0] === '--extract-list' && args[1]) {
  extractMany(args[1].split(',').map(s => s.trim()).filter(Boolean), winMin);
} else if (args[0] === '--bundle') {
  bundle();
} else {
  console.log('usage:\n  node tools/build-post-prompts.mjs --extract <slug> [--session <id>] [--window <min>]\n  node tools/build-post-prompts.mjs --extract-list <slug,slug,...> [--window <min>]\n  node tools/build-post-prompts.mjs --bundle');
}
