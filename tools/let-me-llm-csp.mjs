#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const defaultPage = fileURLToPath(new URL('../let-me-llm-that-for-you.html', import.meta.url));

export function inlineBlocks(html) {
  return [...html.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)]
    .filter(match => !/\bsrc\s*=/i.test(match[2]))
    .map(match => ({ type: match[1].toLowerCase(), text: match[3] }));
}

export function contentHash(text) {
  return "'sha256-" + createHash('sha256').update(text, 'utf8').digest('base64') + "'";
}

export function policyFor(html) {
  const blocks = inlineBlocks(html);
  const hashes = type => [...new Set(blocks.filter(block => block.type === type)
    .map(block => contentHash(block.text)))].join(' ');
  return "default-src 'none'; script-src " + hashes('script') +
    '; style-src ' + hashes('style') + "; img-src data:; base-uri 'none'; form-action 'none'";
}

export function readPolicy(html) {
  const tag = html.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0];
  if (!tag) throw new Error('Missing Content-Security-Policy meta tag');
  const policy = /\bcontent="([^"]*)"/i.exec(tag)?.[1];
  if (!policy) throw new Error('CSP content must use double quotes');
  return { tag, policy };
}

async function run() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const path = resolve(args.find(arg => arg !== '--check') || defaultPage);
  const html = await readFile(path, 'utf8');
  const { tag, policy } = readPolicy(html);
  const expected = policyFor(html);
  if (check && policy !== expected) throw new Error('CSP hashes are stale');
  if (!check && policy !== expected) {
    const replacement = tag.replace(/\bcontent="[^"]*"/i, () => `content="${expected}"`);
    await writeFile(path, html.replace(tag, () => replacement));
  }
  console.log(check ? 'CSP hashes match inline blocks' : 'CSP hashes updated');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
