/* Keep the In Progress shelf newest first. Existing post dates stay intact;
   undated collections use the date their hub first entered Git history.
   Run after adding a card: node tools/sort-in-progress.mjs. */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'archive.html');
const html = readFileSync(file, 'utf8');
const listPattern = /<ul class="article-list">([\s\S]*?)<\/ul>/;
const inner = html.match(listPattern)?.[1];
if (!inner) throw new Error('In Progress list is missing');
const cards = inner.match(/<li class="article-list-item[\s\S]*?<\/li>/g) || [];
const dateOf = card => card.match(/datetime="([^"]+)"/)?.[1];
const dated = cards.map(card => {
  if (dateOf(card)) return card;
  const href = card.match(/href="([^"]+)"/)?.[1];
  if (!card.includes('is-collection') || !href) throw new Error(`Missing publication date: ${href}`);
  const history = execFileSync('git', ['log', '--follow', '--diff-filter=A', '--format=%aI', '--', href], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  const first = history.at(-1);
  if (!first) throw new Error(`Missing creation history: ${href}`);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(first));
  const part = key => parts.find(p => p.type === key).value;
  const date = `${part('year')}-${part('month')}-${part('day')}`;
  const display = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(first));
  return card.replace(/<span class="article-item-date">([^<]+)<\/span>/, `<time class="article-item-date" datetime="${date}">${display} &middot; $1</time>`);
});
dated.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
const output = dated.map((card, i) => `        ${card.replace(/loading="(?:eager|lazy)"/g, `loading="${i === 0 ? 'eager' : 'lazy'}"`)}`).join('\n\n');
writeFileSync(file, html.replace(listPattern, `<ul class="article-list">\n${output}\n      </ul>`));
console.log(`In Progress: ${dated.length} cards, newest first`);
