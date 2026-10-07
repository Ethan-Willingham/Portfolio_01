#!/usr/bin/env node
// Publish only aggregate counters. Local logs, identifiers, paths and messages
// never enter the snapshot. Running this script normally does not write files.
//
// node tools/slop-usage.mjs
// node tools/slop-usage.mjs --thread <gallery-root-thread> --write
//
// The fixed boundary is the gallery creation request, after the discovery chat.
// Interrupted and resumed gallery turns count. Each native response counts once.
// A snapshot cannot include an unfinished response or hidden image inference.
import { createReadStream } from 'node:fs';
import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GALLERY_STARTED_AT = '2026-10-07T03:54:30.572Z';
const DEFAULT_DATA = fileURLToPath(new URL('../js/slop-data.js', import.meta.url));
const ACCOUNT_BEFORE = {
  usedPercent: 2,
  windowDurationMins: 10080,
  resetsAt: 1791950199,
  observedAt: '2026-10-07T04:00:03Z',
};
const COUNTERS = {
  input_tokens: 'inputTokens',
  cached_input_tokens: 'cachedInputTokens',
  cache_write_input_tokens: 'cacheWriteInputTokens',
  output_tokens: 'outputTokens',
  reasoning_output_tokens: 'reasoningOutputTokens',
};

function timestamp(value, label) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new Error(`Invalid ${label} timestamp.`);
  return date.toISOString();
}

async function jsonlFiles(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await jsonlFiles(file));
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(file);
  }
  return files.sort();
}

async function firstMetadata(file) {
  const stream = createReadStream(file, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { return null; }
      // Later metadata may be copied parent history, so only the first counts.
      return row.type === 'session_meta' ? row.payload : null;
    }
  } finally { lines.close(); stream.destroy(); }
  return null;
}

async function inventory(roots) {
  const files = [...new Set((await Promise.all(roots.map(jsonlFiles))).flat())];
  const threads = new Map();
  // Bound open file handles while inspecting only metadata from other chats.
  for (let offset = 0; offset < files.length; offset += 12) {
    const batch = files.slice(offset, offset + 12);
    const metas = await Promise.all(batch.map(firstMetadata));
    metas.forEach((meta, index) => {
      const id = meta?.id || meta?.session_id;
      if (!id) return;
      const origin = meta.source?.subagent?.thread_spawn;
      const parent = origin?.parent_thread_id || meta.parent_thread_id || null;
      if (!threads.has(id)) threads.set(id, { id, parent, createdAt: meta.timestamp, files: [] });
      const thread = threads.get(id);
      if (thread.parent !== parent) throw new Error('Conflicting local thread origin metadata.');
      thread.files.push({ file: batch[index], inheritedUntil: meta.subagent_history_start_ordinal || 0 });
    });
  }
  return threads;
}

function descendants(threads, rootId, since, cutoff) {
  if (!threads.has(rootId)) throw new Error('Gallery root thread was not found in local usage logs.');
  const selected = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const thread of threads.values()) {
      if (selected.has(thread.id) || !selected.has(thread.parent)) continue;
      const created = timestamp(thread.createdAt, 'child creation');
      if (created < since || created > cutoff) continue;
      selected.add(thread.id);
      changed = true;
    }
  }
  return [...selected].map(id => threads.get(id));
}

function emptyCounters() {
  return Object.fromEntries([...Object.values(COUNTERS), 'projectTokens'].map(key => [key, 0]));
}

function checkedUsage(raw) {
  if (!raw) throw new Error('A native response is missing its usage counters.');
  const result = emptyCounters();
  for (const [source, target] of Object.entries(COUNTERS)) {
    const value = raw[source] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid native usage counter.');
    result[target] = value;
  }
  result.projectTokens = result.inputTokens + result.outputTokens;
  if (!Number.isSafeInteger(result.projectTokens)
    || result.cachedInputTokens + result.cacheWriteInputTokens > result.inputTokens
    || result.reasoningOutputTokens > result.outputTokens
    || (raw.total_tokens !== undefined && raw.total_tokens !== result.projectTokens)) {
    throw new Error('Native usage categories do not add up.');
  }
  return result;
}

function addCounters(total, usage) {
  for (const key of Object.keys(total)) {
    total[key] += usage[key];
    if (!Number.isSafeInteger(total[key])) throw new Error('Aggregate usage exceeds a safe integer.');
  }
}

async function nativeResponses(thread, since, cutoff) {
  const contexts = new Map();
  const responses = [];
  for (const { file, inheritedUntil } of thread.files) {
    const source = await readFile(file, 'utf8');
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index++) {
      if (!lines[index].trim()) continue;
      let row;
      try { row = JSON.parse(lines[index]); }
      catch {
        // An active logger may have written only part of its final line.
        if (index === lines.length - 1 && !source.endsWith('\n')) break;
        throw new Error('Invalid local usage record; refusing an incomplete count.');
      }
      if ((row.ordinal ?? index) < inheritedUntil) continue;
      const payload = row.payload || {};
      if (row.type === 'turn_context' && payload.turn_id) {
        contexts.set(payload.turn_id, { model: payload.model || 'unknown', effort: payload.effort || payload.reasoning_effort || 'unknown' });
      }
      // Native per-response records are authoritative. The token_count events
      // and cumulative thread counters repeat them and must not be added again.
      if (row.type !== 'token_usage_record' || payload.thread_id !== thread.id) continue;
      const at = timestamp(row.timestamp, 'usage');
      if (at < since || at > cutoff) continue;
      if (!payload.response_id) throw new Error('A native response has no deduplication identifier.');
      responses.push({ id: payload.response_id, turn: payload.turn_id, at, usage: checkedUsage(payload.usage) });
    }
  }
  return responses.map(response => {
    const context = contexts.get(response.turn);
    if (!context) throw new Error('A native response has no model context.');
    return { ...response, ...context };
  });
}

function accountPoint(point) {
  if (!point) return null;
  if (!Number.isFinite(point.usedPercent) || point.usedPercent < 0 || point.usedPercent > 100
    || !Number.isSafeInteger(point.windowDurationMins) || point.windowDurationMins <= 0
    || !Number.isSafeInteger(point.resetsAt) || point.resetsAt <= 0) {
    throw new Error('Invalid account usage snapshot.');
  }
  // Explicit allowlist prevents account identifiers from reaching public data.
  return { usedPercent: point.usedPercent, windowDurationMins: point.windowDurationMins,
    resetsAt: point.resetsAt, observedAt: timestamp(point.observedAt, 'account observation') };
}

function accountUsage(previous, fallbackBefore = ACCOUNT_BEFORE) {
  const before = accountPoint(previous?.before || fallbackBefore);
  const after = accountPoint(previous?.after);
  const sameWindow = before && after && before.resetsAt === after.resetsAt
    && before.windowDurationMins === after.windowDurationMins
    && after.observedAt >= before.observedAt;
  const label = typeof previous?.label === 'string' ? previous.label.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  return {
    ...(label ? { label } : {}),
    before,
    after,
    deltaPercentagePoints: sameWindow ? Number((after.usedPercent - before.usedPercent).toFixed(6)) : null,
    note: 'Account-wide meter; includes other chats. Not a token counter.',
    windowNote: 'The first snapshot was taken before image generation, after some planning. A delta requires the same quota window.',
  };
}

function accountUsageHistory(history) {
  if (!Array.isArray(history) || history.some(interval => !interval || typeof interval !== 'object' || Array.isArray(interval))) {
    throw new Error('Account usage history must be an array of recorded intervals.');
  }
  // Apply the same field allowlist to history, without inventing a baseline.
  return history.map(interval => accountUsage(interval, null));
}

export async function buildProductionSnapshot({
  thread = process.env.CODEX_SESSION_ID || process.env.CODEX_THREAD_ID,
  since = GALLERY_STARTED_AT,
  asOf = new Date().toISOString(),
  roots = [join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions'),
    join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'archived_sessions')],
  previousProduction = {},
} = {}) {
  if (!thread) throw new Error('Run in the gallery chat or supply --thread with its root thread identifier.');
  since = timestamp(since, 'start');
  asOf = timestamp(asOf, 'snapshot');
  if (since > asOf) throw new Error('Snapshot precedes the gallery start.');
  const threads = descendants(await inventory(roots), thread, since, asOf);
  const totals = emptyCounters();
  const seen = new Map();
  const byModel = new Map();
  let measuredThrough = null;
  let threadsWithRecordedUsage = 0;
  for (const selected of threads) {
    const responses = await nativeResponses(selected, since, asOf);
    if (responses.length) threadsWithRecordedUsage++;
    for (const response of responses) {
      const signature = JSON.stringify([response.usage, response.model, response.effort]);
      if (seen.has(response.id)) {
        if (seen.get(response.id) !== signature) throw new Error('Conflicting counters for a repeated native response.');
        continue;
      }
      seen.set(response.id, signature);
      addCounters(totals, response.usage);
      const key = JSON.stringify([response.model, response.effort]);
      if (!byModel.has(key)) byModel.set(key, { model: response.model, effort: response.effort, responses: 0, ...emptyCounters() });
      const group = byModel.get(key);
      for (const counter of Object.keys(totals)) group[counter] += response.usage[counter];
      group.responses++;
      if (!measuredThrough || response.at > measuredThrough) measuredThrough = response.at;
    }
  }
  if (!seen.size) throw new Error('No gallery response usage was found in this time window.');
  const modelUsage = [...byModel.values()].sort((a, b) => a.model.localeCompare(b.model) || a.effort.localeCompare(b.effort));
  return {
    startedAt: since,
    asOf,
    measuredThrough,
    ...totals,
    complete: false,
    actualModels: [...new Set(modelUsage.map(row => row.model))],
    actualEfforts: [...new Set(modelUsage.map(row => row.effort))].sort(),
    modelUsage,
    coverage: { rootThreads: 1, childThreads: threads.length - 1, threadsWithRecordedUsage, responses: seen.size },
    imageInference: { inputTokens: null, outputTokens: null, totalTokens: null,
      note: 'The built-in image tool has not reported inference token usage. These tokens are excluded from the tracked total.' },
    imageCostUsd: null,
    usageNote: 'Recorded planning and coding tokens through this snapshot, including stopped attempts and child agents. Input includes cached context; output includes reasoning. Image inference is unreported, so this is not the complete production total. Unfinished responses appear in a later snapshot.',
    accountUsage: accountUsage(previousProduction.accountUsage),
    ...(previousProduction.accountUsageHistory === undefined ? {} : {
      accountUsageHistory: accountUsageHistory(previousProduction.accountUsageHistory),
    }),
  };
}

async function readCatalogue(file, required) {
  let source;
  try { source = await readFile(file, 'utf8'); }
  catch (error) { if (!required && error.code === 'ENOENT') return null; throw error; }
  const match = source.match(/\bwindow\.SLOP_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) throw new Error('Catalogue must contain a strict JSON window.SLOP_DATA assignment.');
  let data;
  try { data = JSON.parse(match[1]); }
  catch { throw new Error('Catalogue data is not valid JSON.'); }
  return { source, prefix: source.slice(0, match.index), data };
}

async function main() {
  const options = {};
  let dataFile = DEFAULT_DATA;
  let write = false;
  for (let index = 2; index < process.argv.length; index++) {
    const argument = process.argv[index];
    if (argument === '--write') { write = true; continue; }
    if (argument === '--help') {
      console.log('Usage: node tools/slop-usage.mjs [--thread ROOT] [--since ISO_DATE] [--as-of ISO_DATE] [--data FILE] [--write]\nPrints sanitized planning/coding usage by default. --write replaces catalogue production data.');
      return;
    }
    if (!['--thread', '--since', '--as-of', '--data'].includes(argument) || !process.argv[index + 1]) {
      throw new Error('Unrecognized or incomplete argument. Use --help.');
    }
    const value = process.argv[++index];
    if (argument === '--data') dataFile = resolve(value);
    else options[argument === '--as-of' ? 'asOf' : argument.slice(2)] = value;
  }
  const catalogue = await readCatalogue(dataFile, write);
  const production = await buildProductionSnapshot({ ...options, previousProduction: catalogue?.data.production });
  if (write) {
    if (await readFile(dataFile, 'utf8') !== catalogue.source) throw new Error('Catalogue changed during collection; run the command again.');
    catalogue.data.production = production;
    const temporary = join(dirname(dataFile), `.slop-usage-${process.pid}.tmp`);
    await writeFile(temporary, `${catalogue.prefix}window.SLOP_DATA = ${JSON.stringify(catalogue.data, null, 2)};\n`);
    await rename(temporary, dataFile);
  }
  console.log(JSON.stringify(production, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Filesystem exception messages can include private absolute paths.
    console.error(error.code ? 'Could not read or update local usage files.' : error.message);
    process.exitCode = 1;
  });
}
