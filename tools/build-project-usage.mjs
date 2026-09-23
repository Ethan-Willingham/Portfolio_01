#!/usr/bin/env node
// Optional private audit of full request consumption, assigned once per task turn.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { jsonlFiles, codexDeltas, localDay } from './about-usage.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');
const vector = u => ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens'].map(k => u?.[k] || 0);
const pointKey = p => hash(p.timestamp + ':' + p.cumulative.join(','));
const loadData = f => JSON.parse(readFileSync(f, 'utf8').match(/window\.[A-Z_]+\s*=\s*(\{[\s\S]*\})\s*;?\s*$/m)[1]);
const rows = f => readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

export function makeRouter(posts) {
  const route = new Map();
  for (const p of posts) {
    route.set(p.href, p.key);
    route.set(basename(p.href), p.key);
    route.set('js/' + basename(p.href, '.html') + '.js', p.key);
  }
  for (const [path, key] of Object.entries({ 'js/globe.js': 'daylight-globe', 'baby-research.html': 'first-year' })) route.set(path, key);
  return path => {
    if (!path) return null;
    const rel = path.replace(/\\/g, '/');
    if (/(^|\/)(js\/sluice(\.js|\/)|grand-motherload\.(html|js)|js\/(liquid|smoke|jello)-wgpu\.js|js\/audio\.js|build-sluice\.sh|assets\/(shop|music|sfx)\/|docs\/game\/)/.test(rel)) return 'sluice';
    const parts = rel.split('/');
    for (let i = 0; i < parts.length; i++) if (route.has(parts.slice(i).join('/'))) return route.get(parts.slice(i).join('/'));
    return null;
  };
}

// Only actual tool file arguments and completed patches are routed. Injected
// AGENTS text, copied prompts and read output cannot turn every task into Sluice.
export function classifyTurn(turn, route) {
  const edited = (turn.writePaths || []).map(route).filter(Boolean);
  const keys = new Set((edited.length ? edited : turn.paths.map(route)).filter(Boolean));
  const site = /Portfolio[_-]01|portfolio-mach|pf-sapiens|sluice-alpha/i.test(turn.cwd);
  if (!site && !turn.paths.some(p => /Portfolio[_-]01|sluice-alpha/i.test(p))) return { bucket: 'other', basis: 'other workspace' };
  if (keys.size > 1) return { bucket: 'shared', projects: [...keys].sort(), basis: 'multiple page targets' };
  if (keys.size === 1) return { project: [...keys][0], basis: 'single page target in task turn' };
  if (/sluice-alpha/i.test(turn.cwd)) return { project: 'sluice', basis: 'dedicated game workspace' };
  // This is the actual user message, never session instructions or tool output.
  const request = (turn.prompt || '').split(/## My request(?: for Codex)?:/).at(-1);
  if (!/# AGENTS\.md|<INSTRUCTIONS>|<task-notification>/.test(request) && /\bsluice\b/i.test(request)) return { project: 'sluice', basis: 'explicit game task' };
  if (turn.paths.length && turn.paths.every(p => p.startsWith('/') && !/Portfolio[_-]01|sluice-alpha/i.test(p))) return { bucket: 'other', basis: 'external file targets' };
  if (turn.paths.length) return { bucket: 'shared', basis: 'site files without a page target' };
  return { bucket: 'unassigned', basis: 'no explicit page target' };
}

export function aggregateProjects(native, assignments, stats, cutoff) {
  const posts = {}, shared = {}, buckets = { shared: 0, other: 0, unassigned: 0, missing: 0 };
  let recovered = 0, historicalRecovered = 0, first = cutoff, last = '';
  const add = (id, u, tokens) => {
    if (!tokens || u.timestamp > cutoff) return;
    recovered += tokens;
    if (localDay(u.timestamp) <= stats.legacy.through) historicalRecovered += tokens;
    first = first < u.timestamp ? first : u.timestamp; last = last > u.timestamp ? last : u.timestamp;
    const a = assignments[id] || { bucket: 'unassigned' };
    if (!a.project) {
      buckets[a.bucket || 'unassigned'] += tokens;
      if (a.bucket === 'shared' && a.projects?.length > 1) {
        const key = a.projects.join('|');
        const group = shared[key] ||= { projects: a.projects, tokens: 0 };
        group.tokens += tokens;
      }
      return;
    }
    const p = posts[a.project] ||= { tokens: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, models: {}, first: u.timestamp, last: u.timestamp };
    p.tokens += tokens;
    for (const k of ['input', 'cacheWrite', 'cacheRead', 'output']) p[k] += u[k];
    p.models[u.model] = (p.models[u.model] || 0) + tokens;
    if (u.timestamp < p.first) p.first = u.timestamp;
    if (u.timestamp > p.last) p.last = u.timestamp;
  };
  for (const [id, u] of Object.entries(native.claude)) add('claude:' + id, u, u.input + u.cacheWrite + u.cacheRead + u.output);
  for (const [id, stream] of Object.entries(native.codex)) for (const p of codexDeltas(stream)) {
    const [input, cacheRead, cacheWrite, output] = p.usage;
    add('codex:' + id + ':' + pointKey(p), { ...p, input: input - cacheRead - cacheWrite, cacheWrite, cacheRead, output }, input + output);
  }
  const total = stats.legacy.tokens + Object.values(stats.days).reduce((n, d) => n + d.totalTokens, 0);
  buckets.missing = total - recovered;
  if (buckets.missing < 0 || historicalRecovered > stats.legacy.tokens) throw new Error('Recovered usage exceeds published baseline');
  return { version: 1, cutoff, total, recovered, historicalRecovered, first, last, posts, buckets, shared: Object.values(shared).sort((a,b) => b.tokens-a.tokens) };
}

export function buildProjectUsage({ write = false, imports = [], directory = join(homedir(), '.local/share/about-usage'), repo = process.cwd(), excludeSession = process.env.CODEX_THREAD_ID,
  codexRoots = [join(homedir(), '.codex/sessions'), join(homedir(), '.codex/archived_sessions')], claudeRoots = [join(homedir(), '.claude/projects')] } = {}) {
  const stats = JSON.parse(readFileSync(join(repo, 'tools/about-stats.json'), 'utf8'));
  const native = JSON.parse(readFileSync(join(directory, 'native-ledger.json'), 'utf8'));
  if (hash(native.id) !== stats.methodology.usageLedgerId) throw new Error('Private usage ledger identity mismatch');
  const cutoff = stats.collection.cutoff;
  const file = join(directory, 'project-ledger.json');
  const summaryFile = join(directory, 'project-summary.json');
  if (existsSync(summaryFile) && !existsSync(file)) throw new Error('Restore the private project ledger before refreshing the project audit');
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { version: 1, ledgerId: hash(native.id), assignments: {} };
  if (saved.version !== 1 || saved.ledgerId !== hash(native.id)) throw new Error('Private project ledger identity mismatch');
  const assignments = saved.assignments;
  const found = {};
  const attr = loadData(join(repo, 'js/git-attribution-data.js'));
  const route = makeRouter(attr.posts);
  const audit = [];
  const record = turn => {
    if (!turn?.ids.size) return;
    const a = classifyTurn(turn, route);
    for (const id of turn.ids) {
      // Copied Claude messages can occur in more than one transcript. Keep the
      // first established assignment; conflicting page targets become shared.
      if (assignments[id]?.basis === 'import classification') continue;
      const previous = found[id];
      if (previous?.project && a.project && previous.project !== a.project) found[id] = { bucket: 'shared', basis: 'conflicting task targets' };
      else if (previous?.basis !== 'conflicting task targets' && (!previous?.project || a.project)) found[id] = a;
    }
    audit.push({ ...a, cwd: turn.cwd, ids: [...turn.ids], paths: [...new Set(turn.paths)], writePaths: [...new Set(turn.writePaths || [])], prompt: turn.prompt?.slice(0, 700) });
  };
  for (const f of [...new Set(codexRoots.flatMap(jsonlFiles))]) {
    let session, boundary = 0, ordinal = 0, active = 'initial', cwd = '', turn;
    const turns = new Map();
    const get = id => { active = id || active; if (!turns.has(active)) turns.set(active, { cwd, paths: [], writePaths: [], ids: new Set() }); turn = turns.get(active); return turn; };
    for (const r of rows(f)) {
      const p = r.payload || {}, index = r.ordinal ?? ordinal++;
      if (r.type === 'session_meta') { if (!session) { session = p.id || p.session_id; boundary = p.subagent_history_start_ordinal || 0; cwd = p.cwd || ''; } continue; }
      if (!session || session === excludeSession || index < boundary || r.timestamp > cutoff) continue;
      if (r.type === 'turn_context') { cwd = p.cwd || cwd; get(p.turn_id).cwd = cwd; }
      if (r.type === 'event_msg' && p.type === 'task_started') get(p.turn_id);
      get();
      if (r.type === 'event_msg' && p.type === 'user_message') turn.prompt = p.message;
      if (r.type === 'event_msg' && p.type === 'item_completed') {
        const t = get(p.turn_id);
        if (p.item?.type === 'FileChange' && p.item.status === 'completed') t.writePaths.push(...Object.keys(p.item.changes || {}));
        if (p.item?.type === 'UserMessage') t.prompt = p.item.content?.filter(c => c.type === 'text').map(c => c.text).join('\n');
      }
      if (r.type === 'event_msg' && p.type === 'patch_apply_end' && p.success !== false) turn.writePaths.push(...Object.keys(p.changes || {}));
      if (r.type === 'response_item' && ['function_call', 'custom_tool_call'].includes(p.type)) {
        const code = p.input || p.arguments || '';
        // Explicit patch targets, including patches carried by the JS exec tool.
        const targets = [...code.matchAll(/\*\*\* (?:Add|Update|Delete) File: ([^\n\\]+)/g)];
        for (const m of targets) turn.writePaths.push(m[1].trim());
        // Paths in executed tool arguments provide fallback evidence for reviews,
        // shell rewrites and browser tests. They never read prompt history.
        if (!targets.length && /exec|shell|read_file/.test(p.name || '')) for (const m of code.matchAll(/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_-]+\.(?:html|js|mjs)\b/g)) turn.paths.push(m[0]);
      }
      if (r.type === 'event_msg' && p.type === 'token_count' && p.info?.total_token_usage) get(p.turn_id).ids.add('codex:' + hash(session) + ':' + pointKey({ timestamp: r.timestamp, cumulative: vector(p.info.total_token_usage) }));
    }
    for (const t of turns.values()) { t.paths.push(...t.writePaths); record(t); }
  }
  for (const f of [...new Set(claudeRoots.flatMap(jsonlFiles))]) {
    let turn = { cwd: '', paths: [], writePaths: [], ids: new Set() };
    for (const r of rows(f)) {
      if (r.timestamp > cutoff || r.sessionId === excludeSession) continue;
      const m = r.message, content = m?.content;
      const prompt = typeof content === 'string' ? content : Array.isArray(content) && !content.some(c => c.type === 'tool_result') ? content.filter(c => c.type === 'text').map(c => c.text).join('\n') : '';
      if (m?.role === 'user' && prompt && !r.isMeta && !r.isCompactSummary && !/^\s*<(task-notification|system-reminder|local-command)/.test(prompt)) {
        record(turn); turn = { cwd: r.cwd || turn.cwd, paths: [], writePaths: [], ids: new Set(), prompt };
      }
      turn.cwd = r.cwd || turn.cwd;
      if (m?.id && m.usage && m.model !== '<synthetic>') turn.ids.add('claude:' + hash(m.id));
      if (m?.role === 'assistant' && Array.isArray(content)) for (const c of content) {
        if (c.type === 'tool_use' && /^(Edit|Write|MultiEdit|Read)$/.test(c.name) && c.input?.file_path) {
          turn.paths.push(c.input.file_path);
          if (c.name !== 'Read') turn.writePaths.push(c.input.file_path);
        }
      }
    }
    record(turn);
  }
  Object.assign(assignments, found);
  for (const f of imports) for (const e of rows(f)) {
    if (!e.counters?.total_tokens || e.timestamp > cutoff) continue;
    const project = e.classification?.project;
    const a = project === 'sluice' ? { project: 'sluice' } : project === 'website-other' ? { bucket: 'shared' } : ['other-projects-and-personal', 'app-utility'].includes(project) ? { bucket: 'other' } : { bucket: 'unassigned' };
    a.basis = 'import classification';
    const id = e.provider === 'anthropic' ? 'claude:' + hash(e.message_id) : 'codex:' + hash(e.session_id) + ':' + pointKey({ timestamp: e.timestamp, cumulative: vector(e.raw_cumulative) });
    assignments[id] = a;
  }
  const result = aggregateProjects(native, assignments, stats, cutoff);
  for (const p of Object.values(result.posts)) { p.firstDay = localDay(p.first); p.lastDay = localDay(p.last); }
  const registry = JSON.parse(readFileSync(join(repo, 'tools/about-models.json'), 'utf8'));
  result.models = Object.fromEntries([...new Set(Object.values(result.posts).flatMap(p => Object.keys(p.models)))].map(id => [id, { label: registry.models[id]?.label || ({ 'gpt-5.5': 'GPT-5.5', 'gpt-5.4': 'GPT-5.4' })[id] || id, color: registry.models[id]?.color || 'var(--accent)' }]));
  if (write) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(file + '.tmp', JSON.stringify(saved) + '\n', { mode: 0o600 }); renameSync(file + '.tmp', file);
    writeFileSync(join(directory, 'project-audit.json'), JSON.stringify(audit, null, 2), { mode: 0o600 });
    writeFileSync(summaryFile, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = buildProjectUsage({ write: process.argv.includes('--write'), imports: process.argv.filter(a => a.startsWith('--import-usage=')).map(a => a.slice(15)) });
  console.log(JSON.stringify({ recovered: r.recovered, historicalRecovered: r.historicalRecovered, buckets: r.buckets, posts: Object.fromEntries(Object.entries(r.posts).sort((a,b) => b[1].tokens-a[1].tokens).map(([k,p]) => [k,p.tokens])) }, null, 2));
}
