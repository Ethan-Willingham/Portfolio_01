// Exact CPU geometry and GPU-upload regression against the v28.172 fire solver.
// No browser or GPU required. BENCH=1 enables the optional CPU benchmark.
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const file='js/fire-wgpu.js';
const ref=process.env.BASE_REF||'b6dc539759097cdf386ea535692516c37ae81ea6';
const before=execFileSync('git',['show',ref+':'+file],{cwd:root,encoding:'utf8'}).replace(/\r\n/g,'\n'),after=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
assert.equal(after.slice(after.indexOf('var shader ='),after.indexOf('  function create(')),before.slice(before.indexOf('var shader ='),before.indexOf('  function create(')),'All GPU shader source unchanged');
function engine(source,cfg={}){
 const geometry=source.slice(source.indexOf('    function geometry(chunks)'),source.indexOf('    function mirror(enc)'));
 const chamberSetter=source.slice(source.indexOf('    sim.setChamber ='),source.indexOf('    sim.setChamber(options.chamber)'));
 return new Function('cfg',`
 const CAP=48,w=cfg.width||48,worldWidth=cfg.worldWidth||320,height=cfg.height||210,h=Math.round(w*height/worldWidth),n=w*h,left=cfg.left||0,top=cfg.top||0;
 var chamber=null,chamberCells=new Uint8Array(n),chamberRows=new Float64Array(h),chamberMask=null;
 for(var i=0;i<h;i++)chamberRows[i]=cfg.inset||0;
 var slots=new Array(CAP).fill(null),masks=new Int32Array(n*2),lists=new Uint32Array(n),signature='',revision=0,geometryFresh=true;
 var contacts=new Uint32Array(CAP*2),radiationViews=new Float32Array(CAP),previousMasks=new Int32Array(n*2),owners=new Int32Array(n),frontier=new Int32Array(n),remapData=new Int32Array(n*2),remapLinks=new Int32Array(n),edgeData=new Float32Array(CAP*16*4),splitData=new Int32Array(CAP).fill(-1);
 var inherited=new Map(),commands=new Map(),ignition=new Map(),quenches=new Map(),bodies=['body0'],splitBuffer='split',edgeBuffer='edge',remapBuffer='remap',remapLinkBuffer='links',m='mask',surfaceBuffer='surface',surfaceStart=new Int32Array(CAP),surfaceCount=new Int32Array(CAP);
 var uploaded=new Map(),device={queue:{writeBuffer(key,offset,data,start=0,size=data.length-start){var v=new Uint8Array(data.buffer,data.byteOffset+start*data.BYTES_PER_ELEMENT,size*data.BYTES_PER_ELEMENT);var old=uploaded.get(key)||new Uint8Array(0),dst=new Uint8Array(Math.max(old.length,offset+v.length));dst.set(old);dst.set(v,offset);uploaded.set(key,dst);}}};
 var sim={},gpuCanvas={style:{}};
 ${chamberSetter}
 if(cfg.chamber)sim.setChamber(cfg.chamber);
 ${geometry}
 // Match the geometry-relevant part of sim.reset; GPU initialization is outside this fixture.
 return {step:geometry,setChamber:sim.setChamber,inherit:(child,parent)=>inherited.set(child,parent),reset:()=>{revision++;geometryFresh=true;signature='';slots.fill(null);inherited.clear();ignition.clear();quenches.clear();commands.clear();},snapshot:()=>({revision,masks:Array.from(masks),contacts:Array.from(contacts),radiation:Array.from(radiationViews),starts:Array.from(surfaceStart),counts:Array.from(surfaceCount),uploads:[...uploaded].map(([k,v])=>[k,Array.from(v)])})};
 `)(cfg);
}
function body(id,x,y,r=12){let b={id,x,y,r,baseR:r,angle:0,held:false,heat:.2,volatile:.2,carbon:.7,vertices:[]};hull(b);return b;}
function hull(b){b.vertices=[];for(let i=0;i<6;i++){let a=b.angle+i*Math.PI/3;b.vertices.push([b.x+b.r*Math.cos(a),b.y+b.r*Math.sin(a)]);}}
let checks=0;
for(const cfg of [{},{width:61,left:-20,top:-30,worldWidth:370,height:240},{width:96,inset:12},{width:73,chamber:[[0,0],[320,0],[320,210],[0,210]]}]){
 const a=engine(before,cfg),b=engine(after,cfg),aa=[],bb=[];
 for(let frame=0;frame<160;frame++){
  if(frame%19===0&&aa.length<8){aa.push(body(frame,70+(frame%7)*20,100+frame%50));bb.push(body(frame,70+(frame%7)*20,100+frame%50));}
  if(frame%23===0&&aa.length>2){aa.shift();bb.shift();}
  for(let j=0;j<aa.length;j++)for(const s of [aa,bb]){const p=s[j];p.x+=Math.sin(frame*.13+j)*.18;p.y+=Math.cos(frame*.17+j)*.21;p.r*=.998;p.angle+=.003;p.held=frame%41===j;hull(p);}
  if(frame===50||frame===105){const shape=frame===50?[[0,0],[120,0],[180,35],[320,0],[320,210],[0,210]]:[[0,20],[320,20],[320,210],[0,210]];a.setChamber(shape);b.setChamber(shape);}
  if(frame===80){a.reset();b.reset();}
  assert.equal(a.step(aa),b.step(bb));assert.deepEqual(a.snapshot(),b.snapshot(),'geometry '+JSON.stringify(cfg)+' frame '+frame);checks++;
 }
}
// Explicit lifecycle cases supplement moving/shrinking bodies above. In particular,
// removal and pure shrink must exercise the no-displaced-donor remap path alone.
for (const cfg of [{width:8},{width:49,inset:10},{width:97,left:-20,top:-30,worldWidth:370,height:240}]) {
 const a=engine(before,cfg),b=engine(after,cfg);
 function step(chunks,name) {
  assert.equal(a.step(chunks),b.step(chunks),name+' return');
  assert.deepEqual(a.snapshot(),b.snapshot(),name+' '+JSON.stringify(cfg));
  checks++;
 }
 function chamber(points) { a.setChamber(points);b.setChamber(points); }
 step([],'initial empty');
 step([],'unchanged signature');
 let fuel=body(1,160,110,30);
 step([fuel],'add fuel');
 for (let i=0;i<12;i++) {
  fuel.r*=.80;hull(fuel);
  step([fuel],'pure shrink '+i);
 }
 step([],'remove last fuel, only uncover');
 fuel=body(2,160,100,10000);
 step([fuel],'cover every fluid cell');
 fuel.held=true;
 step([fuel],'hold giant, uncover everything');
 fuel.held=false;
 step([fuel],'release giant, no fluid destination');
 step([],'remove giant');
 const narrow=[[140,90],[180,90],[180,130],[140,130]];
 const wide=[[-200,-200],[600,-200],[600,600],[-200,600]];
 chamber(narrow);step([],'restrict chamber only');
 chamber(wide);step([],'expand chamber only');
 chamber([]);step([],'zero fluid chamber');
 chamber(wide);step([],'reopen chamber');
 chamber(narrow);chamber(wide);step([],'multiple chamber changes before geometry');
 chamber(wide);step([],'same chamber object');
 wide[0][0]--;chamber(wide);step([],'mutated same reference keeps old behavior');
 const parent=body(12,160,100,20);
 step([parent],'parent');
 const child1=body(13,155,100,15),child2=body(14,175,100,15);
 a.inherit(child1,parent);b.inherit(child1,parent);
 a.inherit(child2,parent);b.inherit(child2,parent);
 step([child1,child2],'split inheritance');
 a.reset();b.reset();
 step([child2],'reset retains chamber but clears slots');
 const full=Array.from({length:52},(_,i)=>body(i+100,10+(i%12)*26,30+Math.floor(i/12)*28,16));
 step(full,'capacity overflow');
 step(full.slice(5,45),'slots removed');
}
console.log('Fire geometry: '+checks+' exact geometry/upload states; unchanged WGSL.');
if(process.env.BENCH==='1'){
 const cfg={width:368},original=engine(before,cfg),candidate=engine(after,cfg),aa=[body(1,160,160,30)],bb=[body(1,160,160,30)];
 function timed(e,bs){const t=performance.now();for(let i=0;i<120;i++){bs[0].r-=.001;bs[0].angle+=.0001;hull(bs[0]);e.step(bs);}return performance.now()-t;}
 let old=[],next=[];for(let i=0;i<8;i++){if(i%2){next.push(timed(candidate,bb));old.push(timed(original,aa));}else{old.push(timed(original,aa));next.push(timed(candidate,bb));}}
 console.log(JSON.stringify({referenceMs:old,candidateMs:next}));
}
