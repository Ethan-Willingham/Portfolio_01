// Real canvas coverage equivalence, including GPU mirror reuse/invalidation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../..'),file='js/sluice/190-smoke-webgl.js';
const original=cp.execFileSync('git',['show',(process.env.BASE_REF||'2b587fb')+':'+file],{cwd:root,encoding:'utf8'}),current=fs.readFileSync(process.env.CANDIDATE||path.join(root,file),'utf8');
function check({original,current}){
  function factory(source){
    const state=source.slice(source.indexOf('  var smokeObstWaterBins'),source.indexOf('  // Fast water entrains'));
    const paint=source.slice(source.indexOf('  function smokeFluidPaintObstacle()'),source.indexOf('  // Hand the strongest downward water motion'));
    return new Function(`
      var smokeFluidActive=true,isMobile=false,smokeObstDbgPaints=0,smokeObstDbgStamps=0,smokeObstDbgSrc;
      var SMOKE_WATER_OBSTACLE=1,SMOKE_WATER_FLOW_MIN_VY=55,bathMode=false;
      var TILE=32,COLS=100,SKY_ROWS=4,cam={x:0,y:0};
      var smokeFluidMarginWorldX=0,smokeFluidMarginWorldY=0,smokeFluidDomainWorldW=256,smokeFluidDomainWorldH=192;
      var smokeFluidObstacleW=768,smokeFluidObstacleH=576;
      var smokeFluidObstacleCanvas=document.createElement('canvas');smokeFluidObstacleCanvas.width=768;smokeFluidObstacleCanvas.height=576;
      var smokeFluidObstacleCtx=smokeFluidObstacleCanvas.getContext('2d',{willReadFrequently:true});
      var smokeDriver={setObstacleAlpha:function(){}},jelloBodies=[];
      // Isolate the water-density cache; terrain reuse has its own game suite.
      function smokeTerrainMaskPaint(){return false;}
      function tileAt(){return null;}function dominantVoidBackingKind(){return false;}function perfMark(){}
      var liquidWGPU={simActive:true,readbackApplyGen:0},liquidMutationSeq=0;
      var liquidCount=0,liquidX,liquidY,liquidVY,liquidFrozen;
      ${state}\n${paint}
      return {set:function(p){liquidCount=p.length;liquidX=Float32Array.from(p,p=>p[0]);liquidY=Float32Array.from(p,p=>p[1]);liquidVY=Float32Array.from(p,p=>p[2]);liquidFrozen=new Uint8Array(p.length);},
      change:function(kind){if(kind==='readback'){liquidX[0]+=3;liquidWGPU.readbackApplyGen++;}if(kind==='mutation'){liquidY[1]+=4;liquidMutationSeq++;}if(kind==='freeze')liquidFrozen.fill(1);if(kind==='wake'){liquidFrozen.fill(0);liquidVY.fill(0);}if(kind==='flow')SMOKE_WATER_FLOW_MIN_VY=120;if(kind==='cpu'){liquidWGPU.simActive=false;liquidX[2]+=3;}},
      paint:function(x,y){cam.x=x;cam.y=y;smokeFluidPaintObstacle();return smokeFluidObstacleCtx.getImageData(0,0,768,576).data;},
      canvas:function(){return smokeObstWaterCanvas;}};
    `)();
  }
  const a=factory(original),b=factory(current),particles=[];let seed=987;
  const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let y=-25;y<235;y+=1.8)for(let x=-30;x<305;x+=1.8)particles.push([x+rand()*.3,y+rand()*.3,rand()*110]);
  a.set(particles);b.set(particles);let checks=0,max=0;
  function compare(x,y){
    const u=a.paint(x,y),v=b.paint(x,y);
    // Padding differs only outside the domain. Compare every interior sample,
    // where both kernels have their complete neighbourhood, including edges of pools.
    for(let py=24;py<552;py++)for(let px=24;px<744;px++){
      const i=(py*768+px)*4+3,d=Math.abs(u[i]-v[i]);max=Math.max(max,d);if(d>2)throw Error('Coverage mismatch '+d+' at '+x+','+y);
    }checks++;
  }
  compare(0,0);let uploads=0;const c=b.canvas(),g=c.getContext('2d'),put=g.putImageData.bind(g);g.putImageData=(...args)=>{uploads++;return put(...args);};
  for(const [x,y] of [[.25,.5],[2,0],[7.75,2],[18,-3],[63,2],[65,0],[-2,-5]])compare(x,y);
  compare(.25,0);uploads=0;for(let i=0;i<20;i++)compare(.25,0);
  if(uploads!==0)throw Error('GPU mirror image was rebuilt without a data/window change');
  for(const kind of ['readback','mutation','freeze','wake','flow','cpu','cpu']){
    const previous=uploads;a.change(kind);b.change(kind);compare(.25,0);if(uploads!==previous+1)throw Error('Missing invalidation '+kind);
  }
  a.set(particles);b.set(particles);compare(.25,0);
  return {checks,maxDifference:max};
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME});try{const page=await browser.newPage();const result=await page.evaluate(check,{original,current});console.log('PASS: '+JSON.stringify(result));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
