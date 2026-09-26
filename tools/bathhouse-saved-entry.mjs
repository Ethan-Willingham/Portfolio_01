// Optional real-save replay in the workshop harness's disposable browser profile.
// BATH_SAVE=/absolute/path/to/local-save.json node tools/bathhouse-workshop-smoke.mjs
// The fixture remains local and is never included in the repository.
export async function savedBathEntry({ fixture, game, ev, send, sleep, check, screenshot, press, button }) {
  const rects = await game('BATH_FLOORS.flatMap(F=>F.tubs.map(t=>[t[0]*TILE,(F.fr-F.lip-1)*TILE,(t[1]+1)*TILE,(F.fr+F.sink+1)*TILE]))');
  const migrated = [0, 0, 0, 0, 0];
  for (const bin of Object.values(fixture.mineralLiquids.parked)) {
    for (let i = 0; i < bin.length; i += 3) {
      if (rects.some(([x0,y0,x1,y1])=>bin[i+1]>=x0&&bin[i+1]<x1&&bin[i+2]>=y0&&bin[i+2]<y1)) migrated[bin[i]]++;
    }
  }
  check('fixture exercises old saved bath water', fixture.bathhouse.version < 7 && migrated[0] > 3600);
  const expected = migrated.map((n,t)=>n+(fixture.bathhouse.silos.pending[t]||0)+(fixture.siphon.tank[t]||0)+(fixture.bathhouse.supplies[t]||0)+(t===0?fixture.bathhouse.pour||0:0));
  for (const tank of fixture.bathhouse.silos.tanks) if (tank.type >= 0) expected[tank.type] += tank.count;
  const storage = () => game('Array.from({length:5},(_,t)=>bathLiquidCount(t))');
  check('actual save migrates every old bath particle into stored supply', JSON.stringify(await storage()) === JSON.stringify(expected));
  console.log('RECOVERED_LITRES', migrated.map(n=>n/100));
  await game('bathEnter()'); await sleep(1200);
  check('actual save enters with a dry bath and closed hose', await game('bathMode&&!bathFading&&bathBasinCount()===0&&!bathTool.valve&&!bathTool.spraying'));
  await sleep(2200);
  check('developer mode idle does not add water', await game('devMode&&bathBasinCount()===0') && JSON.stringify(await storage()) === JSON.stringify(expected));
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;bathGuests=[];skySlimes=[];bathNoticeT=0;render();');
  await screenshot('saved-bath-dry');
  await game('setDevMode(false);render()');
  check('version and FPS are drawn in normal play', await game(`(function(){var seen=[],original=hearthText;try{hearthText=function(){seen.push(arguments[1]);return original.apply(this,arguments);};bathDrawServiceHUD();}finally{hearthText=original;}return seen.includes(GAME_VERSION)&&seen.includes((perfFps||0)+' FPS');})()`));
  await press(button('hose'));
  check('selecting the hose does not fill the tub', await game('bathBasinCount()===0&&!bathTool.valve'));
  await press(button('tool-valve'));
  for (let i=0;i<240;i++) {
    await game('bathToolTick(1/60);updateLiquids(1/60);');
    await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
  }
  await press(button('tool-valve'));
  for (let i=0;i<120;i++) {
    await game('bathToolTick(1/60);updateLiquids(1/60);');
    await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
  }
  await game('liquidToolSync();bathWater=bathBasinCount();render();');
  const poured = await game('bathBasinCount()');
  const afterPour = await storage();
  check('manual hose creates real water and debits recovered stock', poured > 3600 && expected[0]-afterPour[0]===poured);
  await screenshot('saved-bath-hosed');
  // Save through the actual game serializer, then boot the same isolated profile.
  await game("localStorage.setItem(SAVE_KEY_A,JSON.stringify(saveBuild()));localStorage.removeItem(SAVE_KEY_B);SAVE_DISABLED=true;");
  await send('Page.reload');
  await sleep(250);
  for (let i=0;i<300;i++) {
    if (await ev(`typeof __hearthTest==='function'&&__hearthTest("introPhase==='done'")`)) break;
    await sleep(100);
  }
  check('version 7 reload preserves manually poured water and remaining stock', await game('introPhase===\'done\'&&bathBasinCount()')===poured && JSON.stringify(await storage())===JSON.stringify(afterPour));
  await ev("document.body.classList.add('gm-fs');document.body.appendChild(document.querySelector('.game-wrapper'));window.dispatchEvent(new Event('resize'));window.scrollTo(0,0)");
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;setDevMode(false);bathEnter();');
  await sleep(300);
  const pendingWater = () => game('(function(){var F=BATH_FLOORS[0],t=F.tubs[0];return mineralLiquidParkedSampleRect(t[0]*TILE,(F.fr-F.lip-1)*TILE,(t[1]+1)*TILE,(F.fr+F.sink+1)*TILE)[0];})()');
  check('saved water waits until the room is visible', await game('bathMode&&bathFading&&bathBasinCount()')===poured && await pendingWater()===poured);
  await sleep(250);
  let previousPending=poured, intermediate=false;
  for (let frame=1;frame<=180;frame++) {
    await game('liquidToolSync();mineralLiquidTick(1/60);bathOperationsTick(1/60);bathToolTick(1/60);updateLiquids(1/60);render();');
    await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
    const pending=await pendingWater();
    checkQuiet(pending<=previousPending, 'pending saved water only decreases');
    if (pending>0&&pending<poured) intermediate=true;
    previousPending=pending;
    if ([18,42,72,108,144,180].includes(frame)) await screenshot(`water-return-${frame}`);
  }
  check('saved water visibly reconstructs over many frames',intermediate && previousPending===0);
  check('arrival reflections retire after the water returns', await game('bathArrival===null'));
  check('reentry adds no extra water and closes the hose', await game('!bathFading&&!bathTool.valve&&!bathTool.spraying&&bathBasinCount()')===poured && JSON.stringify(await storage())===JSON.stringify(afterPour));
  await game('lastTime=performance.now();gameRafId=requestAnimationFrame(loop);');
  await sleep(1500);
  const settledFps=await game('perfFps');
  await game('bathArrivalBegin();');
  await sleep(1100);
  check('normal game loop shows the arrival in progress',await game('!!bathArrival&&bathArrival.some(r=>r.emitted>0&&r.remaining>0)'));
  console.log('ARRIVAL_FPS', {settled:settledFps,restoring:await game('perfFps')});
  await screenshot('water-return-live');
  await sleep(2200);
  check('normal game loop finishes the reveal without extra water',await game('bathArrival===null&&bathBasinCount()')===poured);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;');
  for (const [width,height] of [[1280,900],[667,375],[320,568]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000});
    await sleep(150);await game('resize();bathCamY=-1;updateCamera();updateLiquids(1/60);render();');
    await screenshot(`saved-bath-hud-${width}x${height}`);
  }
}
function checkQuiet(condition, label) { if (!condition) throw new Error(label); }
