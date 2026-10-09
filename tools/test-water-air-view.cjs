const assert=require('node:assert/strict');
const V=require('../js/water-machines-pressure-view.js');
function sample(width,height,mask){
  const cells=new Float32Array(width*height*8),bits=new Uint32Array(cells.buffer),labels=new Uint32Array(width*height*2);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,r=mask(x,y);bits[i*8+3]=r===-1 ? 1 : r===-2 ? 0 : 2;labels[i*2]=Math.max(0,r);
  }
  return {width,height,cellSize:8,cells,labels,pockets:[{root:0,pressure:30000},{root:1,pressure:-50000}],simulationTime:1};
}
let s=sample(40,30,(x,y)=>y>18 ? -1 : x===20 ? -2 : x<20 ? 1 : 2);
let view=V.analyze(s,{vessels:[{rect:{x:0,y:0,width:160,height:240}},{rect:{x:168,y:0,width:152,height:240}}]});
assert.equal(view.labels.length,2);
for(const run of view.runs)for(let x=run.x;x<run.x+run.width;x+=8){
  const i=Math.floor(run.y/8)*s.width+x/8;assert.equal(s.labels[i*2],run.root);assert.equal(new Uint32Array(s.cells.buffer)[i*8+3],2);
}
assert.deepEqual(V.analyze(sample(30,30,()=>0)).runs,[],'Room air stays clear');
assert.deepEqual(V.analyze(sample(30,30,()=>-1)).runs,[],'Water stays clear');
assert.equal(V.pressureText(.034,false),'+0.03 psi');
assert.equal(V.pressureText(-.034,false),'-0.03 psi');
assert.equal(V.pressureText(-.001,false),'0.00 psi');
assert.equal(V.pressureText(-10,true),'Vapor');
// Random gaps and pocket boundaries: the complete label must fit in its gas,
// without crossing a thin wall or overlaying a liquid cell.
let random=17;const next=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
for(let seed=0;seed<100;seed++){
  s=sample(40,30,(x,y)=>y<12&&x<16 ? 1 : y<13&&x>20 ? 2 : next()<.3 ? -1 : next()<.2 ? 0 : x<20 ? 1 : 2);
  const before=Buffer.from(s.cells.buffer).toString('base64');
  view=V.analyze(s,{labelWidth:80,labelHeight:24});assert(view.labels.length<=3);
  for(const label of view.labels){
    for(let y=Math.floor((label.y-12)/8);y<Math.ceil((label.y+12)/8);y++)for(let x=Math.floor((label.x-40)/8);x<Math.ceil((label.x+40)/8);x++){
      assert(x>=0&&y>=0&&x<s.width&&y<s.height);const i=y*s.width+x;
      assert.equal(s.labels[i*2],label.root);assert.equal(new Uint32Array(s.cells.buffer)[i*8+3],2);
    }
  }
  assert.equal(Buffer.from(s.cells.buffer).toString('base64'),before,'View never mutates water');
}
console.log('PASS air-only masking, room transparency, pressure units, label clearance across 100 gap layouts and read-only samples.');
