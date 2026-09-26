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
