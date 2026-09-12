// Run: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tools/audio/test-sfx.mjs
// The harness owns and closes only its Chrome for Testing process.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const bank = JSON.parse(await readFile(path.join(root, 'assets/sfx/bank.json')));
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.m4a': 'audio/mp4', '.wav': 'audio/wav' };
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name === '/__sfx-test') {
      res.setHeader('Content-Type', 'text/html');
      return res.end('<!doctype html><body><button>Start audio</button><script src="/js/audio.js"></script>');
    }
    const filename = path.resolve(root, '.' + name);
    if (!filename.startsWith(root)) { res.writeHead(403); return res.end(); }
    let data = await readFile(filename);
    if (name === '/js/audio.js') data = Buffer.from(data.toString().replace('function playSfx(name, opts) {',
      'function playSfx(name, opts) { window.__sfxCalls.push({name:name, gain:opts && opts.gain});'));
    // Game state access exists only in this test server's response, never the shipped bundle.
    if (name === '/js/sluice.js') data = Buffer.from(data.toString().replace(/\}\)\(\);\s*$/, `
      window.__sfxGameTest = {
        state: function () { return { x: player.x, y: player.y, paused: gamePaused, drilling: !!drilling, shop: shopState, version: GAME_VERSION }; },
        place: function (depth) { player.x = 90 * TILE; player.y = (SKY_ROWS + depth) * TILE; player.vx = player.vy = 0; player.hull = getMaxHull(); player.fuel = maxFuel; shopState = 'closed'; shopOpen = false; audioUpdate(0.016); },
        drill: function (type) { var r = Math.floor(player.y/TILE) + 1, c = Math.floor(player.x/TILE); world[r][c] = {type:type, hp:1}; keys['ArrowDown'] = true; drilling = {r:r,c:c,timer:.8,hitTime:.8,dirVec:'d'}; },
        shopAudio: function () { shopState = 'floor'; audioUpdate(.016); shopState = 'closed'; },
        die: function () { gameOver = true; audioUpdate(.016); },
        revive: function () { gameOver = false; audioUpdate(.016); }
      };
      window.__sfxGameTest.contact = function (opts) {
        var r = SKY_ROWS + 12, c = 90;
        gameOver = gameWon = shopOpen = ledgerOpen = false; shopState = 'closed';
        keys = {}; dpad.left = dpad.right = dpad.up = dpad.down = false;
        drilling = null; hitPauseT = drillBlockMsgCool = 0;
        player.drillCooldownT = player.drillGlideT = player.slideAssistT = 0;
        player.slideTargetX = null; player.thrustSpool = player.jetBufferT = 0;
        player.onGround = player.onCeiling = player.onJello = false;
        player.airTime = 1; player.jelloGroundT = 0; player.hull = opts.lethal ? 1 : getMaxHull(); player.fuel = maxFuel;
        player.x = c * TILE + (TILE - PLAYER_W) / 2; player.y = r * TILE - PLAYER_H;
        player.vx = 0; player.vy = opts.vy || 0; cargo = [];
        for (var rr = r - 3; rr <= r; rr++) for (var cc = c - 2; cc <= c + 2; cc++) {
          world[rr][cc] = rr === r ? {type:'foundation', hp:999999} : null;
        }
        if (opts.vy) player.y -= 1;
        if (opts.dir) {
          while (cargoUsed() < maxCargo) cargo.push({type:'coal'});
          var tr = r, tc = c;
          if (opts.dir === 'Left') { tr = r - 1; tc--; player.x = c * TILE; }
          if (opts.dir === 'Right') { tr = r - 1; tc++; player.x = (c + 1) * TILE - PLAYER_W; }
          if (opts.dir === 'Up') { tr = r - 2; upgrades.vertLevel = 1; player.y = (r - 1) * TILE; }
          world[tr][tc] = {type:opts.type || 'coal', hp:3};
          keys['Arrow' + opts.dir] = true;
        }
        window.__sfxCalls = [];
        var oldDev = devMode; if (opts.lethal) devMode = false;
        try { for (var i = 0; i < (opts.frames || 1); i++) { update(.016); audioUpdate(.016); } }
        finally { devMode = oldDev; }
        return {calls:window.__sfxCalls, drilling:!!drilling, hull:player.hull, dead:gameOver,
          tile:opts.dir ? world[tr][tc] : null};
      };
      window.__sfxGameTest.flightInput = function (dirs, fuel) {
        gameOver = gameWon = shopOpen = ledgerOpen = false; shopState = 'closed';
        keys = {}; dirs.forEach(function (d) { keys['Arrow' + d] = true; });
        drilling = null; hitPauseT = 0; player.drillGlideT = 0; player.slideTargetX = null;
        player.x = 90 * TILE; player.y = (SKY_ROWS - 20) * TILE;
        player.vx = player.vy = player.thrustSpool = 0; player.fuel = fuel ? maxFuel : 0;
        player.hull = getMaxHull(); reserveFuel = 0;
        player.onGround = player.onJello = false;
        var original = SluiceAudio.flight, state;
        SluiceAudio.flight = function (st) { state = st; original(st); };
        window.__sfxCalls = [];
        try { update(.016); } finally { SluiceAudio.flight = original; }
        return {spool:state.spool, calls:window.__sfxCalls};
      };
      window.__sfxGameTest.waterAudio = function () {
        var original = playerWaterCushion;
        window.__sfxCalls = [];
        try {
          playerWaterCushion = function () { return 1; }; audioUpdate(.1);
          playerWaterCushion = function () { return 0; }; audioUpdate(.1);
        } finally { playerWaterCushion = original; }
        return window.__sfxCalls;
      };
    })();`));
    res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_FOR_TESTING || '/Users/ethan/.local/bin/agent-chrome-for-testing', headless: true,
    args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--mute-audio'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  await context.addInitScript(() => {
    window.__sfxCalls = [];
    window.__oscStarts = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) { window.__oscStarts++; return start.apply(this, args); };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function(dest, ...args) {
      if (dest === this.context.destination) {
        const analyser = this.context.createAnalyser(); analyser.fftSize = 2048;
        window.__meter = analyser;
        connect.call(analyser, dest);
        return connect.call(this, analyser, ...args);
      }
      return connect.call(this, dest, ...args);
    };
    window.__peak = () => { const a = new Float32Array(2048); window.__meter.getFloatTimeDomainData(a); return Math.max(...a.map(Math.abs)); };
  });
  const page = await context.newPage();
  const errors = [], missing = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().includes('/assets/sfx/') && !r.ok()) missing.push(r.url()); });
  await page.goto(origin + '/__sfx-test');
  await page.getByRole('button').click();
  await page.waitForFunction(n => SluiceAudio.sfxLoadedCount() === n, bank.sounds.length, { timeout: 60000 });
  assert.deepEqual(missing, []);
  console.log('Loaded all', bank.sounds.length, 'variants through the production loader');
  const decode = await page.evaluate(async sounds => {
    const ctx = new OfflineAudioContext(1, 1, 24000), results = [];
    for (const s of sounds) {
      const buf = await ctx.decodeAudioData(await (await fetch('/assets/sfx/' + s.file)).arrayBuffer());
      const x = buf.getChannelData(0);
      let peak = 0, energy = 0, delta = 0, finite = true;
      for (let i=0; i<x.length; i++) { peak = Math.max(peak, Math.abs(x[i])); energy += x[i]*x[i]; finite &&= Number.isFinite(x[i]); if(i) delta = Math.max(delta, Math.abs(x[i]-x[i-1])); }
      results.push({ file: s.file, channels: buf.numberOfChannels, duration: buf.duration, peak, rms: Math.sqrt(energy/x.length), finite,
        onset: x.findIndex(v => Math.abs(v) > .002) / buf.sampleRate, seam: Math.abs(x[x.length-1]-x[0]), maxDelta: delta, loop: s.loop });
    }
    return results;
  }, bank.sounds);
  for (const s of decode) {
    assert(s.finite && s.channels === 1 && s.peak < .8 && s.rms > .0001, JSON.stringify(s));
    if (!s.loop) assert(s.onset < .04, 'Delayed transient: ' + JSON.stringify(s));
    if (s.loop) assert(s.seam <= s.maxDelta * 1.1, 'Loop edge spike: ' + s.file);
  }
  console.log('Decoded bank: mono, finite, non-silent, headroom retained, seamless loop edges');
  await page.evaluate(() => { SluiceAudio.setMusicVolume(0); SluiceAudio.setVolume(.6); });
  const pairs = await page.evaluate(() => {
    let previous = null, repeats = 0;
    for (let i=0;i<80;i++) { const v = SluiceAudio.playSfx('drill-break-stone'); if(v.src.buffer === previous) repeats++; previous = v.src.buffer; }
    return {repeats, count:SluiceAudio.sfxStatus().voices};
  });
  assert.equal(pairs.repeats, 0); assert(pairs.count <= 24);
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => SluiceAudio.sfxStatus().voices), 0);
  await page.evaluate(() => { SluiceAudio.sfx.drill.start('malachite'); SluiceAudio.sfx.drill.setProgress(.7); });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => SluiceAudio.sfxStatus().drill), 'crystal');
  assert(await page.evaluate(() => __peak()) > .002);
  await page.waitForTimeout(500);
  assert(await page.evaluate(() => __peak()) < .0001, 'Modal stranded the drill');
  await page.evaluate(() => SluiceAudio.sfx.drill.setProgress(.8));
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => __peak()) > .002, 'Drill failed to wake');
  await page.evaluate(() => SluiceAudio.setPaused(true));
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => SluiceAudio.sfxStatus().drill), null);
  assert(await page.evaluate(() => __peak()) < .0001);
  await page.evaluate(() => { SluiceAudio.setPaused(false); SluiceAudio.sfxLoop('rig-drive'); });
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => __peak()) > .001);
  await page.waitForTimeout(500);
  assert(await page.evaluate(() => __peak()) < .0001, 'Unattended loop leaked');
  await page.evaluate(() => { SluiceAudio.setSfxVolume(0); SluiceAudio.setMusic('town'); SluiceAudio.setTimeOfDay(1); });
  await page.waitForTimeout(700);
  await page.evaluate(() => SluiceAudio.playSfx('bomb-large'));
  await page.waitForTimeout(80);
  assert(await page.evaluate(() => __peak()) < .0001, 'Music or SFX mute bypassed');
  await page.evaluate(() => { SluiceAudio.setSfxVolume(1); SluiceAudio.setMusic(null); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { for(let i=0;i<40;i++) SluiceAudio.playSfx('bomb-large'); });
  await page.waitForTimeout(65);
  assert(await page.evaluate(() => __peak()) < .99, 'Stacked bombs clipped');
  console.log('Mix: no repeat variants, 24-voice cap, audible drill, pause silence, loop watchdog, independent music/SFX mute, blast headroom');

  await page.waitForTimeout(2700);
  await page.evaluate(() => {
    window.__flightState = {air:true, speed:900, cap:400, spool:0, climb:-900, fx:{}};
    window.__flightTimer = setInterval(() => SluiceAudio.flight(__flightState), 25);
  });
  for (const climb of [-900, 0, 600]) {
    await page.evaluate(climb => { __flightState.climb = climb; __flightState.fx.landN = 1; }, climb);
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => __peak()) < .0001, 'Passive flight or legacy landing counter made noise: ' + climb);
  }
  await page.evaluate(() => { __flightState.spool = 1; });
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => __peak()) > .001, 'Shared jet is silent under thrust');
  const starts = await page.evaluate(() => __oscStarts);
  await page.evaluate(() => { __flightState.fx.igniteN = 10; __flightState.climb = 0; });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => __oscStarts), starts, 'Adding lift/direction retriggered ignition');
  const jetLevels = [];
  for (const speed of [0, 150, 900]) {
    await page.evaluate(speed => { __flightState.speed = __flightState.climb = speed; }, speed);
    await page.waitForTimeout(250);
    jetLevels.push(await page.evaluate(async () => {
      const x = new Float32Array(2048);
      let energy = 0, peak = 0;
      for (let i = 0; i < 24; i++) {
        __meter.getFloatTimeDomainData(x);
        for (const v of x) { energy += v*v; peak = Math.max(peak, Math.abs(v)); }
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      return {db:10*Math.log10(energy/(24*x.length)), peak};
    }));
  }
  assert(Math.max(...jetLevels.map(s=>s.db)) - Math.min(...jetLevels.map(s=>s.db)) < 1,
    'Jet grows louder with airspeed/climb: ' + JSON.stringify(jetLevels));
  assert(Math.max(...jetLevels.map(s=>s.peak)) < .05, 'Jet is louder than a subtle background cue: ' + JSON.stringify(jetLevels));
  console.log('Quiet jet at rest, moderate climb and fast climb:', JSON.stringify(jetLevels));
  await page.evaluate(() => { __flightState.spool = 0; });
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => __peak()) < .0001, 'Releasing the jet left a falling sound');
  await page.evaluate(() => clearInterval(__flightTimer));
  console.log('Flight: silent coasting and free fall, audible shared thrust, no second ignition or landing layer');

  await page.goto(origin + '/grand-motherload.html?dev=1&nosave=1');
  await page.waitForFunction(() => window.gm && window.__sfxGameTest, null, { timeout: 60000 });
  await page.locator('#gm-pause-btn').click();
  await page.waitForFunction(() => document.querySelector('#game-pause').classList.contains('is-visible'));
  assert.equal(await page.locator('#gm-vol').inputValue(), '60');
  assert.equal(await page.locator('#gm-musicvol').inputValue(), '65');
  await page.locator('#gm-resume-btn').click();
  await page.waitForFunction(n => SluiceAudio.sfxLoadedCount() === n, bank.sounds.length, {timeout:60000});
  await page.evaluate(() => { SluiceAudio.setMusicVolume(0); __sfxGameTest.place(12); __sfxGameTest.drill('stone'); });
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => SluiceAudio.sfxStatus().drill), 'stone');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => SluiceAudio.sfxStatus().paused), true);
  assert.equal(await page.evaluate(() => SluiceAudio.sfxStatus().drill), null);
  assert(await page.evaluate(() => __peak()) < .0001, 'Real pause leaked SFX');
  await page.locator('#gm-options-btn').click();
  await page.locator('#gm-musicvol').fill('0');
  await page.locator('#gm-musicvol').dispatchEvent('input');
  assert.equal(await page.evaluate(() => localStorage.getItem('sluice.opt.musicvol')), '0');
  if (process.env.SFX_SCREENSHOT) {
    await page.setViewportSize({width:390,height:844});
    await page.locator('#gm-musicvol').scrollIntoViewIfNeeded();
    await page.locator('#game-pause').screenshot({path:process.env.SFX_SCREENSHOT});
    await page.setViewportSize({width:1280,height:850});
  }
  await page.locator('#gm-opt-back').click();
  await page.locator('#gm-resume-btn').click();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => SluiceAudio.sfxStatus().paused), false);
  for (const [depth, expected] of [[12,'shallow'], [90,'mid'], [210,'deep'], [290,'magma'], [0,'surface-']]) {
    const zone = await page.evaluate(depth => { __sfxGameTest.place(depth); return SluiceAudio.sfxStatus().zone; }, depth);
    assert(zone.startsWith(expected), `depth ${depth}: ${zone}`);
  }
  const lifecycle = await page.evaluate(() => { __sfxGameTest.shopAudio(); const shop=SluiceAudio.sfxStatus().zone; __sfxGameTest.die(); const death=SluiceAudio.sfxStatus(); __sfxGameTest.revive(); return {shop,death,revived:SluiceAudio.sfxStatus().zone}; });
  assert.equal(lifecycle.shop,'station'); assert.equal(lifecycle.death.zone,null); assert.equal(lifecycle.death.drill,null); assert(lifecycle.revived);
  for (const dir of ['Down', 'Left', 'Right', 'Up']) {
    const blocked = await page.evaluate(dir => __sfxGameTest.contact({dir, frames:40}), dir);
    assert.equal(blocked.drilling, false, dir + ': full cargo allowed mining');
    assert.equal(blocked.tile.hp, 3);
    assert.equal(blocked.calls.filter(c => c.name === 'cargo-full').length, 1, JSON.stringify({dir,blocked}));
    assert.equal(blocked.calls.find(c => c.name === 'cargo-full').gain, .65);
    assert(!blocked.calls.some(c => c.name === 'drill-bounce'), 'Cargo block played the hard barrier clank');
  }
  const rubble = await page.evaluate(() => __sfxGameTest.contact({dir:'Down', type:'dirt', frames:5}));
  assert(rubble.drilling && !rubble.calls.some(c => c.name === 'cargo-full'), 'Full cargo incorrectly blocked rubble: ' + JSON.stringify(rubble));
  for (const [vy, cue, lethal] of [[120,'land-soft',false], [250,'land-hard',false], [400,'land-damage',false], [700,'land-damage',true]]) {
    const contact = await page.evaluate(opts => __sfxGameTest.contact(opts), {vy, lethal, frames:3});
    assert.deepEqual(contact.calls.filter(c => c.name.startsWith('land-') || c.name === 'hull-hit').map(c => c.name), [cue]);
    assert.equal(contact.dead, lethal, JSON.stringify({vy,contact}));
  }
  for (const dirs of [['Left'], ['Right'], ['Up','Left'], ['Up','Right']]) {
    const flight = await page.evaluate(dirs => __sfxGameTest.flightInput(dirs, true), dirs);
    assert.equal(flight.spool, 1, 'Lateral thrust did not drive the shared jet');
    assert(!flight.calls.some(c => c.name === 'air-pulse'));
  }
  assert.equal((await page.evaluate(() => __sfxGameTest.flightInput(['Left'], false))).spool, 0);
  assert.equal((await page.evaluate(() => __sfxGameTest.flightInput(['Left','Right'], true))).spool, 0);
  const water = await page.evaluate(() => __sfxGameTest.waterAudio());
  assert(!water.some(c => c.name.startsWith('liquid-')));
  console.log('Contacts: one quiet cargo cue in all four directions with no held-input spam, rubble still mines, single graded landing including fatal falls, unified lateral jet, silent water');
  await page.evaluate(() => localStorage.setItem('sluice.volume','0'));
  await page.reload();
  await page.waitForFunction(() => window.gm, null, {timeout:60000});
  assert.equal(await page.locator('#gm-vol').inputValue(),'0');
  assert.equal(await page.locator('#gm-musicvol').inputValue(),'0');
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  console.log('Game: clean boot, mining hook, pause/resume, zone progression, shop/death/revive, saved mute and music preference');
  console.log('PASS', JSON.stringify({sounds:decode.length, keys:new Set(bank.sounds.map(s=>s.key)).size, largestDecodedPeak:Math.max(...decode.map(s=>s.peak)), bytes:bank.sounds.reduce((n,s)=>n+s.bytes,0)}));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
