#!/usr/bin/env node
/* ============================================================================
   build-sitemap.mjs  -  sitemap.xml generator.

   Emits one <url> per real content page: every tracked .html at the root and
   under archive/, minus the dev surfaces (lab choosers, sfx tools, editors,
   the 404 page, redirect stubs, easter eggs). lastmod comes from each file's
   last git commit date, so regenerate AFTER committing content changes:

     node tools/build-sitemap.mjs && git add sitemap.xml

   Run it whenever a post is added, archived, or un-archived (ARCHIVING.md).
   robots.txt points crawlers at the output.
   ============================================================================ */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://ethanwillingham.com';

const SKIP = [
  /-lab\.html$/,        // throwaway choosers
  /^sfx-/,              // sfx prompt/publish/test tools
  /^(edit|blog-edit|post-builder)\.html$/, // editors and builders
  /^404\.html$/,        // the not-found page itself
  /^ocean\/index\.html$/, // redirect stub for /ocean/
  /^lucky\.html$/,      // easter egg, found by luck not by search
  /^mc_/,               // raw scratch captures
];

const files = execSync('git ls-files "*.html"', { cwd: ROOT }).toString().trim().split('\n')
  .filter(f => !SKIP.some(re => re.test(f)))
  .sort();

const urls = files.map(f => {
  const lastmod = execSync(`git log -1 --format=%cs -- "${f}"`, { cwd: ROOT }).toString().trim();
  const loc = f === 'index.html' ? `${SITE}/` : `${SITE}/${f}`;
  return `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), xml);
console.log(`sitemap.xml: ${files.length} pages`);
