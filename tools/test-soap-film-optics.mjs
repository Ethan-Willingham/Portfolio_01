import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {reflectance, parseSpectra, integrate} from '../js/soap-film-optics.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'assets/visualizer/soap-film');
const observer=fs.readFileSync(path.join(dir,'CIE_xyz_1931_2deg.csv'),'utf8'),illuminant=fs.readFileSync(path.join(dir,'CIE_std_illum_D65.csv'),'utf8');
const spectrum=parseSpectra(observer,illuminant);
assert.equal(crypto.createHash('md5').update(observer).digest('hex'),'17cca777db64b17170f06f67ce9d3ab7');
assert.equal(crypto.createHash('md5').update(illuminant).digest('hex'),'03d4eb9b837c60671627c946fb534deb');
const ref=JSON.parse(fs.readFileSync(path.join(dir,'optical-checkpoints.json')));
let error=0; for(const row of ref.rows){const c=integrate(row.thickness_nm,0,spectrum);row.XYZ_D65.forEach((v,i)=>{error=Math.max(error,Math.abs(v-c.xyz[i]));assert.ok(Math.abs(v-c.xyz[i])<1e-12);});}
for(const angle of [0,18,45,60])for(let h=0;h<=4000;h+=13)for(let w=360;w<=830;w+=17){const r=reflectance(h,w,angle);assert.ok(r>=0&&r<=1);if(h===0)assert.equal(r,0);}
for(const w of [400,550,700]){assert.ok(reflectance(w/(2*1.333),w)<1e-15);const peak=reflectance(w/(4*1.333),w);assert.ok(peak>reflectance(w/(4*1.333)+5,w));}
assert.ok(integrate(10,0,spectrum).xyz[1]<integrate(25,0,spectrum).xyz[1]);
if(process.argv.includes('--bake')){
 const lut=new Float32Array(4096*31*4);for(let a=0;a<=30;a++)for(let h=0;h<4096;h++){const {rgb}=integrate(h,a*2,spectrum),i=(a*4096+h)*4;lut.set([...rgb,1],i);}
 fs.writeFileSync(path.join(dir,'linear-lut.bin'),Buffer.from(lut.buffer));
 fs.writeFileSync(path.join(dir,'lut.json'),JSON.stringify({width:4096,height:31,thicknessStepNm:1,angleStepDegrees:2,encoding:'little-endian float32 RGBA; unclipped linear sRGB',illumination:'D65 unpolarized directional light reflected at the selected angle; dark transmitted background',observer:'CIE 1931 2 degree',nFilm:1.333,wavelengthNm:[360,830],integration:'1 nm rectangle sum including endpoints',sha256:crypto.createHash('sha256').update(Buffer.from(lut.buffer)).digest('hex'),license:'CC BY-SA 4.0; derived from the two attributed CIE datasets'},null,2)+'\n');
}
console.log(JSON.stringify({pass:true,maxXYZCheckpointError:error,reflectanceBounds:true,zeroLayer:true,phaseExtrema:true,cieMD5:true}));
