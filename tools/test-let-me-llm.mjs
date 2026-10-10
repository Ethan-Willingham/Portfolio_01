#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { inlineBlocks, policyFor, readPolicy } from './let-me-llm-csp.mjs';

const defaultPage = fileURLToPath(new URL('../let-me-llm-that-for-you.html', import.meta.url));
const pagePath = resolve(process.argv[2] || defaultPage);
const html = await readFile(pagePath, 'utf8');
const source = /<script\b[^>]*\bid="core"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
assert.ok(source, 'The real page must contain <script id="core">');
const context = createContext({ TextEncoder, TextDecoder, btoa, atob });
runInContext(source, context, { timeout: 1000, filename: pagePath });
const api = context.LMLTFY;
assert.ok(api, 'The core block must export globalThis.LMLTFY');
assert.equal(api.CAP, 600);
assert.deepEqual(Object.keys(api).sort(), ['CAP', 'decode', 'destination', 'encode',
  'graphemes', 'hash', 'minJerk', 'plan', 'rng', 'sanitize']);

let assertions = 0;
function check(name, body) {
  body();
  assertions += 1;
  console.log(`PASS ${name}`);
}

function rawPayload(question, overrides = {}) {
  const length = overrides.length ?? new TextEncoder().encode(question).length;
  const text = `${overrides.version ?? 'v1'}|${overrides.ai ?? 'chatgpt'}|${length}|${question}`;
  return Buffer.from(text, 'utf8').toString('base64url');
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

check('UTF-8 round trips and the stable v1 format', () => {
  const questions = ['How do planes fly?', '\u{1F469}\u{200D}\u{1F4BB}',
    '\u{1F1FA}\u{1F1F8}', '\u{4E2D}\u{6587}',
    '\u{645}\u{631}\u{62D}\u{628}\u{627}', 'first\nsecond',
    'a | b | c', 'x'.repeat(api.CAP), '\u{4E2D}'.repeat(api.CAP / 3)];
  for (const question of questions) {
    const encoded = api.encode(question);
    assert.match(encoded, /^[A-Za-z0-9_-]+$/);
    assert.equal(encoded, rawPayload(question));
    assert.equal(api.decode(encoded), question);
    assert.equal(api.encode(api.decode(encoded)), encoded);
  }
  assert.equal(api.encode('a'), 'djF8Y2hhdGdwdHwxfGE');
  assert.equal(api.decode(rawPayload('')), '');
});

check('Every malformed payload is rejected', () => {
  const valid = api.encode('hello');
  const malformed = ['', '#'+valid, '?q=hello', 'q=hello', '!', 'a',
    valid+'=', valid.slice(0, -2), rawPayload('hello', { version: 'v2' }),
    rawPayload('hello', { ai: 'claude' }), rawPayload('hello', { length: 4 }),
    rawPayload('hello', { length: '05' }), rawPayload('hello', { length: '-5' }),
    rawPayload('hello', { length: 'NaN' }), rawPayload('x'.repeat(601)),
    rawPayload('x'.repeat(10000)), Buffer.from('v1|chatgpt|5', 'utf8').toString('base64url'),
    Buffer.concat([Buffer.from('v1|chatgpt|2|'), Buffer.from([0xC3, 0x28])]).toString('base64url'),
    null, undefined, 42, {}, []];
  for (const payload of malformed) assert.throws(() => api.decode(payload));
  assert.throws(() => api.encode('x'.repeat(601)));
  assert.throws(() => api.encode('\u{4E2D}'.repeat(201)));
});

check('Canonical base64url rejects altered trailing bits', () => {
  const payload = api.encode('a');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = alphabet.indexOf(payload.at(-1));
  const changed = payload.slice(0, -1) + alphabet[last + 1];
  assert.throws(() => api.decode(changed));
});

check('Sanitization removes hidden text and preserves the displayed question', () => {
  assert.equal(api.sanitize(' e\u{301} '), '\u{E9}');
  assert.equal(api.sanitize('a\u{0}\u{1}\u{7F}\rb\n\tc'), 'ab\n\tc');
  assert.equal(api.sanitize('a\u{202E}b\u{202C}\u{2066}c\u{2069}'), 'abc');
  assert.equal(api.sanitize('a\u{200B}\u{200E}\u{2060}\u{FEFF}b'), 'ab');
  assert.equal(api.sanitize('a\u{200C}b\u{200D}c'), 'a\u{200C}b\u{200D}c');
  assert.equal(api.sanitize('\u{1F3F4}\u{E0067}\u{E0062}\u{E007F}'), '\u{1F3F4}');
  assert.equal(api.sanitize('a\u{FE0F}\u{FE0F}\u{FE0E}\u{E0100}'), 'a\u{FE0F}');
  assert.equal(api.sanitize('a\u{FE00}\u{FE0E}'), 'a\u{FE0E}');
  assert.equal(api.sanitize('x\uD800y\uDC00'), 'xy');
  const capped = api.sanitize('a' + '\u{301}'.repeat(30));
  assert.ok(api.graphemes(capped).every(part => Array.from(part).length <= 12));
  assert.equal(api.sanitize(capped), capped);
  const raw = '  hello\u{202E}\u{E0041}\u{FE0F}\u{FE0F}\nworld  ';
  const decoded = api.decode(rawPayload(raw));
  assert.equal(decoded, api.sanitize(raw));
  assert.equal(new URL(api.destination(decoded)).searchParams.get('q'), decoded);
  assert.equal(api.plan(decoded).graphemes.join(''), decoded);
});

check('The destination is fixed and percent encoding is exact', () => {
  const expected = new Map([['&', '%26'], ['#', '%23'], ['+', '%2B'], ['%', '%25'],
    ['?', '%3F'], ['two words', 'two%20words'], ['first\nsecond', 'first%0Asecond'],
    ['\u{1F600}', '%F0%9F%98%80'], ['a&b#c+d%?', 'a%26b%23c%2Bd%25%3F']]);
  for (const [question, suffix] of expected) {
    assert.equal(api.destination(question), 'https://chatgpt.com/?q=' + suffix);
  }
  const attack = 'javascript:alert(1) <script>alert(1)</script> https://evil.invalid/?q=steal';
  const url = new URL(api.destination(api.decode(api.encode(attack))));
  assert.equal(url.origin, 'https://chatgpt.com');
  assert.equal(url.pathname, '/');
  assert.deepEqual([...url.searchParams.keys()], ['q']);
  assert.equal(url.searchParams.get('q'), attack);
});

check('Typing never splits extended graphemes', () => {
  const question = '\u{1F469}\u{200D}\u{1F4BB}\u{1F1FA}\u{1F1F8}e\u{301}' +
    '\u{915}\u{93F}\u{D55C}\u{AE00}';
  const clean = api.sanitize(question);
  const expected = ['\u{1F469}\u{200D}\u{1F4BB}', '\u{1F1FA}\u{1F1F8}',
    '\u{E9}', '\u{915}\u{93F}', '\u{D55C}', '\u{AE00}'];
  assert.deepEqual(plain(api.graphemes(clean)), expected);
  const plan = api.plan(clean);
  assert.deepEqual(plain(plan.graphemes), expected);
  assert.equal(plan.waits.length, expected.length);
  assert.equal(plan.graphemes.join(''), clean);
  const fallback = createContext({ TextEncoder, TextDecoder, btoa, atob,
    Intl: { Segmenter: undefined } });
  runInContext(source, fallback, { timeout: 1000 });
  assert.deepEqual(plain(fallback.LMLTFY.graphemes('\u{1F600}a')), ['\u{1F600}', 'a']);
});

check('Missing Segmenter preserves sanitizer caps independently of typing fallback', () => {
  const fallback = createContext({ TextEncoder, TextDecoder, btoa, atob,
    Intl: { Segmenter: undefined } });
  runInContext(source, fallback, { timeout: 1000 });
  const safe = fallback.LMLTFY;
  const vectors = ['a\u{FE0F}\u{FE0F}\u{FE0E}', 'x' + '\u{301}'.repeat(30),
    '\u{1F469}' + '\u{200D}\u{1F4BB}'.repeat(10),
    '\u{915}\u{94D}'.repeat(10) + '\u{915}\u{93F}',
    '\u{1100}'.repeat(20), '\u{1161}'.repeat(20), '\u{11A8}'.repeat(20),
    '\u{D4E}'.repeat(15) + '\u{D15}', '\u{111C2}'.repeat(15) + 'a',
    '\u{1F1FA}\u{1F1F8}\u{FE0F}\u{FE0E}',
    'before\n\tafter', '\u{645}\u{631}\u{62D}\u{628}\u{627}',
    '\u{4E2D}\u{6587}', '\u{D55C}\u{AE00}'];
  const random = api.rng(753);
  const pool = ['a', ' ', '\n', '\t', '\u{301}', '\u{200D}', '\u{200C}',
    '\u{FE0F}', '\u{FE0E}', '\u{E0100}', '\u{915}', '\u{94D}',
    '\u{1100}', '\u{1161}', '\u{11A8}', '\u{D4E}', '\u{1F469}',
    '\u{1F3FB}', '\u{1F1FA}', '\u{1F1F8}'];
  for (let sample = 0; sample < 1000; sample++) {
    let text = '';
    for (let point = 0; point < 40; point++) text += pool[Math.floor(random() * pool.length)];
    vectors.push(text);
  }
  for (const raw of vectors) {
    const clean = safe.sanitize(raw);
    assert.equal(safe.sanitize(clean), clean);
    for (const part of api.graphemes(clean)) {
      assert.ok(Array.from(part).length <= 12, 'Fallback leaves an oversized native grapheme');
      assert.ok((part.match(/\p{Variation_Selector}/gu) || []).length <= 1);
    }
    assert.equal(safe.decode(safe.encode(raw)), clean);
    assert.equal(new URL(safe.destination(clean)).searchParams.get('q'), clean);
    assert.equal(safe.plan(clean).graphemes.join(''), clean);
  }
  assert.equal(safe.sanitize('ordinary words'), 'ordinary words');
  assert.deepEqual(plain(safe.graphemes('e\u{301}')), ['e', '\u{301}']);
});

check('The planner schema, seed, pacing and paste threshold are stable', () => {
  const question = 'a'.repeat(30);
  const plan = api.plan(question, { seed: 71, width: 320, height: 568 });
  assert.deepEqual(Object.keys(plan).sort(), ['arc', 'beats', 'graphemes', 'paste',
    'startOffset', 'times', 'typing', 'waits']);
  const beats = ['settle', 'reach', 'click', 'type', 'beat', 'send', 'sent', 'think'];
  assert.deepEqual(Object.keys(plan.beats), beats);
  assert.deepEqual(Object.keys(plan.times), [...beats, 'end']);
  assert.deepEqual(plain(plan), plain(api.plan(question, { seed: 71, width: 320, height: 568 })));
  assert.notDeepEqual(plain(plan), plain(api.plan(question, { seed: 72, width: 320, height: 568 })));
  assert.deepEqual(plain(api.plan(question)), plain(api.plan(question, { seed: api.hash(api.encode(question)) })));
  assert.equal(api.plan('a'.repeat(110)).paste, false);
  assert.equal(api.plan('a'.repeat(111)).paste, true);
  assert.ok(Math.abs(plan.arc) >= 0.06 && Math.abs(plan.arc) <= 0.12);
  assert.ok(plan.startOffset.x >= 160 && plan.startOffset.x <= 240);
  assert.ok(plan.startOffset.y >= 160 && plan.startOffset.y <= 240);
  for (const pace of ['relaxed', 'natural', 'brisk', 0.01, 100]) {
    const timed = api.plan(question, { pace });
    assert.equal(timed.typing, 2350);
    assert.ok(timed.times.end >= 5000 && timed.times.end <= 8000);
  }
});

check('Every capped length meets timing bars at small and large viewports', () => {
  const textFor = [length => 'a'.repeat(length), length => ' '.repeat(length),
    length => '!'.repeat(length), length => 'word, '.repeat(Math.ceil(length / 6)).slice(0, length)];
  for (const [width, height] of [[320, 568], [2560, 1440]]) {
    for (const make of textFor) {
      for (let length = 1; length <= api.CAP; length += 1) {
        const plan = api.plan(make(length), { seed: 42, width, height });
        const expected = Math.max(1200, Math.min(4200, 700 + 55 * length));
        assert.equal(plan.typing, expected);
        assert.equal(plan.beats.type, expected);
        assert.equal(plan.graphemes.length, length);
        assert.ok(plan.waits.every(wait => Number.isFinite(wait) && wait > 0));
        const sum = plan.waits.reduce((total, wait) => total + wait, 0);
        assert.ok(Math.abs(sum - expected) < 1e-8);
        assert.ok(plan.times.end <= 10000);
        if (length === 30) assert.ok(plan.times.end >= 5000 && plan.times.end <= 8000);
        let elapsed = 0;
        for (const [beat, duration] of Object.entries(plan.beats)) {
          assert.equal(plan.times[beat], elapsed);
          elapsed += duration;
        }
        assert.equal(plan.times.end, elapsed);
      }
    }
  }
  for (const options of [{ pointer: 'coarse' }, { reduced: true }]) {
    const plan = api.plan('x'.repeat(30), options);
    assert.equal(plan.typing, 2350);
    assert.ok(plan.times.end >= 5000 && plan.times.end <= 8000);
  }
});

check('Seeded random and minimum-jerk motion have safe endpoints', () => {
  assert.equal(api.hash('same'), api.hash('same'));
  assert.notEqual(api.hash('same'), api.hash('different'));
  const first = api.rng(9);
  const second = api.rng(9);
  for (let index = 0; index < 1000; index += 1) {
    const value = first();
    assert.equal(value, second());
    assert.ok(value >= 0 && value < 1);
  }
  assert.equal(api.minJerk(-1), 0);
  assert.equal(api.minJerk(0), 0);
  assert.equal(api.minJerk(0.5), 0.5);
  assert.equal(api.minJerk(1), 1);
  assert.equal(api.minJerk(2), 1);
  let previous = 0;
  for (let index = 0; index <= 100; index += 1) {
    const value = api.minJerk(index / 100);
    assert.ok(value >= previous && value <= 1);
    previous = value;
  }
});

check('Deterministic sanitizer and decoder fuzzing cannot smuggle invisible text', () => {
  const random = api.rng(1597);
  const pool = ['a', ' ', '\n', '\t', '|', '<script>', 'javascript:', '\u{202E}',
    '\u{2066}', '\u{200B}', '\u{200D}', '\u{200C}', '\u{E0041}',
    '\u{FE0F}', '\u{FE0E}', '\u{E0100}', '\u{301}', '\uD800', '\u{1F600}'];
  for (let iteration = 0; iteration < 1000; iteration += 1) {
    let text = '';
    for (let index = 0; index < 30; index += 1) text += pool[Math.floor(random() * pool.length)];
    const clean = api.sanitize(text);
    assert.equal(api.sanitize(clean), clean);
    assert.doesNotMatch(clean, /[\u{E0000}-\u{E007F}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{200B}\u{2060}]/u);
    assert.ok(api.graphemes(clean).every(part => Array.from(part).length <= 12));
    assert.equal(api.decode(api.encode(text)), clean);
    assert.equal(new URL(api.destination(clean)).searchParams.get('q'), clean);
    const garbage = Buffer.from(text, 'utf8').toString('base64url');
    assert.throws(() => api.decode(garbage));
  }
});

check('CSP exactly hashes all inline blocks and appears immediately after charset', () => {
  assert.equal(readPolicy(html).policy, policyFor(html));
  assert.match(html, /<meta\s+charset="utf-8"\s*\/?>\s*<meta\s+http-equiv="Content-Security-Policy"/i);
  assert.ok(inlineBlocks(html).some(block => block.type === 'script'));
  assert.ok(inlineBlocks(html).some(block => block.type === 'style'));
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /\b(?:frame-ancestors|report-uri|sandbox)\b/i);
});

check('The page stays self-contained, readable and inside both size budgets', () => {
  assert.ok(Buffer.byteLength(html) <= 40000, 'Raw page exceeds 40,000 bytes');
  assert.ok(gzipSync(html, { level: 9 }).length <= 14000, 'Gzip page exceeds 14,000 bytes');
  assert.doesNotMatch(html, /[\u{2013}\u{2014}\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{20E3}]/u);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel=["'](?:stylesheet|preload)["']/i);
  assert.doesNotMatch(html, /\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie|\b(?:fetch|XMLHttpRequest)\s*\(/);
  assert.doesNotMatch(source, /\b(?:document|window|location|navigator|performance)\b/);
  console.log(`Sizes: ${Buffer.byteLength(html)} bytes raw, ${gzipSync(html, { level: 9 }).length} bytes gzip -9`);
});

console.log(`${assertions} unit groups passed`);
