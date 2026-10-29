// Keep the canonical private ledger intact when another computer refreshes About.
// Only aggregate counters and a content hash of the private transfer report are public.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { aggregateUsage, collectUsage } from './about-usage.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const categories = ['input', 'cacheWrite', 'cacheWrite1h', 'cacheRead', 'output'];
const contextCategories = ['input', 'cacheWrite', 'cacheRead', 'output'];
const sum = values => values.reduce((a, b) => a + b, 0);

function checkedNumber(value, label, integer = true) {
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`Invalid ${label} in usage totals`);
  }
  return value;
}

function checkedDays(days) {
  for (const [day, row] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !row.models) throw new Error('Invalid usage day');
    for (const [model, usage] of Object.entries(row.models)) {
      for (const key of categories) checkedNumber(usage[key] || 0, `${model} ${key}`);
      checkedNumber(usage.totalTokens, `${model} total`);
      checkedNumber(usage.cost, `${model} cost`, false);
      if (usage.totalTokens !== sum(['input', 'cacheWrite', 'cacheRead', 'output'].map(key => usage[key] || 0))) {
        throw new Error('Usage token categories do not sum');
      }
      if ((usage.cacheWrite1h || 0) > (usage.cacheWrite || 0)) throw new Error('One-hour writes exceed cache writes');
      if (usage.requests !== undefined) checkedNumber(usage.requests, `${model} requests`);
      if (usage.longContext) for (const key of contextCategories) {
        const value = checkedNumber(usage.longContext[key] || 0, `${model} long-context ${key}`);
        if (value > (usage[key] || 0)) throw new Error('Long-context usage exceeds its category');
      }
    }
    checkedNumber(row.totalTokens, 'daily total');
    checkedNumber(row.cost, 'daily cost', false);
    if (row.totalTokens !== sum(Object.values(row.models).map(usage => usage.totalTokens))) throw new Error('Daily token total does not sum');
    if (Math.abs(row.cost - sum(Object.values(row.models).map(usage => usage.cost))) > 1e-7) throw new Error('Daily cost does not sum');
  }
}

export function addUsageDays(...sources) {
  const result = {};
  for (const days of sources) {
    checkedDays(days);
    for (const [day, row] of Object.entries(days)) {
      const target = result[day] ||= { totalTokens: 0, cost: 0, models: {} };
      for (const [model, usage] of Object.entries(row.models)) {
        const combined = target.models[model] ||= {
          input: 0, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 0, output: 0,
          totalTokens: 0, cost: 0, pricing: 'deduplicated native responses, standard API rates'
        };
        for (const key of [...categories, 'totalTokens', 'cost']) combined[key] += usage[key] || 0;
        if (usage.requests !== undefined) combined.requests = (combined.requests || 0) + usage.requests;
        if (usage.longContext) {
          combined.longContext ||= Object.fromEntries(contextCategories.map(key => [key, 0]));
          for (const key of contextCategories) combined.longContext[key] += usage.longContext[key] || 0;
        }
      }
      target.totalTokens += row.totalTokens;
      target.cost += row.cost;
    }
  }
  checkedDays(result);
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function writePrivate(file, text) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.tmp';
  writeFileSync(temporary, text, { mode: 0o600 });
  renameSync(temporary, file);
}

function checkedSupplement(stats) {
  const supplement = stats.supplement;
  if (!supplement) {
    if (stats.nativeDays) throw new Error('Canonical usage days have no matching supplement');
    return null;
  }
  if (supplement.version !== 1 || !stats.nativeDays
    || !/^[a-f0-9]{64}$/.test(supplement.ledgerId || '')
    || !/^[a-f0-9]{64}$/.test(supplement.reportHash || '')
    || supplement.after !== stats.collection?.cutoff
    || !Number.isFinite(Date.parse(supplement.cutoff))
    || supplement.cutoff < supplement.after) throw new Error('Invalid published usage supplement');
  checkedDays(supplement.days);
  return supplement;
}

export async function collectPublishedUsage(options) {
  const { stats, write = false, registry, cutoff = new Date().toISOString(), ledgerImports = [],
    privateFile = join(homedir(), '.local/share/about-usage/native-ledger.json'),
    localPrivateFile = join(homedir(), '.local/share/about-usage/local-ledger.json'),
    localExportFile = join(homedir(), '.local/share/about-usage/local-usage-export.json') } = options;
  const supplement = checkedSupplement(stats);
  const expectedCanonical = stats.methodology?.usageLedgerId;
  const canonicalExists = existsSync(privateFile);
  if (canonicalExists && expectedCanonical) {
    const canonical = JSON.parse(readFileSync(privateFile, 'utf8'));
    if (hash(canonical.id) !== expectedCanonical) throw new Error('Restore the matching canonical private usage ledger before refreshing');
  }

  if (canonicalExists || !expectedCanonical) {
    if (supplement) {
      const exactReport = ledgerImports.find(file => hash(readFileSync(file)) === supplement.reportHash);
      if (!exactReport) throw new Error('Import the exact private desktop usage report before refreshing the canonical ledger; its published supplement is still pending');
      const imported = JSON.parse(readFileSync(exactReport, 'utf8'));
      if (hash(imported.id) !== supplement.ledgerId) throw new Error('The desktop report has a different private ledger identity');
    }
    const canonicalStats = { ...stats, days: stats.nativeDays || stats.days,
      retainedDays: stats.retainedDays || stats.nativeDays || stats.days };
    const collected = await collectUsage({ ...options, stats: canonicalStats, cutoff, privateFile, ledgerImports });
    const { ledger, ...publicResult } = collected;
    return { ...publicResult, nativeDays: undefined, supplement: undefined };
  }

  const after = stats.collection?.cutoff;
  if (!after || !Number.isFinite(Date.parse(after)) || !Number.isFinite(Date.parse(cutoff)) || cutoff < after) {
    throw new Error('A desktop refresh needs the original canonical collection cutoff');
  }
  if (supplement) {
    if (!existsSync(localPrivateFile)) throw new Error('Restore the private desktop ledger before replacing its published usage supplement');
    const local = JSON.parse(readFileSync(localPrivateFile, 'utf8'));
    if (hash(local.id) !== supplement.ledgerId) throw new Error('This usage supplement belongs to a different computer; import it into the canonical ledger first');
  }
  const localStats = { ...stats, methodology: {}, days: {}, retainedDays: {} };
  const collected = await collectUsage({ ...options, stats: localStats, privateFile: localPrivateFile, cutoff, after, ledgerImports });
  if (!collected.ledger) throw new Error('The native collector did not return its private ledger');
  const localDays = aggregateUsage(collected.ledger, registry, stats.legacy.through, cutoff, after);
  const nativeDays = stats.nativeDays || stats.days;
  const days = addUsageDays(nativeDays, localDays);
  const reportText = JSON.stringify(collected.ledger) + '\n';
  const reportHash = hash(reportText);
  // Keep each published report available even if a later refresh or push fails.
  const reportName = basename(localExportFile).replace(/\.json$/, '') + '-' + reportHash + '.json';
  const localReportPath = join(dirname(localExportFile), reportName);
  if (write) {
    if (!existsSync(localReportPath)) writePrivate(localReportPath, reportText);
    writePrivate(localExportFile, reportText);
  }
  const nextSupplement = {
    version: 1, ledgerId: collected.evidence.ledgerId, reportHash, after, cutoff,
    totalTokens: sum(Object.values(localDays).map(row => row.totalTokens)),
    cost: sum(Object.values(localDays).map(row => row.cost)),
    days: localDays, collection: collected.evidence
  };
  return { days, nativeDays, retainedDays: stats.retainedDays || nativeDays,
    evidence: stats.collection, supplement: nextSupplement,
    duplicates: collected.duplicates, localReportPath };
}
