const fs=require('fs'),assert=require('assert/strict'),path=require('path');
const s=fs.readFileSync(process.env.LIQUID_SOURCE||path.join(__dirname,'../js/liquid-wgpu.js'),'utf8');
const a=s.indexOf('  function readbackSlotMap('),b=s.indexOf('  /* ---- Stage 8b',a);
const apply=new Function('OPS_CAPACITY','LIQUID_FAST_VSQ',s.slice(a,b)+';return applyReadback;')(262144,100);
let seed=37;function rnd(n){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed>>>8)%n;}
const keys=['x','y','vx','vy','g00','g01','g10','g11','density','aeration','type','origin','sleeping','frozen','restFrames'];
let assertions=0;
for(let trial=0;trial<1000;trial++){
 const count=20,capacity=120,arrays=Object.fromEntries(keys.map(k=>[k,new Float32Array(capacity)]));
 const pos=new Float32Array(count*4),affine=new Float32Array(count*4),aux=new Float32Array(count*4),flag=new Uint32Array(count);
 const expected=[];
 for(let i=0;i<count;i++){
  const row={x:i+1000,y:i+2000,vx:i+30,vy:i+40,g00:i+.1,g01:i+.2,g10:i+.3,g11:i+.4,density:3.2,aeration:.1,type:5,origin:3,sleeping:i%2,frozen:i%3===0?1:0,restFrames:i};
  pos.set([row.x,row.y,row.vx,row.vy],i*4);affine.set([row.g00,row.g01,row.g10,row.g11],i*4);aux.set([row.density,row.aeration,0,0],i*4);flag[i]=65|12|(row.sleeping<<4)|(row.frozen<<5)|(i<<8);
  for(const k of keys){arrays[k][i]=row[k];row[k]=arrays[k][i];}
  expected.push(row);
  // CPU mirror is intentionally behind captured GPU positions and strain.
  arrays.x[i]-=200;arrays.y[i]-=200;arrays.g00[i]-=.05;
 }
 let live=count,ops=[];
 for(let step=0;step<40;step++){
  const tag=live<2?1:rnd(4)+1;
  if(tag===1){
   const row={};for(const k of keys)row[k]=0;Object.assign(row,{x:rnd(90),y:rnd(90),vx:rnd(20),vy:rnd(20),type:5,origin:3,density:3.2});
   ops.push(1,row.x,row.y,row.vx,row.vy,5,3);for(const k of keys){arrays[k][live]=row[k];row[k]=arrays[k][live];}expected.push(row);live++;
  }else if(tag===2){const i=rnd(live);ops.push(2,i);live--;for(const k of keys)arrays[k][i]=arrays[k][live];expected[i]=expected[live];expected.pop();
  }else if(tag===3){const i=rnd(live),vx=rnd(20),vy=rnd(20),air=.3;
   ops.push(3,i,vx,vy,air,5,3);Object.assign(expected[i],{vx,vy,aeration:Math.fround(air),type:5,origin:3,sleeping:0,frozen:0,restFrames:0});for(const k of ['vx','vy','aeration','type','origin','sleeping','frozen','restFrames'])arrays[k][i]=expected[i][k];
  }else{const i=rnd(live),type=rnd(3)===0?0:expected[i].type;ops.push(4,i,type,3);
   const changed=expected[i].type===5&&type!==5;
   Object.assign(expected[i],{type,origin:3,sleeping:0,frozen:0,restFrames:0});
   if(changed)Object.assign(expected[i],{g00:0,g01:0,g10:0,g11:0,aeration:0});
   for(const k of ['type','origin','sleeping','frozen','restFrames',...(changed?['g00','g01','g10','g11','aeration']:[])])arrays[k][i]=expected[i][k];}

 }
 // Authored lanes retain their current CPU value; new rows remain untouched.
 // This matches the GPU replay while existing unedited rows use the capture.
 const rb={};for(const [k,v]of Object.entries({pos,affine,aux,flag})){let mapped=false;rb[k]={getMappedRange:()=>{assert(!mapped,'mapped range must not overlap');mapped=true;return v.buffer;},unmap:()=>{}};}
 const cut=rnd(ops.length+1); // Split only at an actual operation boundary.
 let split=0;while(split<cut){const n=ops[split]===2?2:ops[split]===4?4:7;if(split+n>cut)break;split+=n;}
 const instance={rb,readbackCount:count,readbackPending:true,readbackResolved:true,readbackSeq:1,readbackOpsSeq:2,readbackOps:ops.slice(0,split),readbackCaptureTime:7,liquid:{getCount:()=>live,getMutationSeq:()=>3,peekOps:()=>ops.slice(split),arrays}};
 if(split===ops.length){instance.liquid.getMutationSeq=()=>2;}
 apply(instance);
 assert.equal(instance.readbackApplyGen,1,'accepted remapped snapshot');
 for(let i=0;i<live;i++)for(const k of keys){
  // WAKE conservatively retains authored strain/aeration lanes; after a
  // subsequent POKE, actual CPU values are also the latest authored values.

  assert.equal(arrays[k][i],expected[i][k],`${trial} row ${i} ${k}`);assertions++;
 }
 assert.equal(instance.readbackPending,false);
}
for(const mode of ['invalidated','missing-log','overflow','bad-tag','wrong-count']){
 const arrays=Object.fromEntries(keys.map(k=>[k,new Float32Array([77,88])]));
 const saved=JSON.stringify(arrays),buffer=new ArrayBuffer(32);
 const rb=Object.fromEntries(['pos','aux','affine','flag'].map(k=>[k,{getMappedRange:()=>buffer,unmap:()=>{}}]));
 const instance={rb,readbackCount:2,readbackPending:true,readbackResolved:true,readbackSeq:1,readbackOpsSeq:1,readbackOps:mode==='bad-tag'?[99]:[],readbackOpsInvalid:mode==='invalidated',liquid:{arrays,getCount:()=>mode==='wrong-count'?1:2,getMutationSeq:()=>['missing-log','overflow'].includes(mode)?2:1}};
 if(mode==='overflow')instance.liquid.peekOps=()=>null;
 apply(instance);assert.equal(JSON.stringify(arrays),saved,mode+' preserves mirror');assert(!instance.readbackApplyGen,mode+' does not advance generation');assert.equal(instance.readbackPending,false);assertions+=3;
}
console.log(JSON.stringify({pass:true,cases:1005,assertions}));
