import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { density, projectedDensity, BOHR_METERS, BEAT_SECONDS, MODEL_TIME_PER_SECOND } from '../js/descent-bootstrap-room.js';
import { verifyBeaconSeed, ROUND_42, QUICKNET, offlineSeed, fetchBeaconSeed } from '../js/descent-seed.js';
const require = createRequire(import.meta.url);
function simpson(f,a,b,n=8000) {
  const h = (b-a)/n; let s = f(a)+f(b);
  for(let i=1;i<n;i++)s+=(i%2?4:2)*f(a+i*h);
  return s*h/3;
}
const radial = r => .25*4*r*r*Math.exp(-2*r) + .75*r**4*Math.exp(-r)/24;
const norm = simpson(radial,0,60), mean = simpson(r=>r*radial(r),0,60);
assert.ok(Math.abs(norm-1)<2e-9,`3D basis norm ${norm}`);
assert.ok(Math.abs(mean-4.125)<2e-9,`mean radius ${mean}`);
assert.ok(Math.abs(MODEL_TIME_PER_SECOND*BEAT_SECONDS*.375-2*Math.PI)<1e-14);
for(const phase of [0,.2,1.1,Math.PI,2*Math.PI])for(const p of [[0,0,0],[1,0,2],[1,0,-2],[3,2,1]]) {
  const d=density(...p,phase);assert.ok(d>=0&&Number.isFinite(d));
  assert.ok(Math.abs(d-density(...p,phase+2*Math.PI))<1e-15);
}
assert.ok(Math.abs(projectedDensity(1,2,0)-projectedDensity(1,-2,Math.PI))<1e-15);
const verified=await verifyBeaconSeed(ROUND_42); assert.equal(verified.seed,ROUND_42.randomness); assert.equal(verified.chainHash,QUICKNET.hash);
// Rehash an altered signature too, so rejection demonstrates BLS verification
// and does not stop solely at the SHA-256 relationship check.
const signature='85'+ROUND_42.signature.slice(2);
const bad={...ROUND_42,signature,randomness:createHash('sha256').update(Buffer.from(signature,'hex')).digest('hex')};
await assert.rejects(()=>verifyBeaconSeed(bad));
await assert.rejects(()=>verifyBeaconSeed({...ROUND_42,round:43}));
await assert.rejects(()=>fetchBeaconSeed({fetcher:async()=>{throw Error('offline')}}),/offline/);
assert.equal(offlineSeed().source,'Offline reproducible preset');
console.log(JSON.stringify({norm,error:Math.abs(norm-1),meanRadiusBohr:mean,meanRadiusNm:mean*BOHR_METERS*1e9,beatWatchingSeconds:BEAT_SECONDS,goodBLS:true,alteredSignatureRejected:true},null,2));
if(process.argv.includes('--write-still')) {
  const sharp=require('sharp');const width=800,height=500,samples=96;
  const data=Buffer.alloc(width*height*3);
  const linearTint=[.6583748173,.5520114,.3515326];
  const srgb=c=>c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const px=((x+.5)/width*2-1)*width/height*10,pz=(1-(y+.5)/height*2)*10;
    const radiance=projectedDensity(px,pz,0,samples)**.68*7;
    for(let c=0;c<3;c++){const v=radiance*linearTint[c];data[(y*width+x)*3+c]=Math.round(srgb(v/(1+v))*255);}
  }
  await sharp(data,{raw:{width,height,channels:3}}).png().toFile(new URL('../assets/visualizer/descent/hydrogen-still.png',import.meta.url).pathname);
  writeFileSync(new URL('../assets/visualizer/descent/hydrogen-still-origin.json',import.meta.url),JSON.stringify({origin:'CPU analytic probability density projection, not a GPU capture or laboratory image',basis:'25% 1s, 75% 2p_z',phase:0,width,height,depthSamples:samples,projectionBoundsBohr:[-16,16],presentation:'density^0.68 * 7, linear cream tint, Reinhard then sRGB',meanRadiusMeters:mean*BOHR_METERS},null,2)+'\n');
}
