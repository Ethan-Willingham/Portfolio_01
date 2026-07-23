#!/usr/bin/env node
/* Strict consistency check for every generated dataset used by about.html.
   update-about.mjs and update-about-live.sh run this before anything is pushed. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd();
const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };
const today = new Date().toISOString().slice(0, 10);
const json = path => JSON.parse(readFileSync(join(REPO, path), 'utf8'));
const data = path => {
  const raw = readFileSync(join(REPO, path), 'utf8');
  const match = raw.match(/window\.[A-Z_]+\s*=\s*(\{[\s\S]*\})\s*;?\s*$/m);
  if (!match) throw new Error(`cannot parse ${path}`);
  return JSON.parse(match[1]);
};
const sum = values => values.reduce((a, b) => a + b, 0);
const daysOld = day => Math.floor((Date.now() - Date.parse(day + 'T12:00:00')) / 86400000);
const generatedDaysOld = ts => (Date.now() / 1000 - ts) / 86400;

const models = json('tools/about-models.json');
const stats = json('tools/about-stats.json');
const ledger = json('tools/about-attribution-ledger.json');
const attr = data('js/git-attribution-data.js');
const hist = data('js/git-history-data.js');
const size = data('js/site-size-data.js');
const about = readFileSync(join(REPO, 'about.html'), 'utf8');

check(models.version === 1, 'tools/about-models.json has an unsupported version');
check(daysOld(models.verified) <= models.maxVerificationAgeDays,
  `API prices were last verified ${models.verified}; recheck the official sources and update tools/about-models.json`);
check(/^https:\/\/platform\.claude\.com\//.test(models.sources.anthropic || ''), 'Anthropic pricing source is not an official platform.claude.com URL');
check(/^https:\/\/developers\.openai\.com\//.test(models.sources.openai || ''), 'OpenAI pricing source is not an official developers.openai.com URL');
for (const [id, model] of Object.entries(models.models)) {
  check(Array.isArray(model.prices) && model.prices.length > 0, `${id} has no price schedule`);
  const currentPrices = (model.prices || []).filter(p => p.from <= today && (!p.through || today <= p.through));
  check(currentPrices.length === 1, `${id} does not have exactly one price row for ${today}`);
  for (const p of model.prices || []) {
    check(p.from && Number.isFinite(p.input) && Number.isFinite(p.cacheWrite5m) && Number.isFinite(p.cacheRead) && Number.isFinite(p.output), `${id} has an incomplete price row`);
  }
}

check(stats.version === 2, 'tools/about-stats.json must use the durable v2 schema');
check(stats.methodology?.pricingVerified === models.verified, 'usage ledger and model registry disagree on the pricing verification date');
check(stats.legacy?.through && stats.days && stats.legacy?.models, 'usage ledger is missing its legacy baseline or daily records');
for (const [day, row] of Object.entries(stats.days || {})) {
  check(day > stats.legacy.through, `${day} overlaps the frozen legacy baseline`);
  const rows = Object.entries(row.models || {});
  check(row.totalTokens === sum(rows.map(([, m]) => m.totalTokens)), `${day} token total does not equal its model rows`);
  check(Math.abs(row.cost - sum(rows.map(([, m]) => m.cost))) < 1e-8, `${day} cost does not equal its model rows`);
  for (const [id, m] of rows) {
    check(Boolean(models.models[id]), `${day} contains unknown model ${id}`);
    check(m.totalTokens === sum([m.input, m.cacheWrite, m.cacheRead, m.output]), `${day} ${id} token categories do not sum`);
    check(m.totalTokens >= 0 && m.cost >= 0, `${day} ${id} has a negative value`);
  }
}
const dayRows = Object.values(stats.days || {});
const displayTokens = stats.legacy.tokens + sum(dayRows.map(d => d.totalTokens));
const displayCost = stats.legacy.cost + sum(dayRows.map(d => d.cost));
const displayPeak = Math.max(stats.legacy.peakTokens, ...dayRows.map(d => d.totalTokens));
const expectedStats = {
  tokens: (displayTokens / 1e9).toFixed(1) + 'B',
  peak: (displayPeak / 1e9).toFixed(2) + 'B',
  cost: '~$' + (Math.round(displayCost / 100) * 100).toLocaleString('en-US')
};
for (const [key, value] of Object.entries(expectedStats)) {
  const matches = [...about.matchAll(new RegExp(`<span class="n" data-about-stat="${key}">([^<]*)</span>`, 'g'))];
  check(matches.length === 1, `about.html must contain exactly one ${key} stat marker`);
  if (matches.length === 1) check(matches[0][1] === value, `about.html ${key} shows ${matches[0][1]}, expected ${value}`);
}
check((about.match(/<p data-about-freshness>/g) || []).length === 1, 'about.html must contain exactly one freshness marker');
const freshnessDate = new Date(stats.updated + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
check(about.includes(`<p data-about-freshness>Updated ${freshnessDate} `), 'about.html freshness date does not match the usage ledger');

check(ledger.version === 2 && ledger.residualsInitialized, 'attribution ledger migration is incomplete');
const ledgerText = JSON.stringify(ledger);
check(!/\/Users\/|\\\\Users\\\\/.test(ledgerText), 'attribution ledger contains a local path');
check(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(ledgerText), 'attribution ledger contains a raw session UUID');
for (const [id, session] of Object.entries(ledger.sessions || {})) {
  check(/^(claude|codex):[0-9a-f]{16}$/.test(id), `attribution session key is not a provider-prefixed hash: ${id}`);
  check(['claude', 'codex'].includes(session.provider), `${id} has an unknown provider`);
  for (const [model, posts] of Object.entries(session.models || {})) for (const [key, row] of Object.entries(posts)) {
    check(Boolean(models.models[model]), `${id} contains unknown model ${model}`);
    check(row.edits >= 0 && row.tokens >= 0, `${id} ${model}/${key} has a negative counter`);
  }
}

const attrModels = new Map(attr.models.map(m => [m.id, m]));
check(attrModels.size === attr.models.length, 'attribution model IDs are not unique');
for (const model of attr.models) {
  const config = models.models[model.id];
  check(Boolean(config?.showInAttribution), `attribution includes unregistered or hidden model ${model.id}`);
  if (config) check(model.label === config.label && model.short === config.short && model.color === config.color, `${model.id} display metadata differs from the model registry`);
}
const postKeys = new Set();
for (const post of attr.posts) {
  check(!postKeys.has(post.key), `duplicate attribution post key ${post.key}`);
  postKeys.add(post.key);
  check(Boolean(post.href) && existsSync(join(REPO, post.href)), `${post.key} points to a missing page: ${post.href}`);
  const rows = Object.values(post.models || {});
  check(post.edits === sum(rows.map(m => m.edits)), `${post.key} edit total does not equal its model rows`);
  check(post.tokens === sum(rows.map(m => m.tokens)), `${post.key} token total does not equal its model rows`);
  for (const id of Object.keys(post.models || {})) check(attrModels.has(id), `${post.key} uses model ${id}, which has no visible model definition`);
}
for (const model of attr.models) {
  const credited = attr.posts.filter(p => p.models?.[model.id]);
  check(model.posts === credited.length, `${model.id} post count is wrong`);
  check(model.edits === sum(credited.map(p => p.models[model.id].edits)), `${model.id} edit count is wrong`);
  const base = stats.legacy.models[model.id] || { tokens: 0, cost: 0 };
  const daily = dayRows.map(d => d.models?.[model.id]).filter(Boolean);
  check(model.tokens === Math.round(base.tokens + sum(daily.map(d => d.totalTokens))), `${model.id} fuel tokens disagree with the usage ledger`);
  check(model.cost === Math.round(base.cost + sum(daily.map(d => d.cost))), `${model.id} fuel cost disagrees with the usage ledger`);
}
check(generatedDaysOld(attr.generated) < 2, 'attribution data is more than two days old');

check(size.totalBytes === sum(size.categories.map(c => c.bytes)), 'site-size categories do not equal totalBytes');
check(size.series.at(-1)?.[1] === size.totalBytes, 'site-size latest series point does not equal totalBytes');
check(generatedDaysOld(size.generated) < 2, 'site-size data is more than two days old');

check(new Set(hist.topics.map(t => t.key)).size === hist.topics.length, 'git-history topic keys are not unique');
check(Array.isArray(hist.daily) && hist.daily.length > 0, 'git-history fuel line is missing');
check(hist.dailyMax >= Math.max(...hist.daily), 'git-history dailyMax is smaller than a daily token value');
for (const commit of hist.commits) {
  check(Number.isInteger(commit[5]) && commit[5] >= 0 && commit[5] < hist.topics.length, `commit ${commit[0]} has an invalid topic index`);
}
check(generatedDaysOld(hist.generated) < 2, 'git-history data is more than two days old');

if (errors.length) {
  console.error(`About data check failed (${errors.length}):`);
  for (const error of errors) console.error('  - ' + error);
  process.exit(1);
}
console.log(`About data check passed: ${attr.posts.length} attributed pages, ${hist.commits.length} commits, ${Object.keys(stats.days).length} durable usage day(s).`);
