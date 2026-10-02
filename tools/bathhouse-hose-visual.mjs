// Actual rendered water and conserved basin readings in a bordered phone view.
export async function bathHoseVisual({ game, ev, send, sleep, check, screenshot, press, button }) {
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await ev(`document.body.classList.remove('gm-fs');var wrap=document.querySelector('.game-wrapper');
    wrap.style.cssText='position:fixed;left:12px;top:12px;width:820px;max-width:none;margin:0;';
    for(var el of wrap.querySelectorAll('.game-header,.game-controls-info'))el.style.display='none';
    wrap.querySelector('.game-canvas-area').style.height='366px';window.scrollTo(0,0);window.dispatchEvent(new Event('resize'));`);
  await sleep(150);
  await game('isMobile=true;resize();bathEnter();'); await sleep(750);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;bathFading=false;bathGuests=[];skySlimes=[];skySlimeNext=1e9;bathNoticeT=0;setDevMode(false);bathToolReset();bathSiloReset();liquidCount=0;liquidOps.length=0;liquidMutationSeq++;siphon.tank[0]=16000;bathWater=0;updateCamera();render();');
  check('bordered phone uses the integrated desktop bath without tabs',await game('!hearthRoomLayout().mobile && hearthRoomLayout().wide && !hearthRoomLayout().landscape && !hearthRoomLayout().dock && hearthCasingProfile(hearthRoomLayout().box,true).roof.length>2 && !hearthButtons.some(b=>b.action.indexOf(\'panel:\')===0)'));
  await press(button('hose'), true);
  const points = await game(`(function(){var t=bathTool,L=hearthRoomLayout(),r=canvas.getBoundingClientRect();
    function client(x,y){return{x:r.left+(x-cam.x)*dpr*worldScale*r.width/canvas.width,y:r.top+(y-cam.y)*dpr*worldScale*r.height/canvas.height};}
    return{head:client(t.x,t.y),high:{x:r.left+(L.scene.x+L.scene.w/2)*r.width/(canvas.width/dpr),y:r.top+(L.scene.y+50)*r.height/(canvas.height/dpr)}};
  })()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points.head, id: 3 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...points.high, id: 3 }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await game('for(var i=0;i<150;i++)bathToolTick(1/60);render();');
  console.log('HIGH_AIM', await game('({tool:{x:bathTool.x,y:bathTool.y,target:bathTool.ty},bounds:bathToolBounds(),curve:bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]),cam:cam,scale:worldScale,dpr:dpr})'));
  await press(button('tool-valve'), true);
  for (let frame=0; frame<120; frame++) {
    await game('liquidToolSync();bathToolTick(1/60);mineralLiquidTick(1/60);bathOperationsTick(1/60);updateLiquids(1/60);render();');
    await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
  }
  await press(button('tool-valve'), true);
  for (let frame=0; frame<180; frame++) {
    await game('liquidToolSync();bathToolTick(1/60);mineralLiquidTick(1/60);bathOperationsTick(1/60);updateLiquids(1/60);render();');
    await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
  }
  // Mobile browser chrome can change the visible canvas after a pour.
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 340, deviceScaleFactor: 3, mobile: true });
  await ev("document.querySelector('.game-canvas-area').style.height='316px';window.dispatchEvent(new Event('resize'));");
  await sleep(150); await game('resize();updateCamera();bathOperationsTick(.2);render();');
  await screenshot('phone-bordered-dpr3-hose');
  const report = await game(`(function(){render();var g=liquidWGPU,c=bathToolBounds().curve,v=g.renderParamsHost,r=canvas.getBoundingClientRect(),gr=g.renderCanvas.getBoundingClientRect();
    var cv=document.createElement('canvas');cv.width=g.renderCanvas.width;cv.height=g.renderCanvas.height;var ctx=cv.getContext('2d');ctx.drawImage(g.renderCanvas,0,0);var data=ctx.getImageData(0,0,cv.width,cv.height).data;
    var colored=0,cavity=0,above=0,minY=Infinity,maxY=-Infinity;
    for(var y=0;y<cv.height;y++)for(var x=0;x<cv.width;x++){var i=(y*cv.width+x)*4;
      if(data[i+3]<40||data[i+2]<data[i]*1.25||data[i+2]<data[i+1]*1.05)continue;
      var wx=cam.x+x/(dpr*worldScale),wy=cam.y+y/(dpr*worldScale);colored++;minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      if(wx>=c.x0-6&&wx<=c.x1+6&&wy>=c.y0-5&&wy<=c.y0+c.depthAt(wx)+7)cavity++;
      if(wy<c.y0-20)above++;
    }
    return{colored:colored,cavity:cavity,above:above,minY:minY,maxY:maxY,water:bathWater,basin:bathBasinCount(),spent:16000-bathLiquidCount(0),lost:bathLostWater,
      rect:r.toJSON(),gpuRect:gr.toJSON(),view:[v[0],v[1],v[2],v[3],v[4]],expected:[cam.x,cam.y,dpr*worldScale,canvas.width,canvas.height]};
  })()`);
  console.log('PHONE_LIQUID_PIXELS', report);
  check('DPR 3 bordered canvas and water share the same screen rectangle', ['x','y','width','height'].every(k=>Math.abs(report.rect[k]-report.gpuRect[k])<0.05));
  check('DPR 3 renderer uses the live main-camera transform', report.view.every((n,i)=>Math.abs(n-report.expected[i])<0.01));
  check('settled visible water occupies the drawn copper cavity', report.colored>100 && report.cavity>report.colored*0.97 && report.above===0);
  check('visible settled water agrees with the basin meter and finite stock', report.water===report.basin && report.water>4000 && report.spent===report.water+report.lost);
  await game("bathToolReset();bathGuests=[];bathGuestAccept(skySlimeFresh(0,0));bathGuestAccept(skySlimeFresh(0,0));bathGuests.forEach(g=>{g.hop=null;g.st='wait';g.s.x=(g.slot?22.5:20.75)*TILE;});hearthReset();forgeGive('coal',3);for(var i=0;i<3;i++)hearthDropMaterial('boiler',HEARTH_WIDTH/2+(i-1)*62,110,'coal');for(var i=0;i<240;i++)hearthStepBed(hearthBeds.boiler);hearthBeds.boiler.chunks.forEach(b=>hearthLightChunk(hearthBeds.boiler,b));updateCamera();render();");
  for (let frame=0; frame<180; frame++) {
    await game('hearthRoomTick(1/60);updateLiquids(1/60);render();');
    await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
  }
  await screenshot('phone-bordered-dpr3-working-bath');
  check('representative phone scene contains two waiting guests and physical burning fuel', await game("!bathTool.mode&&bathGuests.length===2&&bathGuests.every(g=>g.st==='wait')&&hearthBeds.boiler.chunks.some(b=>b.lit)&&bathWater>4000"));
  check('the same view contains both waiting guests and the desktop flanking controls',await game(`(function(){var L=hearthRoomLayout();return bathGuests.every(g=>{var x=(g.s.x-cam.x)*worldScale,y=(g.s.y-cam.y)*worldScale,r=g.s.r*worldScale;return x-r>=0 && x+r<=L.w && y-r>=0 && y+r<=L.h;}) &&
    ['fuels','pump','strike','ash','claw','hose','liquids'].every(action=>hearthButtons.some(b=>b.action===action)) && !L.mobile && !L.landscape && !L.dock;
  })()`));
  const recovery = await game(`(function(){var stored=[0,1,2,3,4].map(bathLiquidCount),main=bathBasinCount(),F=BATH_FLOORS[1],c=bathTubCurve(F,F.tubs[0]);
    for(var i=0;i<160;i++)addLiquidParticle(i<90?0:2,(c.x0+c.x1)/2+(i%20-10)*1.25,c.y0+c.D-10-Math.floor(i/20)*1.25,0,0,0);
    bathArrivalBegin();return{mainBefore:main,mainAfter:bathBasinCount(),delta:stored.map((n,type)=>bathLiquidCount(type)-n),floors:bathArrival.map(r=>r.floor)};
  })()`);
  check('existing hidden liquid returns to stores without changing paid main water', recovery.mainBefore===recovery.mainAfter && recovery.delta.every((n,type)=>n===([90,0,70,0,0][type])) && recovery.floors.every(f=>f===0));
  for (let frame=0; frame<240; frame++) {
    await game('mineralLiquidTick(1/60);bathOperationsTick(1/60);updateLiquids(1/60);render();');
    await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
  }
  check('GPU mutation replay clears the recovered hidden tub', await game('(function(){var F=BATH_FLOORS[1],c=bathTubCurve(F,F.tubs[0]);return liquidSampleRect(c.x0,c.y0-44,c.x1,c.y0+c.D+32).every(n=>n===0)&&bathBasinCount()===6201;})()'));
}
