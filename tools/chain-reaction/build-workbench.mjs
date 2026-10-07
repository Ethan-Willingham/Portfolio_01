import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';

// Export only the current browser previews. Research notes, evidence and failed
// candidates stay in the independent local research repository.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = process.env.CHAIN_REACTION_RESEARCH;
if (!source) throw Error('Set CHAIN_REACTION_RESEARCH to the local research repository.');
const pages = ['connected-slice', 'earlier-slice', 'guided', 'props', 'drawer', 'drawer-port', 'drawer-outlet', 'rocker-landing', 'rocker-outlet'];
const scripts = ['world-dressing', 'connected-slice', 'connected-renderer', 'guided-preview', 'guided-renderer', 'props-preview', 'props-renderer', 'drawer-preview', 'drawer-renderer', 'drawer-port', 'drawer-release-renderer', 'drawer-outlet', 'drawer-outlet-renderer', 'rocker-landing', 'rocker-outlet', 'rocker-outlet-renderer', 'rope-centerline'];
const modules = ['connected-stage-observer', 'constraint-observer', 'pacing-observer', 'transfer-ledger', 'joint-coordinate', 'drawer-constraint-declarations', 'drawer-suspense-declaration', 'rocker-constraint-declaration'];
const kits = ['guided-catch-v14', 'drawer-bearing-v1', 'drawer-latch-v12', 'drawer-outlet-v16', 'stopped-rocker-v3', 'rocker-outlet-v5'];
const props = JSON.parse(await readFile(resolve(source, 'props/manifest.json'), 'utf8'));
const files = [...pages.map(f => f + '.html'), ...scripts.map(f => f + '.js'), ...modules.map(f => 'candidates/' + f + '.mjs'), ...kits.map(f => 'kits/' + f + '.json'), 'props/manifest.json', ...props.studies.map(p => 'props/' + p.path), 'stages/viewer/index.json', ...[1, 2, 3, 4].map(n => 'stages/viewer/' + String(n).padStart(5, '0') + '.json')];
const hash = data => createHash('sha256').update(data).digest('hex');
const records = [];
for (const file of files) {
  const original = await readFile(resolve(source, file), 'utf8');
  let content = original.replaceAll('/local/', '/chain-reaction/');
  if (file.endsWith('.html')) content = content
    .replace('href="/chain-reaction/slice.html">Review slice', 'href="/chain-reaction-workbench.html">All studies')
    .replace('href="index.html" class="cr-home">Home', 'href="/chain-reaction-workbench.html" class="cr-home">All studies')
    .replaceAll('local draft', 'draft').replaceAll('Local mechanical draft.', 'Mechanical draft.');
  if (file === 'guided-preview.js') content = content.replace(/const requestedKit=.*?definition=await fetch/, 'const kit=14,definition=await fetch');
  if (file === 'drawer-outlet.js') content = content.replace(/const kit=.*?Unknown drawer study'\);/, 'const kit=16;');
  if (file === 'stages/viewer/index.json') {
    const manifest = JSON.parse(content);
    manifest.scope = 'Four-stage mechanical draft. The fourth stage uses the draft viewer adapter; independent review and remaining work checks are pending.';
    content = JSON.stringify(manifest) + '\n';
  }
  const target = resolve(root, 'chain-reaction', file);
  await mkdir(dirname(target), {recursive: true});
  await writeFile(target, content);
  records.push({file, sourceHash: hash(original), publishedHash: hash(content)});
}
await writeFile(resolve(root, 'chain-reaction/workbench-manifest.json'), JSON.stringify({format: 'chain-reaction-workbench@1', scope: 'Current drafts and construction studies, under development.', files: records}, null, 2) + '\n');
// The portfolio entry opens the full-screen current chain. The workbench remains
// available as a separate catalogue of construction studies.
const viewer = await readFile(resolve(root, 'chain-reaction/connected-slice.html'), 'utf8');
const canonical = viewer.replace('<meta name="robots" content="noindex,nofollow">', '<link rel="canonical" href="https://ethanwillingham.com/chain-reaction.html">')
  .replace('</head>', '<meta property="og:title" content="Chain Reaction"><meta property="og:type" content="website"><meta property="og:url" content="https://ethanwillingham.com/chain-reaction.html"><meta property="og:image" content="https://ethanwillingham.com/assets/chain-reaction/workbench.jpg?v=0.3.0"></head>');
await writeFile(resolve(root, 'chain-reaction.html'), canonical);
console.log(`Exported ${files.length} browser files and the immersive portfolio post.`);
