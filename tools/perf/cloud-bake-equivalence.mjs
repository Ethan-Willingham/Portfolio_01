// The worker and fallback use the same pure baker. Compare its output with
// the original synchronous renderer at every sprite seed and several tunings.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const file='js/sluice/155-weather.js';
const before=execFileSync('git',['show',(process.env.BASE_REF||'2b587fb')+':'+file],{cwd:root,encoding:'utf8'});
const after=fs.readFileSync(path.join(root,file),'utf8');
function engine(source){return new Function(source+`
  cloudSprites=CLOUD_CLASSES.map(function(C){return Array.from({length:CLOUD_VARIANTS},function(){return {lum:new Uint8ClampedArray(C.tw*C.th),den:new Uint8ClampedArray(C.tw*C.th)};});});
  veilTile={lum:new Uint8ClampedArray(VEIL_TW*VEIL_TH),den:new Uint8ClampedArray(VEIL_TW*VEIL_TH)};
  return {bake:function(c,v,soft,rim,morph){weatherTune.softness=soft;weatherTune.rimGlow=rim;weather.morph=morph;weatherBakeSprite(c,v);return cloudSprites[c][v];},veil:function(){weatherBakeVeil();return veilTile;}};
`)();}
const a=engine(before),b=engine(after);let checks=0;
for(const tune of [[1,1,0],[.6,1.7,1.23],[2.4,.12,-4.8]])for(let c=0;c<3;c++)for(let v=0;v<8;v++){
  const x=a.bake(c,v,...tune),y=b.bake(c,v,...tune);
  assert.deepEqual(y.lum,x.lum);assert.deepEqual(y.den,x.den);checks++;
}
const x=a.veil(),y=b.veil();assert.deepEqual(y.lum,x.lum);assert.deepEqual(y.den,x.den);
console.log('PASS: '+checks+' cloud maps and the veil are byte-identical to the original baker.');
