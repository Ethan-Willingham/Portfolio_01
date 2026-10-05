'use strict';
const assert=require('node:assert/strict');
const D=require('../js/globe-data.js');
let checks=0;
function check(name,test){test();checks++;console.log('PASS '+name);}
function image(width,height,covered){
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels.set([73,119,163,covered(x,y)?255:0],(y*width+x)*4);
  return pixels;
}
function alpha(pixels,width,x,y){return pixels[(y*width+x)*4+3];}
check('coverage feather preserves every RGB value and never creates observed pixels',()=>{
  const source=image(1024,512,(x,y)=>y>120&&y<400&&x>50&&x<980),before=source.slice(),result=D.featherCoverage(source,1024);
  assert.deepEqual(source,before);
  for(let i=0;i<source.length;i+=4){assert.deepEqual(result.slice(i,i+3),source.slice(i,i+3));assert.ok(result[i+3]<=source[i+3]);if(!source[i+3])assert.equal(result[i+3],0);}
});
check('straight observed boundary becomes a monotone narrow fade with an intact interior',()=>{
  const width=1024,result=D.featherCoverage(image(width,64,(x,y)=>y>=16),width);
  const row=Array.from({length:12},(_,dy)=>alpha(result,width,512,16+dy));
  assert.ok(row[0]>0&&row[0]<128);assert.ok(row[1]>row[0]&&row[2]>row[1]);assert.equal(row[8],255);
  assert.equal(alpha(result,width,512,15),0);assert.equal(alpha(result,width,512,48),255);
});
check('the same angular distance has the same fade at phone and desktop resolution',()=>{
  const a=D.featherCoverage(image(1024,32,(x,y)=>y>=8),1024),b=D.featherCoverage(image(2048,64,(x,y)=>y>=16),2048);
  for(const dy of[1,2,3,4])assert.equal(alpha(a,1024,512,7+dy),alpha(b,2048,1024,15+2*dy));
});
check('longitude seam wraps without a fictitious missing border',()=>{
  const width=1024,covered=D.featherCoverage(image(width,32,()=>true),width);
  assert.equal(alpha(covered,width,0,16),255);assert.equal(alpha(covered,width,width-1,16),255);
  const seam=D.featherCoverage(image(width,32,x=>x!==width-1),width);
  assert.equal(alpha(seam,width,width-1,16),0);assert.equal(alpha(seam,width,0,16),alpha(seam,width,width-2,16));
  assert.equal(alpha(seam,width,20,16),255);
});
check('existing partial alpha is bounded and empty coverage stays empty',()=>{
  const source=image(1024,32,(x,y)=>y>8);source[(24*1024+512)*4+3]=127;
  assert.equal(alpha(D.featherCoverage(source,1024),1024,512,24),127);
  const empty=image(16,8,()=>false);assert.deepEqual(D.featherCoverage(empty,16),empty);
});
check('malformed image dimensions are rejected',()=>{
  for(const width of[0,1,2.5,NaN])assert.throws(()=>D.featherCoverage(new Uint8ClampedArray(32),width));
  assert.throws(()=>D.featherCoverage(new Uint8ClampedArray(31),4));
});
console.log(checks+' imagery checks passed');
