// Actual current painter versus minimal frozen v28.134 state/painter.
// Correctness only: no browser, wall-clock timing, GPU or game renderer.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function repositoryRoot(){
 if(process.env.ROOT)return path.resolve(process.env.ROOT);
 for(const start of [__dirname,process.cwd()])for(let dir=start;;dir=path.dirname(dir)){
  if(fs.existsSync(path.join(dir,'js/sluice/190-smoke-webgl.js')))return dir;
  if(path.dirname(dir)===dir)break;
 }
 throw Error('Run within the repository or set ROOT or pass the candidate fragment path.');
}
const file=path.resolve(process.argv[2]||process.env.SMOKE_SOURCE||path.join(repositoryRoot(),'js/sluice/190-smoke-webgl.js'));
const fixturePath=path.join(__dirname,'fixtures/smoke-painter-v28.134-original.js');
const source=fs.readFileSync(fixturePath,'utf8').replace(/\r\n/g,'\n'),candidate=fs.readFileSync(file,'utf8'),out=file;
assert.equal(sha(source),'7d832a92496fe505a76785c39aee5c96cb0280dcd7482ce656d34499f4c6a62a','Frozen baseline fixture provenance changed');
new vm.Script(source);new vm.Script(candidate);
function extract(s){const a=s.indexOf('  function smokeFluidPaintObstacle() {'),b=s.indexOf('  // Hand the strongest downward water motion',a);assert(a>=0&&b>a);return s.slice(a,b);}
function factory(src){
 const events=[];let fault=null,alloc=0,inject=null,canvasSerial=0;
 const buf=a=>a?Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('hex'):null;
 const log=(name,...v)=>{events.push([name,...v]);if(fault===name){fault=null;throw Error('injected '+name);}};
 class TestF32 extends Float32Array{constructor(...args){super(...args);this.which=alloc++%2;}fill(v,a,b){super.fill(v,a,b);if(inject){const values=this.which===0?inject.bn:inject.vy;values.forEach((x,i)=>{this[i]=x;});}return this;}}
 function canvas(){const c={id:'canvas'+canvasSerial++,width:0,height:0,pixels:null};
  const target={createImageData(w,h){log('createImageData',w,h);const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i++)data[i]=i%4===3?255:(i*23)%256;return{data,width:w,height:h};},
   putImageData(image,x,y){log('putImageData',buf(image.data),x,y);c.pixels=new Uint8ClampedArray(image.data);},drawImage(other,...v){log('drawImage',other.id,buf(other.pixels),...v);}};
  for(const n of ['setTransform','clearRect','fillRect','save','restore','beginPath','moveTo','lineTo','closePath','fill'])target[n]=(...args)=>log(n,...args);
  const ctx=new Proxy(target,{set(t,k,v){log('set:'+k,v);t[k]=v;return true;}});c.getContext=(kind)=>{log('getContext',c.id,kind);return ctx;};return c;}
 const main=canvas();const env={Math,Float32Array:TestF32,Uint8Array,document:{createElement(kind){log('createElement',kind);return canvas();}},performance:{now:()=>0},rigExhaustFluid:null,rigExhaustNeedsStep:()=>false,ctx:null};
 const state=src.slice(src.indexOf('  var smokeObstWaterBins'),src.indexOf('  // Fast water entrains'));
 const api=new Function('env','main','log',`with(env){
 var smokeFluidActive=true,isMobile=false,smokeObstDbgPaints=0,smokeObstDbgStamps=0,smokeObstDbgSrc;
 var SMOKE_WATER_OBSTACLE=1,SMOKE_WATER_FLOW_MIN_VY=55,bathMode=false,TILE=32,COLS=100,SKY_ROWS=4,cam={x:0,y:0};
 var smokeFluidMarginWorldX=0,smokeFluidMarginWorldY=0,smokeFluidDomainWorldW=128,smokeFluidDomainWorldH=96;
 var smokeFluidObstacleW=384,smokeFluidObstacleH=288,smokeFluidObstacleCanvas=main,smokeFluidObstacleCtx=main.getContext('2d');
 var smokeDriver={setObstacleAlpha:function(c){log('upload',c.id);}},jelloBodies=[];
 function smokeTerrainMaskPaint(){return false;}function tileAt(){return null;}function dominantVoidBackingKind(){return false;}function perfMark(name){log('perfMark',name);}
 function smokeFluidPaintObstacleGL(){log('mobile');}
 var prefixObservations=[];var liquidWGPU={simActive:true,readbackApplyGen:0},liquidMutationSeq=0,liquidCount=0,liquidX,liquidY,liquidVY,liquidFrozen;
 ${state}\n${extract(src).replace('for (var wi = prefixStart;', 'prefixObservations.push(prefixStart);\n        for (var wi = prefixStart;')}
 return {set(p){liquidCount=p.length;var capacity=Math.max(256,p.length+512);liquidX=new Float32Array(capacity);liquidY=new Float32Array(capacity);liquidVY=new Float32Array(capacity);liquidFrozen=new Uint8Array(capacity);for(var i=0;i<p.length;i++){liquidX[i]=p[i][0];liquidY[i]=p[i][1];liquidVY[i]=p[i][2];liquidFrozen[i]=p[i][3]||0;}},
 append(p){if(liquidCount+p.length>liquidX.length){for(var key of ['liquidX','liquidY','liquidVY','liquidFrozen']){var old=eval(key),fresh=new old.constructor(Math.max(old.length*2,liquidCount+p.length));fresh.set(old);eval(key+'=fresh');}}for(var point of p){liquidX[liquidCount]=point[0];liquidY[liquidCount]=point[1];liquidVY[liquidCount]=point[2];liquidFrozen[liquidCount]=point[3]||0;liquidCount++;}liquidMutationSeq++;},
 observations(){return prefixObservations.slice();},
 paint(){smokeFluidPaintObstacle();},change(kind){if(kind==='readback'){liquidX[0]+=3;liquidWGPU.readbackApplyGen++;}if(kind==='mutation'){liquidY[0]+=4;liquidMutationSeq++;}if(kind==='freeze')liquidFrozen.fill(1);if(kind==='wake'){liquidFrozen.fill(0);liquidVY.fill(0);}if(kind==='flow')SMOKE_WATER_FLOW_MIN_VY=120;if(kind==='cpu')liquidWGPU.simActive=false;if(kind==='gpu')liquidWGPU={simActive:true,readbackApplyGen:0};if(kind==='window'){cam.x+=64;cam.y-=64;}if(kind==='pan'){cam.x+=.25;cam.y+=.5;}if(kind==='size'){smokeFluidDomainWorldW+=64;}if(kind==='inactive')smokeFluidActive=false;if(kind==='active')smokeFluidActive=true;if(kind==='bath')bathMode=!bathMode;if(kind==='mobile')isMobile=!isMobile;if(kind==='generation')liquidWGPU.readbackApplyGen++;if(kind==='inputvyedit')liquidVY[0]+=1;if(kind==='inputvyidentity')liquidVY=new liquidVY.constructor(liquidVY);if(kind==='inputyidentity')liquidY=new liquidY.constructor(liquidY);if(kind==='frozenidentity')liquidFrozen=new Uint8Array(liquidFrozen);if(kind==='float64'){liquidX=Float64Array.from(liquidX);liquidY=Float64Array.from(liquidY);liquidVY=Float64Array.from(liquidVY);}if(kind==='badgeneration')liquidWGPU.readbackApplyGen='unsupported';if(kind==='nanword')new Uint32Array(liquidVY.buffer)[0]=0x7fc01234;if(kind==='signedzero')new Uint32Array(liquidX.buffer)[0]^=0x80000000;if(kind==='swap'){var temp=liquidX[0];liquidX[0]=liquidX[liquidCount-1];liquidX[liquidCount-1]=temp;liquidMutationSeq++;}if(kind==='shrink'){liquidCount=Math.max(1,liquidCount-2);liquidMutationSeq++;}if(kind==='identity'){liquidX=new liquidX.constructor(liquidX);liquidMutationSeq++;}if(kind==='accumulator')smokeObstWaterBins=new Float32Array(smokeObstWaterBins.length);if(kind==='vyaccumulator')smokeObstWaterVY=new Float32Array(smokeObstWaterVY.length);if(kind==='body'){jelloBodies=[{ringN:4,ring:[0,1,2,3],px:[20,30,30,20],py:[20,20,30,30],bboxL:20,bboxR:30,bboxT:20,bboxB:30}];}},
 state(){return{bins:smokeObstWaterBins,vy:smokeObstWaterVY,rgba:smokeObstWaterImage?.data,cache:smokeObstWaterCache?{gen:smokeObstWaterCache.gen,seq:smokeObstWaterCache.seq,count:smokeObstWaterCache.count,ox:smokeObstWaterCache.ox,oy:smokeObstWaterCache.oy,w:smokeObstWaterCache.w,h:smokeObstWaterCache.h,flow:smokeObstWaterCache.flow,frozen:smokeObstWaterCache.frozen}:null,counters:[smokeObstDbgPaints,smokeObstDbgStamps,smokeObstDbgSrc],inputs:[liquidX,liquidY,liquidVY,liquidFrozen]};}};}`)(env,main,log);
 return{api,events,fault(name){fault=name;},inject(v){inject=v;},state(){const s=api.state();return{bins:buf(s.bins),vy:buf(s.vy),rgba:buf(s.rgba),cache:s.cache?{...s.cache,frozen:buf(s.cache.frozen)}:null,counters:s.counters,inputs:s.inputs.map(buf)};}};
}
let checks=0,paints=0,prefixSuccesses=0,prefixDeposited=0;
function pair(p,steps,inject){const a=factory(source),b=factory(candidate);a.api.set(p);b.api.set(p);if(inject){a.inject(inject);b.inject(inject);}a.events.length=b.events.length=0;
 for(const step of steps){for(const c of[a,b]){if(step.change)c.api.change(step.change);if(step.p)c.api.set(step.p);if(step.append)c.api.append(step.append);if(step.fault)c.fault(step.fault);}
  const inputs=a.state().inputs;const errors=[];
  for(const c of[a,b]){try{c.api.paint();errors.push(null);}catch(e){errors.push(e.message);}}
  assert.deepEqual(errors[0],errors[1],'matching thrown failure');assert.deepEqual(a.events,b.events,'exact canvas/image/command sequence');assert.deepEqual(a.state(),b.state(),'exact RGBA/density/VY/cache/input bytes');assert.deepEqual(a.state().inputs,inputs,'painter does not mutate inputs');
  a.events.length=b.events.length=0;checks+=4;paints+=2;
 }
 const proof=b.api.observations();prefixSuccesses+=proof.filter(n=>n>0).length;prefixDeposited+=proof.filter(n=>n>0).reduce((a,b)=>a+b,0);
}
const points=[];for(let y=20;y<80;y+=1.25)for(let x=20;x<65;x+=1.25)points.push([x,y,(x*y)%180]);
pair(points,[{}, {},{change:'pan'},{change:'readback'},{change:'mutation'},{change:'freeze'},{change:'wake'},{change:'flow'},{change:'window'},{change:'size'},{change:'cpu'},{change:'cpu'},{change:'gpu'},{change:'body'},{change:'bath'},{change:'bath'},{change:'inactive'},{change:'active'},{change:'mobile'},{change:'mobile'},{p:[[20,20,0]]},{p:[[NaN,20,Infinity],[Infinity,30,-Infinity],[20,NaN,NaN]]}]);
const special=[0,-0,NaN,Infinity,-Infinity,Number.MIN_VALUE,-Number.MIN_VALUE,2.5,6,10,-3];
pair([[20,20,0,1]],[{}, {},{change:'mutation'},{change:'pan'},{change:'flow'},{change:'window'}],{bn:special,vy:[NaN,Infinity,-Infinity,NaN,NaN,0,-0,Infinity,-Infinity,NaN,0]});
for(const fault of['createElement','getContext','createImageData','putImageData','drawImage','upload'])pair(points,[{fault},{},{change:'readback',fault},{},{}]);
for(let i=0;i<10;i++)pair([[i*7-10,i*5-20,i%3?NaN:Infinity],[60,40,-0]],[{},{change:'mutation'},{change:'freeze'},{change:'wake'}]);
const suffix=[[40,40,20],[41,41,NaN],[42,42,-0]];
// Appended footprints can be empty, share just a row, or occupy disjoint rows.
// Preserve unrelated alpha, including the pool covered by the initial image.
pair(points,[{}, {append:[[100,10,0],[105,85,120]]}, {append:[[10,10,NaN],[115,10,0]]},
 {append:[[1e5,1e5,0],[30,30,0,1]]}, {append:[[20,20,-0],[20,20,Infinity]]},
 {append:[[NaN,20,0],[20,NaN,0]]}, {change:'window',append:suffix}, {append:suffix}]);
pair([[20,20,0],[21,21,NaN],[22,22,-0]],[{}, {append:suffix},{append:suffix},{change:'generation',append:suffix},{},{change:'mutation',append:suffix},{change:'freeze',append:suffix},{change:'wake',append:suffix},{change:'window',append:suffix},{change:'flow',append:suffix},{change:'identity',append:suffix},{change:'accumulator',append:suffix},{change:'vyaccumulator',append:suffix},{change:'swap',append:suffix},{change:'shrink'},{append:suffix}]);
pair([[-0,20,NaN],[21,21,Infinity]],[{}, {change:'signedzero',append:suffix},{change:'nanword',append:suffix},{append:suffix}]);
for(const fault of ['putImageData','drawImage','upload'])pair(points,[{}, {append:suffix,fault},{},{append:suffix},{}]);
pair(Array.from({length:250},(_,i)=>[20+i%20,20+Math.floor(i/20),0]),[{}, {append:Array.from({length:300},()=>[30,30,20])},{append:suffix},{change:'shrink'},{append:suffix}]);
for(const kind of ['readback','mutation','inputvyedit','inputvyidentity','inputyidentity','frozenidentity','float64','badgeneration','gpu'])pair([[20,20,0],[21,21,10]],[{}, {change:kind,append:suffix},{append:suffix},{}]);
assert(prefixSuccesses>=8,'Proof must exercise actual prefix reuse');
const report={schema:'sluice-smoke-prefix-exact-v1',checks,paints,prefixSuccesses,prefixDeposited,passed:true,timed:false,browserLaunched:false,sourcePath:fixturePath,candidatePath:out,sourceSHA256:sha(source),originalFragmentSHA256:'a9e76887042be5eb9af7299d73ff0e6f6c133ad2f4107985844aaa126e3947f2',candidateSHA256:sha(candidate),sourcePainterSHA256:sha(extract(source)),candidatePainterSHA256:sha(extract(candidate)),harnessSHA256:sha(fs.readFileSync(__filename)),coverage:'Actual extracted production painter. Exact full typed buffers, ordered mock canvas commands and image snapshots, cache transitions, nonfinite/signedzero density and velocity injection, previous alpha clearing, six fault types and retries.'};
if(process.env.REPORT_FILE)fs.writeFileSync(process.env.REPORT_FILE,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
