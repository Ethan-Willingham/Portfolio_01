#!/usr/bin/env node
/* ============================================================
   Build js/gita-data.js (window.GITA) from the sourced corpus.

   Inputs (research/gita/raw/):
     bgio-verse.json       Devanagari (text), IAST (transliteration),
                           word_meanings, chapter_number, verse_number, id
     bgio-translation.json the five complete English translations
                           (bhagavadgita.io open data), joined on verse_id
     keystones-extra.json  (optional) per-verse {ref:{key:text}} additions
                           for keystone-only translators (Arnold, the moderns,
                           Telang, Besant) sourced separately

   Output: js/gita-data.js   window.GITA = {translators, order, chapters, verses}
   Schema mirrors window.DHP. No em dashes in this build script's own prose.
   ============================================================ */
import fs from 'node:fs';

const RAW = new URL('../research/gita/raw/', import.meta.url);
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, RAW), 'utf8'));

const V = read('bgio-verse.json');
const T = read('bgio-translation.json');
let EXTRA = {};
try { EXTRA = read('keystones-extra.json'); } catch { /* optional */ }

/* the five complete English translations in the open dataset */
const ENGLISH = {
  21: 'purohit',        // Shri Purohit Swami, 1935 (London; Yeats championed it)
  16: 'sivananda',      // Swami Sivananda, Divine Life Society
  18: 'adidevananda',   // Swami Adidevananda, follows Ramanuja (devotional)
  19: 'gambirananda',   // Swami Gambhirananda, follows Shankara (Advaita)
  20: 'sankaranarayan', // Dr. S. Sankaranarayan, academic
};

/* translator metadata. n is filled in after the join. Years: see colophon notes. */
const TRANSLATORS = {
  purohit:        { name: 'Shri Purohit Swami',  year: 1935, src: 'Faber & Faber (open data, bhagavadgita.io)' },
  sivananda:      { name: 'Swami Sivananda',     year: 1942, src: 'Divine Life Society (open data)' },
  adidevananda:   { name: 'Swami Adidevananda',  year: 1974, src: 'Sri Ramakrishna Math (open data)' },
  gambirananda:   { name: 'Swami Gambhirananda', year: 1984, src: 'Advaita Ashrama (open data)' },
  sankaranarayan: { name: 'Dr. S. Sankaranarayan', year: 1995, src: 'open data, bhagavadgita.io' },
  /* keystone-only translators (filled from keystones-extra.json if present) */
  arnold:        { name: 'Edwin Arnold',         year: 1885, src: 'The Song Celestial (PD)' },
  telang:        { name: 'Kashinath Telang',     year: 1882, src: 'Sacred Books of the East (PD)' },
  besant:        { name: 'Annie Besant',         year: 1905, src: 'Theosophical (PD)' },
  prabhavananda: { name: 'Prabhavananda & Isherwood', year: 1944, src: 'Vedanta Press' },
  easwaran:      { name: 'Eknath Easwaran',      year: 1985, src: 'Nilgiri Press' },
  miller:        { name: 'Barbara Stoler Miller', year: 1986, src: 'Bantam' },
  sargeant:      { name: 'Winthrop Sargeant',    year: 1979, src: 'SUNY Press' },
  mitchell:      { name: 'Stephen Mitchell',     year: 2000, src: 'Harmony' },
  schweig:       { name: 'Graham Schweig',       year: 2007, src: 'HarperOne' },
  patton:        { name: 'Laurie Patton',        year: 2008, src: 'Penguin Classics' },
};

/* chapter names: Sanskrit (clean IAST) + a short plain-English title */
const CH = [
  ['Arjuna Viṣāda Yoga',            "Arjuna's despair"],
  ['Sāṅkhya Yoga',                  'The counsel of knowledge'],
  ['Karma Yoga',                    'The path of action'],
  ['Jñāna Karma Sannyāsa Yoga',     'Knowledge and renunciation'],
  ['Karma Sannyāsa Yoga',           'Renouncing the fruits'],
  ['Dhyāna Yoga',                   'Meditation'],
  ['Jñāna Vijñāna Yoga',            'Knowing and realizing'],
  ['Akṣara Brahma Yoga',            'The imperishable'],
  ['Rāja Vidyā Yoga',               'The royal secret'],
  ['Vibhūti Yoga',                  'The divine glories'],
  ['Viśvarūpa Darśana Yoga',        'The cosmic vision'],
  ['Bhakti Yoga',                   'The path of love'],
  ['Kṣetra Kṣetrajña Vibhāga Yoga', 'The field and its knower'],
  ['Guṇatraya Vibhāga Yoga',        'The three strands'],
  ['Puruṣottama Yoga',              'The supreme person'],
  ['Daivāsura Sampad Vibhāga Yoga', 'The bright and the dark'],
  ['Śraddhātraya Vibhāga Yoga',     'The threefold faith'],
  ['Mokṣa Sannyāsa Yoga',           'Freedom and surrender'],
];

/* ---------- cleaners ---------- */
const straight = (s) => s
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"');

function cleanDev(s) {
  return straight(s || '')
    .replace(/।।\s*[\d०-९.]+\s*।।/g, '')   // strip embedded verse-number markers
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
    .trim();
}
function cleanLine(s) {
  return straight(s || '')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
    .trim();
}
function cleanEn(s) {
  return straight(s || '')
    .replace(/^\s*\d+[\.\)]\s*/, '')        // any stray leading verse number
    .replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/* ---------- join translations onto verses ---------- */
const trByVerse = new Map();                 // verse_id -> {key: text}
for (const t of T) {
  const key = ENGLISH[t.author_id];
  if (!key) continue;                        // skip Hindi / Sanskrit commentaries
  if (!trByVerse.has(t.verse_id)) trByVerse.set(t.verse_id, {});
  trByVerse.get(t.verse_id)[key] = cleanEn(t.description);
}

/* ---------- build verses, in canonical order ---------- */
const sortedV = V.slice().sort((a, b) =>
  (a.chapter_number - b.chapter_number) || (a.verse_number - b.verse_number));

const counts = {};
const emdash = [];
const verses = sortedV.map((row) => {
  const ch = row.chapter_number, vn = row.verse_number, ref = ch + '.' + vn;
  counts[ch] = (counts[ch] || 0) + 1;
  const tr = trByVerse.get(row.id) || {};
  const v = [];
  for (const key of ['purohit', 'sivananda', 'adidevananda', 'gambirananda', 'sankaranarayan']) {
    if (tr[key]) v.push({ k: key, t: tr[key] });
  }
  /* keystone-only additions */
  const ex = EXTRA[ref];
  if (ex) for (const key of Object.keys(ex)) {
    if (ex[key]) v.push({ k: key, t: cleanLine(ex[key]) });
  }
  v.forEach((x) => { if (/—/.test(x.t)) emdash.push(ref + ' ' + x.k); });
  return { ch, vn, dev: cleanDev(row.text), iast: cleanLine(row.transliteration), v };
});

/* ---------- chapters with sequential ranges ---------- */
let cursor = 0;
const chapters = CH.map(([sa, en], i) => {
  const n = i + 1, c = counts[n] || 0;
  const from = cursor + 1, to = cursor + c;
  cursor = to;
  return { n, sa, en, from, to };
});

/* ---------- translator n (verse coverage) ---------- */
const cover = {};
verses.forEach((vv) => vv.v.forEach((x) => { cover[x.k] = (cover[x.k] || 0) + 1; }));
const usedKeys = Object.keys(cover);
const translators = {};
const order = ['purohit', 'sivananda', 'adidevananda', 'gambirananda', 'sankaranarayan',
  'telang', 'besant', 'arnold', 'prabhavananda', 'easwaran', 'miller', 'sargeant', 'mitchell', 'schweig', 'patton'];
for (const k of order) {
  if (!cover[k]) continue;
  translators[k] = { name: TRANSLATORS[k].name, year: TRANSLATORS[k].year, n: cover[k], src: TRANSLATORS[k].src };
}

const GITA = { translators, order: order.filter((k) => cover[k]), chapters, verses };

/* ---------- write ---------- */
const out = new URL('../js/gita-data.js', import.meta.url);
const banner =
`/* The Bhagavad Gita, side by side: the corpus.
   Generated by tools/build-gita-data.mjs from the sourced text. Do not hand-edit.
   Devanagari + transliteration: the open bhagavadgita.io dataset (verse.json).
   Complete English translations: Purohit, Sivananda, Adidevananda (after Ramanuja),
   Gambhirananda (after Shankara), Sankaranarayan, from the same open dataset.
   Keystone-only renderings (Arnold, Telang, Besant, and the modern translators)
   are added on the keystone verses for comparison, each named. Verbatim. */
`;
fs.writeFileSync(out, banner + 'window.GITA=' + JSON.stringify(GITA) + ';\n');

/* ---------- report ---------- */
const total = verses.length;
console.log('verses:', total, '| chapters:', chapters.length);
console.log('per-chapter counts:', chapters.map((c) => c.n + ':' + (c.to - c.from + 1)).join(' '));
console.log('translator coverage:', usedKeys.map((k) => k + '=' + cover[k]).join(', '));
console.log('chapter ranges:', chapters.map((c) => c.n + '[' + c.from + '-' + c.to + ']').join(' '));
if (emdash.length) console.log('\nEM DASHES in quoted text (' + emdash.length + '):', emdash.slice(0, 40).join(', '));
const out247 = verses.find((v) => v.ch === 2 && v.vn === 47);
console.log('\n2.47 dev:', JSON.stringify(out247.dev));
console.log('2.47 iast:', JSON.stringify(out247.iast));
console.log('2.47 translators:', out247.v.map((x) => x.k).join(', '));
console.log('file bytes:', fs.statSync(out).size);
