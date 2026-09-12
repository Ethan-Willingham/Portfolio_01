import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=name=>fs.readFileSync(path.join(root,'js/sluice',name),'utf8');
const hash=read('100-render-terrain.js').match(/  function tileHash01[\s\S]*?\n  }/)[0];
const context=vm.createContext({BG:new Proxy({},{get:()=> '#8894a6'}),TILE:32,SKY_ROWS:4});
vm.runInContext(hash+read('160-render-mountains.js')+read('162-render-mountains-webgl.js'),context);
let polygons=0,strokes=0;
for(const cfg of context.mountainLayers())for(let idx=-160;idx<=160;idx++){
  const paths=context.buildMtnPeakPaths(cfg,128,idx,idx,context.MtnRecordedPath);
  for(const key of ['body','snow'])for(const points of paths[key].lines){
    const out=[];context.mtnTriangulate(out,points);
    let polygon=0,triangles=0;
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];polygon+=a[0]*b[1]-b[0]*a[1];}
    for(let i=0;i<out.length;i+=6)triangles+=Math.abs((out[i+2]-out[i])*(out[i+5]-out[i+1])-(out[i+3]-out[i+1])*(out[i+4]-out[i]));
    assert(Math.abs(Math.abs(polygon)-triangles)<1e-5,'Triangle area equals the original polygon');
    assert(out.every(Number.isFinite));polygons++;
  }
  for(const key of ['rim','left','right','snowLeft','snowRight'])for(const points of paths[key].lines){
    const out=[];context.mtnStrokeTriangles(out,points,.7);assert(out.every(Number.isFinite));strokes++;
  }
}
console.log(`PASS ${polygons} polygon area comparisons and ${strokes} finite stroke meshes`);
