// First pour into a dry bath, including authoritative GPU particle positions.
export async function bathHoseFlow({ game, sleep, check, screenshot, press, button }) {
  await game('bathEnter()'); await sleep(750);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;bathGuests=[];skySlimes=[];skySlimeNext=1e9;bathNoticeT=0;setDevMode(false);siphon.tank[0]=32000;render();');
  check('hose probe starts in a dry bath', await game('bathBasinCount()===0'));
  const probes = await game(`(function(){var c=bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]);return [0.25,0.5,0.75].map(u=>{var x=c.x0+(c.x1-c.x0)*u,hit=null;for(var y=c.y0-180;y<c.y0+c.D+16;y++)if(liquidWorldSolidAt(x,y)){hit=y;break;}return{x:x,firstSolid:hit,liner:c.y0+c.depthAt(x),lip:c.y0};});})()`);
  check('the drawn basin has no hidden terrain shelf',probes.every(p=>p.firstSolid>=p.liner-7&&p.firstSolid<=p.liner));
  const stockBefore=await game('bathLiquidCount(0)');
  await press(button('hose')); await press(button('tool-valve'));
  const snapshot = async () => game(`(async function(){
    var g=liquidWGPU,n=g.uploadedCount,b=g.device.createBuffer({size:Math.max(16,n*16),usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{var e=g.device.createCommandEncoder();e.copyBufferToBuffer(g.buf.pos,0,b,0,n*16);g.device.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);var p=new Float32Array(b.getMappedRange()),c=bathTubCurve(BATH_FLOORS[0],BATH_FLOORS[0].tubs[0]),ys=[];
      var outsideGrid=0,nearFloor=0;
      for(var i=0;i<n;i++){var x=p[i*4],y=p[i*4+1];if(x<c.x0||x>c.x1||y<c.y0-220||y>c.y0+c.D+10)continue;ys.push(y);
        var gx=Math.floor(x/g.cellSize)-g.grid.originX,gy=Math.floor(y/g.cellSize)-g.grid.originY;
        if(gx<1||gy<1||gx>=g.grid.w-1||gy>=g.grid.h-1)outsideGrid++;
        if(y>=c.y0+c.depthAt(x)-14)nearFloor++;
      }
      ys.sort((a,b)=>a-b);return{n:ys.length,top:ys[0],median:ys[Math.floor(ys.length/2)],bottom:ys.at(-1),outsideGrid:outsideGrid,nearFloor:nearFloor,gridCells:g.grid.cells,readbackAge:g.getReadbackAge()};
    }finally{b.unmap();b.destroy();}
  })()`);
  for(let frame=1;frame<=180;frame++){
    await game('liquidToolSync();bathToolTick(1/60);mineralLiquidTick(1/60);bathOperationsTick(1/60);updateLiquids(1/60);render();');
    await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
    if(frame===30)await press(button('tool-valve'));
    if([6,18,36,72,120,180].includes(frame)){
      const state=await snapshot();
      console.log('HOSE_FRAME',frame,state);
      check('frame '+frame+' keeps the full water stencil inside its physics grid',state.n>0&&state.outsideGrid===0);
      if(frame===36)check('the first stream reaches the actual copper floor without a midair stop',state.nearFloor>20);
      if(frame===180)check('the stopped stream settles and conserves its finite supply',state.nearFloor>state.n*0.6&&stockBefore-await game('bathLiquidCount(0)')===state.n);
      await screenshot('first-hose-'+frame);
    }
  }
}

// A finger can point at the copper bottom. The hose mouth must stay in the
// cavity instead of crossing the liner and silently blocking the whole pour.
export async function bathHoseTouchFlow({ game, send, sleep, check, screenshot, press, button }) {
  await game('bathEnter()'); await sleep(750);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;bathFading=false;bathGuests=[];skySlimes=[];skySlimeNext=1e9;bathNoticeT=0;setDevMode(false);');
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  for (const [width, height] of [[844, 390], [667, 375], [568, 320], [520, 320]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await sleep(100);
    await game('isMobile=true;resize();bathToolReset();bathSiloReset();liquidCount=0;liquidOps.length=0;liquidMutationSeq++;siphon.tank[0]=16000;bathWater=0;updateCamera();render();');
    await press(button('hose'), true);
    const points = await game(`(function(){var c=bathToolBounds().curve,r=canvas.getBoundingClientRect();
      function client(x,y){return{x:r.left+(x-cam.x)*dpr*worldScale*r.width/canvas.width,y:r.top+(y-cam.y)*dpr*worldScale*r.height/canvas.height};}
      return{head:client(bathTool.x,bathTool.y),bottom:client((c.x0+c.x1)/2,c.y0+c.D-24)};
    })()`);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...points.head, id: 3 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...points.bottom, id: 3 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await game('for(var i=0;i<150;i++)bathToolTick(1/60);render();');
    const mouth = await game('(function(){var t=bathTool,x=t.x+Math.sin(t.tilt)*25,y=t.y+Math.cos(t.tilt)*25;return{x:x,y:y,solid:liquidWorldSolidAt(x,y),touch:!!t.touchInput,target:t.ty,head:t.y};})()');
    console.log('TOUCH_MOUTH', width, height, mouth);
    check(width+'x'+height+' touch drag keeps the hose mouth above the copper', mouth.touch && !mouth.solid);
    await press(button('tool-valve'), true);
    for (let frame=0; frame<120; frame++) {
      await game('liquidToolSync();bathToolTick(1/60);mineralLiquidTick(1/60);bathOperationsTick(1/60);updateLiquids(1/60);render();');
      await game('liquidWGPU.device.queue.onSubmittedWorkDone()');
    }
    const poured = await game(`(async function(){var g=liquidWGPU,n=g.uploadedCount,b=g.device.createBuffer({size:Math.max(16,n*16),usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      try{var e=g.device.createCommandEncoder();e.copyBufferToBuffer(g.buf.pos,0,b,0,n*16);g.device.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);var p=new Float32Array(b.getMappedRange()),c=bathToolBounds().curve,wet=0,finite=true;
        for(var i=0;i<n;i++){var x=p[i*4],y=p[i*4+1];finite=finite&&Number.isFinite(x)&&Number.isFinite(y);if(x>=c.x0&&x<=c.x1&&y>=c.y0&&y<=c.y0+c.depthAt(x)+1)wet++;}
        return{n:n,wet:wet,finite:finite,spent:16000-bathLiquidCount(0),output:bathTool.output,valve:bathTool.valve,lost:bathLostWater};
      }finally{b.unmap();b.destroy();}
    })()`);
    console.log('TOUCH_POUR', width, height, poured);
    check(width+'x'+height+' bottom-aimed hose keeps pouring real GPU water', poured.valve && poured.output>0 && poured.wet>2000 && poured.finite);
    check(width+'x'+height+' touch pour conserves its finite supply', poured.spent===poured.n+poured.lost);
    await screenshot('touch-bottom-hose-'+width+'x'+height);
    await press(button('tool-valve'), true);
  }
}
