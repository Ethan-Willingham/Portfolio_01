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
const TX_DIR = '/Users/ethan/.claude/projects/-Users-ethan-Portfolio-01';
const SRC_DIR = path.join(ROOT, 'research', 'prompts');
const OUT_JS = path.join(ROOT, 'js', 'post-prompts-data.js');

// Per-post config. `match` = path fragments that mark an edit as "building this post".
// Defaults from the slug cover most posts; add entries only when a post needs more.
const POSTS = {
  'the-other-side': {
    title: 'The Other Side', href: 'the-other-side.html',
    match: ['the-other-side.html', 'research/other-side/'],
  },
};

function cfg(slug) {
  const c = POSTS[slug] || {};
  return {
    slug,
    title: c.title || slug,
    href: c.href || slug + '.html',
    match: c.match || [slug + '.html', 'js/' + slug + '.js'],
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

// find sessions whose Edit/Write/MultiEdit touched one of the post's match fragments
function findSessions(match) {
  const hits = [];
  for (const f of fs.readdirSync(TX_DIR)) {
    if (!f.endsWith('.jsonl')) continue;
    const objs = readJsonl(path.join(TX_DIR, f));
    let firstTs = null;
    let edited = false;
    for (const o of objs) {
      const ts = o.timestamp ? Date.parse(o.timestamp) : null;
      if (ts && firstTs == null) firstTs = ts;
      const msg = o.message;
      if (msg && Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c && c.type === 'tool_use' && /^(Edit|Write|MultiEdit)$/i.test(c.name || '')) {
            const fp = (c.input && (c.input.file_path || c.input.path)) || '';
            if (match.some(m => fp.includes(m))) edited = true;
          }
        }
      }
    }
    if (edited) hits.push({ id: f.replace('.jsonl', ''), firstTs: firstTs || 0 });
  }
  hits.sort((a, b) => a.firstTs - b.firstTs);
  return hits.map(h => h.id);
}

function extractPrompts(sessionIds) {
  const seen = new Set();
  const rows = [];
  for (const id of sessionIds) {
    for (const o of readJsonl(path.join(TX_DIR, id + '.jsonl'))) {
      if (o.type !== 'user' || o.isMeta) continue;
      const text = textOf(o.message).trim();
      if (!isSubstantive(text)) continue;
      const key = text.slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ when: o.timestamp ? o.timestamp.slice(0, 16) : '', session: id, text });
    }
  }
  rows.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0));
  return rows;
}

function extract(slug, forceSession) {
  const c = cfg(slug);
  const sessions = forceSession ? [forceSession] : findSessions(c.match);
  if (!sessions.length) { console.error(`no editing sessions found for ${slug} (match: ${c.match.join(', ')})`); process.exit(1); }
  const raw = extractPrompts(sessions);
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
  console.log(`extracted ${raw.length} substantive prompts for ${slug} from ${sessions.length} session(s): ${sessions.join(', ')}`);
  console.log(`wrote ${path.relative(ROOT, dst)}: now CLEAN the prompts[] array (typos, profanity, public-safe), then --bundle`);
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
    if (!prompts.length) continue;
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
if (args[0] === '--extract' && args[1]) {
  const si = args.indexOf('--session');
  extract(args[1], si > -1 ? args[si + 1] : null);
} else if (args[0] === '--bundle') {
  bundle();
} else {
  console.log('usage:\n  node tools/build-post-prompts.mjs --extract <slug> [--session <id>]\n  node tools/build-post-prompts.mjs --bundle');
}
