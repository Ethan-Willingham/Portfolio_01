// Native usage counters. Private evidence stays outside the public checkout.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const hash = s => createHash('sha256').update(s).digest('hex');
const fields = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens'];
const vector = u => fields.map(k => u?.[k] || 0);
const total = u => u[0] + u[3]; // Cached input is already part of input; reasoning is part of output.
export const localDay = ts => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
export function jsonlFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? jsonlFiles(join(dir, e.name)) : e.name.endsWith('.jsonl') ? [join(dir, e.name)] : []);
}
async function* rows(file) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { throw new Error(`Invalid JSONL in ${file}`); }
    yield row;
  }
}
export function mergePoint(stream, point) {
  const key = hash(point.timestamp + ':' + point.cumulative.join(','));
  const old = stream[key];
  if (old && old.model !== point.model) throw new Error('Conflicting models for one Codex usage snapshot');
  stream[key] = old ? { ...old, initial: old.initial || point.initial } : point;
}
export function codexDeltas(stream) {
  const result = [];
  let previous = null;
  for (const point of Object.values(stream).sort((a, b) => a.timestamp.localeCompare(b.timestamp) || total(a.cumulative) - total(b.cumulative))) {
    const current = point.cumulative;
    if (previous && current.every((v, i) => v === previous[i])) continue;
    const reset = previous && total(current) < total(previous);
    const usage = previous && !reset ? current.map((v, i) => v - previous[i]) : point.initial || current;
    previous = current;
    if (!total(usage)) continue;
    if (usage.some(v => !Number.isSafeInteger(v) || v < 0) || usage[1] + usage[2] > usage[0] || usage[4] > usage[3]) throw new Error('Invalid Codex counter delta');
    // A missing intermediate snapshot can conceal multiple context lengths. Do not invent a price.
    if (point.last && total(point.last) !== total(usage)) throw new Error(`Missing per-response usage for ${point.model} at ${point.timestamp}`);
    result.push({ ...point, usage });
  }
  return result;
}
export function mergeClaude(messages, id, record) {
  const key = hash(id);
  const old = messages[key];
  if (old && old.model !== record.model) throw new Error('Conflicting models for one Claude message');
  if (old && old.request && record.request && old.request !== record.request) throw new Error('Conflicting request IDs for one Claude message');
  if (!old || record.output > old.output || (record.output === old.output && record.cacheWrite + record.cacheRead + record.input > old.cacheWrite + old.cacheRead + old.input)) {
    messages[key] = { ...record, timestamp: old && old.timestamp < record.timestamp ? old.timestamp : record.timestamp, request: record.request || old?.request };
  }
}
function claudeRecord(model, timestamp, u, request) {
  return { model, timestamp, request: request ? hash(request) : null, input: u.input_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0, cacheWrite1h: u.cache_creation?.ephemeral_1h_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0, output: u.output_tokens || 0 };
}
export function priceUsage(registry, id, day, u) {
  const rates = registry.models[id]?.prices.filter(p => p.from <= day && (!p.through || day <= p.through)) || [];
  if (rates.length !== 1) throw new Error(`No verified price for ${id} on ${day}`);
  const p = rates[0];
  const long = Boolean(p.longContext && u.input + u.cacheRead + u.cacheWrite > p.longContext.aboveInputTokens);
  const inputMult = long ? p.longContext.inputMultiplier : 1;
  const outputMult = long ? p.longContext.outputMultiplier : 1;
  return ((u.input * p.input + u.cacheRead * p.cacheRead + (u.cacheWrite - u.cacheWrite1h) * p.cacheWrite5m + u.cacheWrite1h * (p.cacheWrite1h || p.cacheWrite5m)) * inputMult + u.output * p.output * outputMult) / 1e6;
}
export function aggregateUsage(ledger, registry, through, cutoff) {
  const days = {};
  const add = u => {
    if (u.timestamp > cutoff) return;
    const day = localDay(u.timestamp);
    if (day <= through) return;
    const tokens = u.input + u.cacheWrite + u.cacheRead + u.output;
    if (!tokens) return;
    const cost = priceUsage(registry, u.model, day, u);
    const d = days[day] ||= { totalTokens: 0, cost: 0, models: {} };
    const m = d.models[u.model] ||= { input: 0, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0, output: 0, totalTokens: 0, cost: 0, pricing: 'deduplicated native responses, standard API rates' };
    for (const k of ['input', 'cacheWrite', 'cacheWrite1h', 'cacheRead', 'output']) m[k] += u[k];
    m.requests = (m.requests || 0) + 1;
    m.longContext ||= { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
    const rate = registry.models[u.model].prices.find(p => p.from <= day && (!p.through || day <= p.through));
    if (rate.longContext && u.input + u.cacheWrite + u.cacheRead > rate.longContext.aboveInputTokens) {
      for (const k of Object.keys(m.longContext)) m.longContext[k] += u[k];
    }
    m.totalTokens += tokens; m.cost += cost; d.totalTokens += tokens; d.cost += cost;
  };
  for (const record of Object.values(ledger.claude)) add(record);
  for (const stream of Object.values(ledger.codex)) for (const p of codexDeltas(stream)) {
    const [input, cached, writes, output] = p.usage;
    add({ timestamp: p.timestamp, model: p.model, input: input - cached - writes, cacheRead: cached, cacheWrite: writes, cacheWrite1h: 0, output });
  }
  return Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b)));
}
export async function collectUsage({ registry, stats, write = false, imports = [], cutoff = new Date().toISOString(), privateFile = join(homedir(), '.local/share/about-usage/native-ledger.json'), codexRoots = [join(homedir(), '.codex/sessions'), join(homedir(), '.codex/archived_sessions')], claudeRoots = [join(homedir(), '.claude/projects')], excludeSession = process.env.CODEX_THREAD_ID }) {
  let ledger = existsSync(privateFile) ? JSON.parse(readFileSync(privateFile, 'utf8')) : { version: 1, id: randomUUID(), codex: {}, claude: {}, imports: {} };
  if (ledger.version !== 1) throw new Error('Unsupported private usage ledger');
  if (stats.methodology.usageLedgerId && stats.methodology.usageLedgerId !== hash(ledger.id)) throw new Error('Restore the private native usage ledger before refreshing this published dataset');
  let files = 0, duplicates = 0;
  for (const file of [...new Set(codexRoots.flatMap(jsonlFiles))]) {
    let session, inheritedUntil = 0, ordinal = 0, model, activeTurn;
    const models = new Map();
    for await (const row of rows(file)) {
      const p = row.payload || {};
      const index = row.ordinal ?? ordinal++;
      if (row.type === 'session_meta') {
        if (!session) { session = p.id || p.session_id; inheritedUntil = p.subagent_history_start_ordinal || 0; }
        continue; // Later session_meta records can belong to copied parent history.
      }
      if (!session || session === excludeSession || index < inheritedUntil || row.timestamp > cutoff) continue;
      if (row.type === 'turn_context') { model = p.model; models.set(p.turn_id, p.model); }
      if (row.type === 'event_msg' && p.type === 'task_started') activeTurn = p.turn_id;
      if (row.type !== 'event_msg' || p.type !== 'token_count' || !p.info?.total_token_usage) continue;
      const loggedModel = models.get(p.turn_id || activeTurn) || model;
      if (!loggedModel) throw new Error('Codex usage has no model context');
      const stream = ledger.codex[hash(session)] ||= {};
      const before = Object.keys(stream).length;
      mergePoint(stream, { timestamp: row.timestamp, model: loggedModel, cumulative: vector(p.info.total_token_usage), last: p.info.last_token_usage ? vector(p.info.last_token_usage) : null });
      if (Object.keys(stream).length === before) duplicates++;
    }
    files++;
  }
  for (const file of [...new Set(claudeRoots.flatMap(jsonlFiles))]) {
    for await (const row of rows(file)) {
      const m = row.message;
      if (!m?.usage || !m.id || !m.model || m.model === '<synthetic>' || row.timestamp > cutoff || row.sessionId === excludeSession) continue;
      mergeClaude(ledger.claude, m.id, claudeRecord(m.model, row.timestamp, m.usage, row.requestId));
    }
    files++;
  }
  for (const file of imports) {
    const sourceHash = hash(readFileSync(file));
    let tokens = 0, events = 0, first, last;
    for await (const e of rows(file)) {
      if (e.nonbillable_placeholder || !e.counters?.total_tokens) continue;
      if (e.timestamp > cutoff) throw new Error('Import contains usage beyond the frozen cutoff');
      const c = e.counters;
      if (c.input_tokens !== c.uncached_input_tokens + c.cached_input_tokens + c.cache_write_input_tokens || c.total_tokens !== c.input_tokens + c.output_tokens) throw new Error('Imported token categories do not sum');
      tokens += e.counters.total_tokens; events++;
      first = !first || e.timestamp < first ? e.timestamp : first;
      last = !last || e.timestamp > last ? e.timestamp : last;
      if (e.provider === 'anthropic') {
        mergeClaude(ledger.claude, e.message_id, claudeRecord(e.model, e.timestamp, e.raw_usage, e.request_id));
      } else if (e.provider === 'openai' && e.raw_cumulative) {
        mergePoint(ledger.codex[hash(e.session_id)] ||= {}, { timestamp: e.timestamp, model: e.model, cumulative: vector(e.raw_cumulative), last: vector(e.raw_usage), initial: vector(e.counters) });
      } else throw new Error('Unsupported usage import record');
    }
    ledger.imports[sourceHash] = { tokens, events, first, last };
  }
  // Some native snapshots retain a stale duration breakdown after reporting zero writes.
  // The top-level write counter is authoritative; never price negative five-minute writes.
  for (const message of Object.values(ledger.claude)) if (message.cacheWrite1h > message.cacheWrite) {
    message.reportedCacheWrite1h = message.cacheWrite1h;
    message.cacheWrite1h = message.cacheWrite;
  }
  const days = aggregateUsage(ledger, registry, stats.legacy.through, cutoff);
  // Preserve the one-time pre-native snapshot only where the surviving logs cannot recover it.
  const retainedDays = stats.retainedDays || stats.days;
  const retained = [];
  for (const [day, d] of Object.entries(retainedDays)) for (const [id, old] of Object.entries(d.models)) {
    const fresh = days[day]?.models[id];
    if (fresh && fresh.totalTokens >= old.totalTokens) continue;
    const row = days[day] ||= { totalTokens: 0, cost: 0, models: {} };
    row.models[id] = old;
    row.totalTokens += old.totalTokens - (fresh?.totalTokens || 0);
    row.cost += old.cost - (fresh?.cost || 0);
    retained.push({ day, model: id, tokens: old.totalTokens });
  }
  if (write) {
    mkdirSync(dirname(privateFile), { recursive: true, mode: 0o700 });
    const temp = privateFile + '.tmp';
    writeFileSync(temp, JSON.stringify(ledger) + '\n', { mode: 0o600 });
    renameSync(temp, privateFile);
  }
  return { days: Object.fromEntries(Object.entries(days).sort(([a], [b]) => a.localeCompare(b))), retainedDays, evidence: { ledgerId: hash(ledger.id), cutoff, timezone: 'America/Chicago', files, claudeMessages: Object.keys(ledger.claude).length, codexSessions: Object.keys(ledger.codex).length, cacheDurationInconsistencies: Object.values(ledger.claude).filter(m => m.reportedCacheWrite1h !== undefined).length, imports: ledger.imports, retained }, duplicates };
}
