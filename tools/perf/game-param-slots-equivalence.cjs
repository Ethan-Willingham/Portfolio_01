// CPU proof: every live-consumed immutable GameParams buffer remains byte-identical.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const beforeSource=process.env.BEFORE?fs.readFileSync(process.env.BEFORE,'utf8'):execFileSync('git',['show',(process.env.BASE_REF||'4219c6f6c5e2bf86316d5e14ac156720f0184598')+':js/liquid-wgpu.js'],{encoding:'utf8',maxBuffer:4*1024*1024});
const afterSource=fs.readFileSync(process.env.AFTER||'js/liquid-wgpu.js','utf8');
function engine(source){const c={console};c.window=c;vm.createContext(c);vm.runInContext(source.replace('  window.LiquidWGPU =','  window.__params={writeGameParams,slots:GS_FRAME_SLOTS,lanes:GS_PARAM_LANES};\n  window.LiquidWGPU ='),c);return c.__params;}
const before=engine(beforeSource),after=engine(afterSource);assert.equal(after.slots,5);assert.equal(after.lanes,before.lanes);
assert.match(afterSource,/writeGameParams\(instance, subSteps, true\);/,'Only the live frame opts into active slots');
assert.equal((afterSource.match(/writeGameParams\(instance, subSteps, true\);/g)||[]).length,1);
let state,seed=937,checks=0,savedWrites=0,totalBefore=0,totalAfter=0;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function setup(api){const writes=[],buffers=Array.from({length:api.slots},()=>new Uint8Array(api.lanes*4));return{writes,buffers,instance:{gameParamsHost:new Float32Array(api.lanes*api.slots),gameParamsBufs:buffers,stepDt:1/240,liquid:{getGameState:()=>state},queue:{writeBuffer(buf,offset,data){const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);buf.set(bytes,offset);writes.push(buf);}}}};}
const a=setup(before),b=setup(after);
function snapshot(frame){if(frame%19===0)return null;const guests=Array.from({length:frame%11},(_,g)=>{const n=(g+frame)%24,pts=new Float32Array(n*4),x=rand()*900,y=rand()*200;for(let p=0;p<n;p++){const t=p/Math.max(1,n)*Math.PI*2;pts[p*4]=x+Math.cos(t)*(18+g);pts[p*4+1]=y+Math.sin(t)*(23-g*.5);pts[p*4+2]=(rand()-.5)*2000;pts[p*4+3]=(rand()-.5)*1500;}const out={x,y,hw:20,hh:23,skin:g%2===0,convex:g%3===0?1:0,pts};if(g%2){out.mvx=(rand()-.5)*1800;out.mvy=(rand()-.5)*1800;}return out;});return{player:{active:frame%7!==0,x:rand()*900,y:rand()*200,vx:(rand()-.5)*500,vy:(rand()-.5)*500,dir:frame%2?1:-1},rocket:{active:frame%3===0,intensity:rand(),exDirX:rand(),exDirY:rand(),nozzles:Array.from({length:6},()=>({x:rand()*30,y:rand()*30}))},explosions:Array.from({length:frame%12},()=>({cx:rand()*500,cy:rand()*50,r:rand()*70,blastScale:rand()})),guests};}
for(let frame=0;frame<240;frame++){
 state=snapshot(frame);const subSteps=[1,2,5,3,4,0,7,-1,2.9][frame%9],slots=Math.max(1,Math.min(5,subSteps|0));
 a.writes.length=b.writes.length=0;before.writeGameParams(a.instance,subSteps);after.writeGameParams(b.instance,subSteps,true);
 assert.equal(a.writes.length,5);assert.equal(b.writes.length,slots);
 for(let slot=0;slot<slots;slot++){assert.deepEqual(b.buffers[slot],a.buffers[slot],`live ${frame}/${slot}`);checks++;}
 totalBefore+=a.writes.length;totalAfter+=b.writes.length;savedWrites+=5-slots;
 if(frame%7===0){before.writeGameParams(a.instance,subSteps);after.writeGameParams(b.instance,subSteps);for(let slot=0;slot<5;slot++){assert.deepEqual(b.buffers[slot],a.buffers[slot],`standalone ${frame}/${slot}`);checks++;}}
}
console.log(JSON.stringify({passed:true,frames:240,exactConsumedBuffers:checks,totalBefore,totalAfter,savedWrites,bytesPerBuffer:after.lanes*4}));
