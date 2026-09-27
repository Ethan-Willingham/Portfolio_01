// Real GPU water rises over the curved rim while a finite hose keeps pouring.
export async function bathOverflow({ game, sleep, check, screenshot, press, button }) {
  await game('bathEnter()'); await sleep(750);
  await game(`cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;bathFading=false;
    bathGuests=[];skySlimes=[];skySlimeNext=1e9;bathNoticeT=0;hearthReset();setDevMode(false);render();`);
  check('overflow probe starts in a dry bath', await game('bathBasinCount()===0'));
  check('both visible rim exits have no hidden terrain step', await game(`(function(){
    var F=BATH_FLOORS[0],c=bathTubCurve(F,F.tubs[0]);
    return !liquidWorldSolidAt(c.x0-10,c.y0-3)&&!liquidWorldSolidAt(c.x1+10,c.y0-3);
  })()`));
  const seeded = await game(`(function(){
    liquidCount=0;liquidOps.length=0;liquidMutationSeq++;mineralLiquidParked={};bathSiloReset();bathLostWater=0;
    var c=bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]),step=LIQUID_CELL*LIQUID_PDELTA;
    for(var x=c.x0+step;x<c.x1-step;x+=step){
      var floor=c.y0+c.depthAt(x)-4.5*Math.hypot(1,bathCurveSlope(c,x));
      for(var y=c.y0+3;y<floor;y+=step)addLiquidParticle(0,x,y,0,0,0);
    }
    bathWater=bathBasinCount();bathThermalReset();bathThermalSample();bathArmHeat();
    bathSiloQueue(0,100000,20);return liquidCount;
  })()`);
  check('near-full physical basin already exceeds the retired 450 L cutoff', seeded > 45000 && seeded < 100000);

  async function tick() {
    await game('liquidToolSync();bathToolTick(1/60);bathOperationsTick(1/60);updateLiquids(1/60);render();');
    await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
  }
  const snapshot = async () => game(`(async function(){
    var g=liquidWGPU,n=g.uploadedCount,b=g.device.createBuffer({size:Math.max(16,n*16),usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{var e=g.device.createCommandEncoder();e.copyBufferToBuffer(g.buf.pos,0,b,0,n*16);g.device.queue.submit([e.finish()]);
      await b.mapAsync(GPUMapMode.READ);var p=new Float32Array(b.getMappedRange()),F=BATH_FLOORS[0],c=bathTubCurve(F,F.tubs[0]);
      var outside=0,above=0,beyond=0,cx=(c.x0+c.x1)/2;
      for(var i=0;i<n;i++){var x=p[i*4],y=p[i*4+1];
        if(x<c.x0-120||x>c.x1+120||y<c.y0-100||y>F.fr*TILE+10)continue;
        if((x<c.x0||x>c.x1)&&y>=c.y0-8&&y<F.fr*TILE-5)outside++;
        if(x>c.x0&&x<c.x1&&Math.abs(x-cx)>80&&y<c.y0-3)above++;
        if(x<c.x0||x>c.x1)beyond++;
      }
      return{live:n,aboveRim:above,fallingOverRim:outside,beyondRim:beyond,lost:bathLostWater,stock:bathLiquidCount(0),water:bathWater};
    }finally{b.unmap();b.destroy();}
  })()`);
  for (let frame = 0; frame < 90; frame++) await tick();
  const before = await snapshot(); console.log('OVERFLOW_SETTLED', before);
  await screenshot('overflow-before-hose');
  await press(button('hose')); await press(button('tool-valve'));
  let maxAbove = 0, maxOutside = 0;
  for (let frame = 1; frame <= 480; frame++) {
    await tick();
    if (frame % 60 === 0) {
      const state = await snapshot();
      maxAbove = Math.max(maxAbove, state.aboveRim); maxOutside = Math.max(maxOutside, state.fallingOverRim);
      console.log('OVERFLOW_FRAME', frame, state);
      if (frame === 240 || frame === 480) await screenshot('overflow-hose-' + frame);
    }
  }
  const during = await snapshot();
  check('the hose keeps accepting water above the former bath capacity', during.stock < 78000 && during.water > 45000);
  check('real water rises above the rim away from the incoming jet', maxAbove > 20);
  check('real water crosses the curved lips and falls outside the vessel', maxOutside > 0 && during.lost > before.lost + 20);
  check('overflow never closes the user-opened valve', await game('bathTool.valve'));
  await press(button('tool-valve'));
  for (let frame = 0; frame < 180; frame++) await tick();
  const saved = await game(`(function(){
    var service=bathServiceSave(),liquids=mineralLiquidSave(),count=0,spills=0;
    Object.values(liquids.parked).forEach(function(data){for(var i=0;i<data.length;i+=3){count++;if(bathFloorAt(data[i+1],data[i+2]))spills++;}});
    return{lost:service.lost,saved:count,stock:bathLiquidCount(0),spills:spills};
  })()`);
  console.log('OVERFLOW_FINAL', { seeded, ...saved, maxAbove, maxOutside });
  check('every accepted drop remains in the bath or is recorded as permanently spilled', seeded + 100000 - saved.stock === saved.saved + saved.lost);
  check('floor spills are absent from the liquid save and cannot return on entry', saved.spills === 0 && saved.lost > 0);
  await screenshot('overflow-settled-after-hose');
}
