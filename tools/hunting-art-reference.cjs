#!/usr/bin/env node
// Validate the studied gallery, or export a local visual packet. No game mutation.
// --check uses Node only. Export requires NODE_PATH pointing to bundled Sharp.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const guideDir = path.join(root, 'docs/hunting-style');
const catalogPath = path.join(guideDir, 'gallery-reference.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function repoPath(relative) {
  assert.equal(typeof relative, 'string', 'Asset path must be a string.');
  const resolved = path.resolve(root, relative);
  assert.ok(resolved.startsWith(root + path.sep), 'Asset path must stay in the repository: ' + relative);
  return resolved;
}

function jpegSize(buffer) {
  assert.equal(buffer.readUInt16BE(0), 0xffd8, 'Original must be JPEG.');
  let offset = 2;
  while (offset + 4 < buffer.length) {
    assert.equal(buffer[offset++], 0xff, 'Invalid JPEG marker.');
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const length = buffer.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= buffer.length, 'Invalid JPEG segment.');
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error('JPEG dimensions were not found.');
}

function validate() {
  assert.equal(catalog.schema_version, 1, 'Unsupported catalog version.');
  const gallery = fs.readFileSync(repoPath(catalog.local_gallery), 'utf8');
  const galleryPaths = [...gallery.matchAll(/class="plate-image-wrap"[^>]*data-zoom-src="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(catalog.paintings.map(p => p.source.original), galleryPaths,
    'Gallery membership or order changed. Study the current originals and update the catalog deliberately.');
  const ids = new Set();
  for (const painting of catalog.paintings) {
    assert.match(painting.id, /^[a-z][a-z0-9-]*$/, 'Invalid painting ID.');
    assert.ok(!ids.has(painting.id), 'Duplicate painting ID: ' + painting.id);
    ids.add(painting.id);
    assert.equal(painting.plate, ids.size, 'Plate order changed.');
    assert.equal(painting.gallery_url, catalog.source_gallery + '#plate-' + painting.plate);
    for (const field of ['title', 'artist', 'summary', 'game_translation', 'avoid']) {
      assert.ok(typeof painting[field] === 'string' && painting[field].trim(), painting.id + ' is missing ' + field);
    }
    assert.ok(painting.tags.length && painting.observations.length && painting.studies.length, painting.id + ' is missing study notes.');
    for (const [fileKey, hashKey] of [['original', 'sha256'], ['webp', 'webp_sha256']]) {
      const bytes = fs.readFileSync(repoPath(painting.source[fileKey]));
      assert.equal(hash(bytes), painting.source[hashKey], painting.id + ' ' + fileKey + ' changed. Inspect the replacement before updating its fingerprint.');
      if (fileKey === 'original') assert.deepEqual(jpegSize(bytes), { width: painting.source.width, height: painting.source.height }, painting.id + ' dimensions disagree.');
    }
    const studies = new Set();
    for (const study of painting.studies) {
      assert.match(study.id, /^[a-z][a-z0-9-]*$/);
      assert.ok(!studies.has(study.id), 'Duplicate study in ' + painting.id);
      studies.add(study.id);
      assert.equal(study.rect.length, 4);
      const [x, y, width, height] = study.rect;
      assert.ok(study.rect.every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1 && y + height <= 1,
        'Study rectangle is outside the original: ' + painting.id + '/' + study.id);
      assert.ok(study.lesson.trim());
    }
  }
  const assigned = new Set();
  for (const [name, brief] of Object.entries(catalog.briefs)) {
    assert.match(name, /^[a-z][a-z0-9-]*$/);
    assert.ok(brief.title && brief.intent && brief.status && brief.constraints.length && brief.references.length, 'Incomplete brief: ' + name);
    const seen = new Set();
    for (const reference of brief.references) {
      assert.ok(ids.has(reference.id), 'Unknown reference in ' + name + ': ' + reference.id);
      assert.ok(!seen.has(reference.id) && reference.role.trim(), 'Duplicate or incomplete reference in ' + name);
      seen.add(reference.id); assigned.add(reference.id);
    }
  }
  assert.equal(assigned.size, ids.size, 'Every studied painting must have a defined game reference job.');
  console.log('Verified ' + ids.size + ' paintings, ' + catalog.paintings.reduce((n, p) => n + p.studies.length, 0) + ' detail studies and ' + Object.keys(catalog.briefs).length + ' production briefs.');
}

function readArgs() {
  const args = process.argv.slice(2);
  let check = false, brief, out;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      console.log('Usage: node tools/hunting-art-reference.cjs --check\n       NODE_PATH=/path/to/node_modules node tools/hunting-art-reference.cjs --brief <all|' + Object.keys(catalog.briefs).join('|') + '> [--out <directory>]');
      process.exit(0);
    } else if (args[i] === '--check') check = true;
    else if (args[i] === '--brief' || args[i] === '--out') {
      const flag = args[i], value = args[++i];
      assert.ok(value && !value.startsWith('--'), flag + ' needs a value.');
      if (flag === '--brief') brief = value; else out = value;
    } else throw new Error('Unknown argument: ' + args[i]);
  }
  assert.ok(check || brief, 'Specify --check or --brief. Use --help for commands.');
  assert.ok(!out || brief, '--out requires --brief.');
  assert.ok(!brief || brief === 'all' || catalog.briefs[brief], 'Unknown brief: ' + brief);
  return { brief, out: out && path.resolve(out) };
}

function cropRect(painting, study) {
  const [x, y, width, height] = study.rect;
  const left = Math.floor(x * painting.source.width), top = Math.floor(y * painting.source.height);
  return { left, top, width: Math.min(painting.source.width - left, Math.max(1, Math.round(width * painting.source.width))),
    height: Math.min(painting.source.height - top, Math.max(1, Math.round(height * painting.source.height))) };
}

function promptFor(brief, paintings) {
  return '# ' + brief.title + '\n\n' + brief.intent + '\n\n## Shared visual direction\n\n' + catalog.shared_direction +
    '\n\nUse the actual reference images alongside this text. Preserve the different jobs of broad landscape paint and smoothly modeled living forms. Do not copy photographed borders, cracks, signatures, labels or unrelated subjects.\n\n## References and jobs\n\n' +
    brief.references.map(ref => {
      const painting = paintings.find(p => p.id === ref.id);
      return '- ' + painting.id + ': ' + painting.title + ', ' + painting.artist + '. ' + ref.role + '\n  ' + painting.game_translation;
    }).join('\n') + '\n\n## Task constraints\n\n' + brief.constraints.map(c => '- ' + c).join('\n') +
    '\n\n## Complete before production\n\nFill docs/hunting-style/ASSET_BRIEF_TEMPLATE.md with the exact subject, camera, light direction, source size, layers or transparency, runtime contract and final prompt. Review the original primary paintings, then compare the asset within the actual game at wide and scope scales.\n';
}

function boardHTML(paintings, brief, name, images, tokens, fonts) {
  const cssTokens = Object.entries(tokens).map(([key, value]) => key + ':' + value + ';').join('');
  const fontCSS = fonts.map(font => '@font-face{font-family:"' + font.family + '";src:url(data:font/woff2;base64,' + font.data + ') format("woff2");font-weight:400;font-style:normal;}').join('');
  const data = JSON.stringify({ paintings, briefs: catalog.briefs, name }).replace(/</g, '\\u003c');
  const options = '<option value="all">All in this packet</option>' + Object.entries(catalog.briefs)
    .filter(([, b]) => b.references.some(r => paintings.some(p => p.id === r.id)))
    .map(([id, b]) => '<option value="' + id + '">' + esc(b.title) + '</option>').join('');
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow"><title>Hunting Game painting references</title><style>' + fontCSS + ':root{' + cssTokens + 'color-scheme:dark}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:17px/1.6 var(--font-body)}main{max-width:1560px;margin:auto;padding:40px 28px}' +
    'h1,h2,h3{font-family:var(--font-heading);font-weight:400;line-height:1.2}h1{font-size:clamp(2.3rem,6vw,4rem);margin:8px 0 20px}h2{font-size:1.8rem;margin:12px 0 8px}h3{font-size:1.35rem}' +
    '.kicker,.artist,.meta{font:13px/1.6 var(--font-mono);color:var(--text-dim)}.intro{max-width:900px}a{color:var(--accent)}a:hover{color:var(--accent-hover)}' +
    '.controls{display:flex;flex-wrap:wrap;gap:16px;margin:28px 0;border-block:1px solid var(--rule);padding:18px 0}.controls label{display:flex;flex-direction:column;gap:6px;flex:1;min-width:210px}' +
    'select,input{min-height:44px;width:100%;font:16px var(--font-body);color:var(--text);background:var(--bg-raised);border:1px solid var(--rule-strong);padding:8px 12px;border-radius:3px}' +
    ':focus-visible{outline:2px solid var(--accent);outline-offset:4px}#count{align-self:end;margin:10px 0;min-width:130px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:40px}' +
    '.painting{border-top:1px solid var(--rule-strong);padding-top:20px;min-width:0}.painting[hidden]{display:none}.painting picture{display:block}.painting>.image{display:block;width:100%;height:440px;object-fit:contain}' +
    '.artist{margin:0 0 18px}.role{color:var(--accent)}.source-links{display:flex;flex-wrap:wrap;gap:20px}.source-links a{display:inline-flex;align-items:center;min-height:44px}' +
    'details{border-top:1px solid var(--rule);margin:16px 0;padding-top:10px}summary{cursor:pointer;min-height:44px;display:list-item;padding:10px 0}.studies{display:grid;gap:24px}.study{margin:0}.study img{display:block;max-width:100%;max-height:360px;object-fit:contain}' +
    '.swatch{display:inline-block;width:24px;height:24px;border:1px solid var(--rule-strong);vertical-align:middle;margin-right:10px}.study figcaption{margin-top:12px}ul{padding-left:22px}.empty{padding:30px 0}footer{margin-top:40px;padding-top:20px;border-top:1px solid var(--rule);color:var(--text-dim)}' +
    '@media(max-width:800px){main{padding:24px 18px}.grid{grid-template-columns:1fr}.painting>.image{height:auto;max-height:540px}.controls label{min-width:min(210px,100%)}}' +
    '@media print{body{background:#fff;color:#222}.controls,.source-links{display:none}.grid{display:block}.painting{break-inside:avoid}.artist,.meta{color:#444}}' +
    '</style></head><body><main><p class="kicker">Hunting Game / Visual reference / Studied 2026-10-03</p><h1>The paintings behind the game</h1>' +
    '<div class="intro"><p>' + esc(catalog.shared_direction) + '</p><p>Packet: ' + esc(brief.title) + '. ' + esc(brief.intent) + '</p>' +
    '<p>These are source paintings and study crops. Game artwork is still awaiting its visual pass. View a whole painting first, then open its notes and details.</p>' +
    '<p><a href="' + pathToFileURL(path.join(guideDir, 'README.md')).href + '">Style guide</a> / <a href="' + pathToFileURL(path.join(guideDir, 'FIRST_MAP.md')).href + '">First-map brief</a> / <a href="' + esc(catalog.source_gallery) + '">Original gallery</a></p></div>' +
    '<div class="controls"><label>View references for<select id="brief">' + options + '</select></label><label>Find a painting or lesson<input id="search" type="search" placeholder="Try clouds, animals, reeds or an artist"></label><p id="count" class="meta" aria-live="polite"></p></div>' +
    '<section class="grid" aria-label="Painting references">' + paintings.map(p => '<article class="painting" data-id="' + p.id + '">' +
      '<p class="meta">Plate ' + p.plate + ' / ' + esc(p.tags.join(', ')) + '</p><img class="image" src="' + images[p.id].full + '" alt="' + esc(p.summary) + '" ' + (p.plate === paintings[0].plate ? 'loading="eager"' : 'loading="lazy"') + '>' +
      '<h2>' + esc(p.title) + '</h2><p class="artist">' + esc(p.artist) + '</p><p class="role"></p><p>' + esc(p.summary) + '</p><p>' + esc(p.game_translation) + '</p>' +
      '<div class="source-links"><a href="' + esc(p.gallery_url) + '">Gallery plate</a><a href="' + pathToFileURL(repoPath(p.source.original)).href + '">Full-resolution original</a></div>' +
      '<details><summary>Observations and limits</summary><ul>' + p.observations.map(o => '<li>' + esc(o) + '</li>').join('') + '</ul><p>' + esc(p.avoid) + '</p><p class="meta">Original: ' + p.source.width + ' by ' + p.source.height + '. Catalog ID: ' + esc(p.id) + '.</p></details>' +
      '<details class="detail-studies"><summary>Detail studies (' + p.studies.length + ')</summary><div class="studies">' + p.studies.map(s => '<figure class="study"><img src="' + images[p.id].studies[s.id].image + '" alt="' + esc(s.lesson) + '" loading="lazy"><figcaption><h3>' + esc(s.id.replace(/-/g, ' ')) + '</h3><p>' + esc(s.lesson) + '</p><p class="meta"><span class="swatch" style="background:' + images[p.id].studies[s.id].color + '"></span>' + images[p.id].studies[s.id].color + ' / Average digital color of this crop</p></figcaption></figure>').join('') + '</div></details></article>').join('') +
    '</section><p class="empty" hidden>No paintings match this search. Clear the search or choose all references in this packet.</p><footer><p>Digital crop averages are study aids, not pigment measurements or approved interface colors. The full-resolution originals remain the art reference. No gallery photographs were changed.</p></footer></main>' +
    '<script type="application/json" id="catalog">' + data + '</script><script>\n' +
    'const data=JSON.parse(document.getElementById("catalog").textContent),filter=document.getElementById("brief"),search=document.getElementById("search");\n' +
    'filter.value=data.name; if(!filter.value)filter.value="all";\n' +
    'function update(){const brief=data.briefs[filter.value],refs=brief&&new Map(brief.references.map(r=>[r.id,r.role])),query=search.value.trim().toLowerCase();let shown=0;\n' +
    'for(const p of data.paintings){const card=document.querySelector("[data-id=\\\""+p.id+"\\\"]"),match=(!refs||refs.has(p.id))&&JSON.stringify(p).toLowerCase().includes(query);card.hidden=!match;card.querySelector(".role").textContent=refs&&refs.get(p.id)||"";if(match)shown++;}\n' +
    'document.getElementById("count").textContent=shown+" of "+data.paintings.length+" paintings";document.querySelector(".empty").hidden=shown!==0;}\n' +
    'filter.addEventListener("change",update);search.addEventListener("input",update);update();\n</script></body></html>\n';
}

async function exportPacket(name, output) {
  let sharp;
  try { sharp = require('sharp'); }
  catch { throw new Error('Export needs Sharp. Set NODE_PATH to the bundled Node packages returned by load_workspace_dependencies. --check needs no packages.'); }
  const brief = name === 'all' ? { title: 'All 14 gallery paintings', status: 'reference study', intent: 'Study the full gallery and choose the production brief that fits the current asset.',
    references: catalog.paintings.map(p => ({ id: p.id, role: p.game_translation })), constraints: ['Apply the guide to every visible game surface.', 'Choose a specific subject and primary references before production.'] } : catalog.briefs[name];
  const paintings = brief.references.map(ref => catalog.paintings.find(p => p.id === ref.id));
  const out = output || path.join(root, 'research/hunting-art-reference', name);
  fs.mkdirSync(path.join(out, 'images'), { recursive: true });
  const images = {}, placements = [], tileWidth = 880, tileHeight = 700, columns = Math.min(2, paintings.length);
  const rows = Math.ceil(paintings.length / columns);
  for (let i = 0; i < paintings.length; i++) {
    const painting = paintings[i], source = repoPath(painting.source.original), prefix = String(painting.plate).padStart(2, '0') + '-' + painting.id;
    const full = await sharp(source).resize({ width: 1400, height: 1100, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
    fs.writeFileSync(path.join(out, 'images', prefix + '.webp'), full);
    images[painting.id] = { full: 'data:image/webp;base64,' + full.toString('base64'), studies: {} };
    for (const study of painting.studies) {
      const rect = cropRect(painting, study);
      const crop = await sharp(source).extract(rect).resize({ width: 900, height: 650, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
      const stats = await sharp(source).extract(rect).removeAlpha().toColourspace('srgb').stats();
      const color = '#' + stats.channels.slice(0, 3).map(channel => Math.round(channel.mean).toString(16).padStart(2, '0')).join('');
      fs.writeFileSync(path.join(out, 'images', prefix + '-' + study.id + '.webp'), crop);
      images[painting.id].studies[study.id] = { image: 'data:image/webp;base64,' + crop.toString('base64'), color };
    }
    const tile = await sharp(source).resize({ width: 840, height: 550, fit: 'inside' }).png().toBuffer();
    const size = await sharp(tile).metadata(), left = (i % columns) * tileWidth, top = Math.floor(i / columns) * tileHeight;
    placements.push({ input: tile, left: left + Math.round((tileWidth - size.width) / 2), top: top + 15 });
    const words = painting.title.split(' '), lines = [''];
    for (const word of words) {
      if ((lines[lines.length - 1] + ' ' + word).trim().length > 66) lines.push(word);
      else lines[lines.length - 1] = (lines[lines.length - 1] + ' ' + word).trim();
    }
    const label = '<svg xmlns="http://www.w3.org/2000/svg" width="840" height="120"><g fill="#e8e2d6" font-family="Segoe UI" font-size="21"><text x="0" y="25">Plate ' + painting.plate + ' / ' + esc(painting.artist) + '</text>' + lines.map((line, j) => '<text x="0" y="' + (57 + j * 28) + '">' + esc(line) + '</text>').join('') + '</g></svg>';
    placements.push({ input: Buffer.from(label), left: left + 20, top: top + 572 });
  }
  const sheet = path.join(out, 'reference-sheet.jpg');
  await sharp({ create: { width: tileWidth * columns, height: tileHeight * rows, channels: 3, background: '#303931' } }).composite(placements).jpeg({ quality: 92 }).toFile(sheet);
  const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8').match(/:root\s*\{([\s\S]*?)\}/)[1];
  const tokens = {};
  for (const token of ['bg', 'bg-raised', 'text', 'text-dim', 'accent', 'accent-hover', 'rule', 'line-mid', 'font-heading', 'font-body', 'font-mono']) {
    const match = style.match(new RegExp('--' + token + '\\s*:\\s*([^;]+);'));
    assert.ok(match, 'Missing shared style token: ' + token); tokens['--' + token] = match[1].trim();
  }
  tokens['--rule-strong'] = 'var(--line-mid)';
  const fonts = [['century_supra_a', 'century_supra_a_regular'], ['Segoe UI', 'segoe_ui_regular'], ['Commit Mono', 'commit_mono_regular']]
    .map(([family, file]) => ({ family, data: fs.readFileSync(path.join(root, 'assets/fonts', file + '.woff2')).toString('base64') }));
  const board = path.join(out, 'reference-board.html');
  fs.writeFileSync(board, boardHTML(paintings, brief, name, images, tokens, fonts));
  fs.writeFileSync(path.join(out, 'prompt.md'), promptFor(brief, paintings));
  const packet = { catalog_schema_version: catalog.schema_version, catalog_sha256: hash(fs.readFileSync(catalogPath)), studied_on: catalog.studied_on,
    brief: name, title: brief.title, status: brief.status, intent: brief.intent, constraints: brief.constraints,
    referenced_image_paths: paintings.map(p => repoPath(p.source.original)),
    references: paintings.map(p => ({ id: p.id, title: p.title, role: brief.references.find(ref => ref.id === p.id).role, source: p.source,
      studies: p.studies.map(s => ({ ...s, crop_pixels: cropRect(p, s), average_srgb: images[p.id].studies[s.id].color })) })),
    style_guide: path.join(guideDir, 'README.md'), asset_brief_template: path.join(guideDir, 'ASSET_BRIEF_TEMPLATE.md') };
  fs.writeFileSync(path.join(out, 'packet.json'), JSON.stringify(packet, null, 2) + '\n');
  console.log('Packet: ' + out + '\nBoard: ' + board + '\nContact sheet: ' + sheet + '\nOriginal image paths: packet.json\nProduction direction: prompt.md');
}

(async () => {
  const args = readArgs();
  validate();
  if (args.brief) await exportPacket(args.brief, args.out);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
