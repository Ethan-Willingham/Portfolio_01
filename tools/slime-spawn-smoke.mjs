// Verify retired wild slimes stay absent in fresh worlds and legacy saves.
// Run: node tools/slime-spawn-smoke.mjs. Uses a private Chrome for Testing process.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = process.env.ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8208), debug = port + 1000;
const profile = fs.mkdtempSync('/tmp/sluice-slime-spawn-');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer((req, res) => {
  try {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    let data = fs.readFileSync(file);
    if (file === path.join(root, 'js/sluice.js')) {
      const src = data.toString(), i = src.lastIndexOf('})();');
      data = Buffer.from(src.slice(0, i) + 'window.__slimeSpawnTest = function(source) { return eval(source); };\n' + src.slice(i));
    }
    const mime = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.woff2':'font/woff2', '.jpg':'image/jpeg', '.webp':'image/webp', '.png':'image/png' };
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}); res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const chrome = spawn(process.env.CHROME || `${process.env.HOME}/.local/bin/agent-chrome-for-testing`, [
  '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--disable-gpu-sandbox',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${debug}`, 'about:blank'
], {stdio:'ignore'});
let ws, seq=0; const pending=new Map(), errors=[];
function cleanup() { try {ws?.close();} catch {} chrome.kill(); server.close(); try {fs.rmSync(profile,{recursive:true,force:true});} catch {} }
process.on('SIGINT', () => {cleanup();process.exit(130);});
function send(method,params={}) { return new Promise((resolve,reject) => { const id=++seq; pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params})); }); }
async function ev(expression) { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));return r.result?.value; }
const game = source => ev(`__slimeSpawnTest(${JSON.stringify(source)})`);
function check(label, condition) { assert.ok(condition,label);console.log('PASS '+label); }
try {
  let endpoint;
  for(let i=0;i<100;i++) { try {const pages=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();endpoint=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl;if(endpoint)break;}catch{}await sleep(100); }
  assert.ok(endpoint,'testing browser started');
  ws=new WebSocket(endpoint);await new Promise(resolve=>ws.addEventListener('open',resolve));
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/grand-motherload.html?nosave=1&nopause=1&tod=0.35`});
  for(let i=0;i<300;i++){if(await ev(`typeof __slimeSpawnTest==='function' && __slimeSpawnTest("introPhase === 'done'")`))break;await sleep(100);}
  check('normal game boot completes with soft bodies and bathhouse enabled', await game("introPhase === 'done' && ENABLE_JELLO && ENABLE_BATH"));
  check('shader warmup has no errors', await ev('window.__shaderWarm.errors.length === 0'));
  await game('cancelAnimationFrame(gameRafId); gameRafId = 0;');
  const worlds = await game(`(function () {
    var results = [], modes = ['regular', 'wide', 'deep', 'rain', 'snow'];
    for (var i = 0; i < modes.length; i++) {
      SluiceOptions.pondStyle = i < 3 ? modes[i] : 'regular';
      SluiceOptions.particleRain = i === 3;
      SluiceOptions.particleSnow = i === 4;
      init();
      surfaceSlimeSeed();
      var tiles = 0;
      for (var r = 0; r < world.length; r++) for (var c = 0; c < world[r].length; c++) {
        if (world[r][c] && world[r][c].type === 'jello') tiles++;
      }
      results.push({mode: modes[i], tiles: tiles, ponds: surfacePonds.length,
        residents: jelloBodies.filter(function (b) { return !!b.surfaceSlime; }).length,
        glass: jelloBodies.filter(function (b) { return !b.surfaceSlime && !b.guest; }).length,
        rain: worldRainEnabled, snow: worldSnowEnabled});
    }
    return results;
  })()`);
  console.log('FRESH WORLDS', worlds);
  check('all pond styles and weather worlds keep their ponds and five residents without wild slimes',
    worlds.every(w => w.tiles === 0 && w.glass === 0 && w.residents === 5 && w.ponds > 0));
  check('rain and snow generation were exercised', worlds[3].rain && !worlds[3].snow && worlds[4].snow);
  const migrated = await game(`(function () {
    SluiceOptions.particleRain = SluiceOptions.particleSnow = false;
    init(); surfaceSlimeSeed();
    var shoreR = SKY_ROWS - 1, buriedR = SKY_ROWS + 12, col = 20;
    world[shoreR][col] = {type:'jello',hp:999999};
    world[buriedR][col] = {type:'jello',jellyType:'frost',hp:123,shiny:true};
    world[buriedR][col + 1] = null;
    terrainClearedKinds[buriedR + ':' + (col + 1)] = 'stone';
    var rock = skySlimeFresh((DECK_CENTER_COL + 8) * TILE, SKY_ROWS * TILE - 30);
    skySlimes.push(rock);
    money = 4321; cargo = ['iron'];
    var env = JSON.parse(JSON.stringify(saveBuild()));
    env.jello = [{c:[shoreR,col + 2],t:'slime',h:120,x:(col + 2.5)*TILE,y:(shoreR + 0.5)*TILE},
      {c:[buriedR,col + 2],t:'frost',h:200,x:(col + 2.5)*TILE,y:(buriedR + 0.5)*TILE}];
    // Start with live glass bodies too, verifying load clears stale runtime state.
    jelloRestoreBodies(env.jello);
    var oldBodies = jelloBodies.length;
    saveApply(env); surfaceSlimeTick(1/60);
    var first = saveBuild();
    saveApply(JSON.parse(JSON.stringify(first))); surfaceSlimeTick(1/60);
    var second = saveBuild();
    return {oldBodies:oldBodies,shore:world[shoreR][col],buried:world[buriedR][col],
      glass:jelloBodies.filter(function (b) { return !b.surfaceSlime && !b.guest; }).length,
      residents:second.surfaceSlimes.residents.length,
      ids:second.surfaceSlimes.residents.map(function (s) { return s.id; }).join(',') ===
        env.surfaceSlimes.residents.map(function (s) { return s.id; }).join(','),
      sky:skySlimes.some(function (s) { return s.id === rock.id; }),
      money:money,cargo:JSON.stringify(cargo) === JSON.stringify(env.cargo),
      dug:world[buriedR][col+1] === null && terrainClearedKinds[buriedR+':'+(col+1)] === 'stone',
      ponds:JSON.stringify(second.ponds) === JSON.stringify(env.ponds),
      legacyField:Object.prototype.hasOwnProperty.call(second,'jello')};
  })()`);
  console.log('LEGACY SAVE', migrated);
  check('legacy plain/typed tiles and activated glass bodies are removed',
    migrated.oldBodies === 2 && migrated.shore === null && migrated.buried === null && migrated.glass === 0);
  check('reload keeps resident identities, sky visitor, money, cargo, dug terrain and ponds',
    migrated.residents === 5 && migrated.ids && migrated.sky && migrated.money === 4321 &&
    migrated.cargo && migrated.dug && migrated.ponds && !migrated.legacyField);
  await game('render()');
  check('browser reports no runtime errors', errors.length === 0);
  console.log('PASS slime-spawn removal and save migration');
} finally { cleanup(); }
