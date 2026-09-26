// Exercise the live chamber mapping, GPU masks/light and CPU fallback above
// the former rectangular fire slice. Only the isolated test page seeds gas.
import { checkFireKernels } from './fire-kernel-checks.mjs';
import { checkFireMaterials } from './fire-material-checks.mjs';
import { checkFireRendering } from './fire-render-checks.mjs';
export async function bathFireOutline({ game, send, sleep, check, screenshot }) {
  await game('bathEnter()'); await sleep(750);
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;gamePaused=false;bathFading=false;bathGuests=[];skySlimes=[];bathNoticeT=0;hearthReset();render();');
  check('live GPU fire is ready',await game('hearthFireGPU.available&&!!hearthFireGPU.testKernel'));
  for(const suite of [checkFireKernels,checkFireMaterials,checkFireRendering]) {
    const results=await game('('+suite.toString()+')(liquidWGPU.device)');
    for(const r of results){console.log('FIRE_CHECK',r);check(r.label,r.pass);}
  }
  const totals=()=>game(`(async function(){var s=await hearthFireGPU.snapshot(),mass=0,heat=0;
    for(var i=0;i<s.mask.length/2;i++)if(s.mask[i*2]===-1){var o=i*8;mass+=s.fields[o]+s.fields[o+1]+s.fields[o+2]+s.fields[o+3]+s.fields[o+5];heat+=s.fields[o+4];}
    return{mass:mass,heat:heat};})()`);
  let previous=null;
  for(const [width,height,scale] of [[1280,900,1],[390,844,1],[667,375,1],[1920,1080,2]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:width<700});
    await sleep(100);
    await game('(async function(){resize();bathCamY=-1;updateCamera();render();await hearthFireGPU.testKernel("geometry",{chunks:[],damper:0});return true;})()');
    if(previous){
      const next=await totals();
      check(`${width}x${height} layout remap conserves gas and heat`,Math.abs(next.mass-previous.mass)<previous.mass*1e-6&&Math.abs(next.heat-previous.heat)<previous.heat*1e-6);
    }
    const result=await game(`(async function(){
      var gpu=hearthFireGPU,s=await gpu.snapshot(),bounds=gpu.bounds,wrong=0,open=0,upper=0;
      for(var y=1;y<s.height-1;y++)for(var x=1;x<s.width-1;x++){
        var wx=bounds.x+(x+.5)*bounds.w/s.width,wy=bounds.y+(y+.5)*bounds.h/s.height;
        var inside=hearthChamberContains(wx,wy),owner=s.mask[(y*s.width+x)*2];
        if(inside){open++;if(wy<HEARTH_TOP-10)upper++;}
        if(inside!==(owner===-1))wrong++;
      }
    var clip=gpu.canvas.style.clipPath.slice(8,-1).split(',').flatMap(p=>p.trim().split(' ').filter(Boolean).map(parseFloat));
      var expected=hearthChamberOutline.flatMap(p=>[(p[0]-bounds.x)/bounds.w*100,(p[1]-bounds.y)/bounds.h*100]);
      var L=hearthRoomLayout(),box=L.box,r=gpu.canvas.getBoundingClientRect(),c=canvas.getBoundingClientRect();
      var sx=c.width/(canvas.width/dpr),sy=c.height/(canvas.height/dpr);
      var fitted=Math.abs(r.x-(c.x+(box.x+bounds.x*box.w/HEARTH_WIDTH)*sx))<.1&&
        Math.abs(r.y-(c.y+(box.y+(bounds.y-HEARTH_TOP)*box.h/HEARTH_HEIGHT)*sy))<.1&&
        Math.abs(r.width-bounds.w*box.w/HEARTH_WIDTH*sx)<.1&&Math.abs(r.height-bounds.h*box.h/HEARTH_HEIGHT*sy)<.1;
      var covered=hearthChamberOutline.every(p=>p[0]>=bounds.x-.01&&p[0]<=bounds.x+bounds.w+.01&&p[1]>=bounds.y-.01&&p[1]<=bounds.y+bounds.h+.01);
      var fields=new Float32Array(s.width*s.height*8);
      for(var i=0;i<s.mask.length/2;i++)fields.set([0,.275,.895,.01,s.mask[i*2]===-1?1800:0,0,0,0],i*8);
      await gpu.testKernel('transport',{fields:fields,damper:0});render();
      var out=document.createElement('canvas');out.width=gpu.canvas.width;out.height=gpu.canvas.height;
      var ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(gpu.canvas,0,0);
      var pixels=ctx.getImageData(0,0,out.width,out.height).data,litUpper=0;
      for(var y=0;y<out.height;y++)for(var x=0;x<out.width;x++){
        var wx=bounds.x+(x+.5)*bounds.w/out.width,wy=bounds.y+(y+.5)*bounds.h/out.height,i=(y*out.width+x)*4;
        if(wy<HEARTH_TOP-10&&hearthChamberContains(wx,wy)&&pixels[i]>150&&pixels[i+3]>100)litUpper++;
      }
      return{wrong:wrong,open:open,upper:upper,litUpper:litUpper,covered:covered,fitted:fitted,landscape:L.landscape,
        exact:clip.length===expected.length&&clip.every((v,i)=>Math.abs(v-expected[i])<.001),cells:s.width*s.height,buffers:gpu.bufferBytes};
    })()`);
    console.log('FIRE_OUTLINE',width,height,result);
    check(`${width}x${height} gas mask follows the full copper ceiling and iron bowl`,result.wrong===0&&result.open>0&&result.exact&&result.covered);
    check(`${width}x${height} fire canvas fits the full chamber without stretching`,result.fitted);
    check(`${width}x${height} retains the bounded fire cell budget`,result.cells<=38640&&result.buffers<5800000);
    if(!result.landscape)check(`${width}x${height} flame light reaches both upper wings`,result.upper>100&&result.litUpper>100);
    await screenshot(`fire-outline-${width}`);
    previous=await totals();
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await sleep(150);
  await game('resize();bathCamY=-1;updateCamera();hearthReset();render();');
  await game(`for(var i=0;i<14;i++){
    var b=hearthDropMaterial('boiler',HEARTH_WIDTH/2-190+i*29,110,HEARTH_MATERIAL_ORDER[i%6]);
    for(var j=0;j<50;j++)hearthStepBed(hearthBeds.boiler);
    if(hearthMaterial(b.material).role==='fuel')hearthLightChunk(hearthBeds.boiler,b);
  }lastTime=performance.now();gameRafId=requestAnimationFrame(loop);`);
  await sleep(4000);
  const perf=await game('({fps:perfFps,cpu:perfFrameStats(),fireMs:hearthFireGPU.cpuMs,buffers:hearthFireGPU.bufferBytes})');
  console.log('FIRE_PERFORMANCE',perf);
  check('a live burning bed retains interactive frame rate',perf.fps>=45);
  await screenshot('fire-curve-live');
  await game('cancelAnimationFrame(gameRafId);gameRafId=0;hearthReset();render();');
  const fuel=await game(`(async function(){
    var at=null;hearthSelectMaterial('coal');
    for(var y=hearthChamberCeiling+50;y<HEARTH_TOP-35&&!at;y+=8)for(var x=40;x<350;x+=8)if(hearthPlacementValid({x:x,y:y})){at={x:x,y:y};break;}
    if(!at)throw Error('no upper fire site');
    var body=hearthDropMaterial('boiler',at.x,at.y,'coal');hearthLightChunk(hearthBeds.boiler,body);
    for(var i=0;i<120;i++){hearthFireTick(1/60);if(i%12===11)await liquidWGPU.device.queue.onSubmittedWorkDone();}
    var s=await hearthFireGPU.snapshot(),bounds=hearthFireGPU.bounds,hot=0;
    for(var i=0;i<s.mask.length/2;i++)if(s.mask[i*2]===-1&&bounds.y+(Math.floor(i/s.width)+.5)*bounds.h/s.height<HEARTH_TOP&&s.fields[i*8+4]>10)hot++;
    // The fallback must also seed and display a plume for a real upper piece.
    var field=hearthArtField(hearthBeds.boiler);body.lit=true;body.heat=body.core=body.flame=1;body.fuel=1;
    hearthArtUpdate(field,hearthBeds.boiler,1);var upper=0;
    for(var i=0;i<field.heat.length;i++)if(HEARTH_FIRE_BOUNDS.y+(Math.floor(i/HEARTH_ART_W)+.5)*HEARTH_FIRE_BOUNDS.h/HEARTH_ART_H<HEARTH_TOP&&field.image.data[i*4+3]>80)upper++;
    return{hot:hot,fallback:upper,point:at};
  })()`);
  console.log('UPPER_FUEL',fuel);
  check('real upper fuel exchanges heat with GPU gas above the old cutoff',fuel.hot>5);
  check('CPU fallback has visible flame above the old cutoff',fuel.fallback>5);
  await game('hearthFireGPU.dispose();hearthFireGPU=null;render();');
  await screenshot('fire-outline-cpu');
}
