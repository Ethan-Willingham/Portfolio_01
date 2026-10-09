#!/usr/bin/env node
'use strict';
// Independent SI dimensional check of the saved experimental calibration.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const I=require('../js/water-machines-instruments.js');
const root='/Users/ethan/Portfolio_01/research/water-machines';
const input=root+'/physical-earth-scale-20c.json',bytes=fs.readFileSync(input),saved=JSON.parse(bytes);
const checks=[];
function check(name,pass,detail){checks.push({name,pass:!!pass,detail});}
const inchMeters=.0254,psiPa=6894.757293168361,earthSI=9.80665,waterSI=1000;
const results=[];
for(const width of [400,1600])for(const density of [1,4]){
  const lengthSI=30*inchMeters/width,seconds=Math.sqrt(250*lengthSI/earthSI);
  // rho_native g_native dz_native and rho_SI g_SI dz_SI are the same head.
  const pressurePaPerNative=waterSI*earthSI*lengthSI/(density*250);
  const scale=I.scale({width,density});
  const timeRelative=Math.abs(scale.seconds(1)-seconds)/seconds;
  const pressureRelative=Math.abs(scale.psi(1)*psiPa-pressurePaPerNative)/pressurePaPerNative;
  check('width'+width+' density'+density+' clock has independent Earth dimensions',timeRelative<1e-6,{seconds,timeRelative});
  check('width'+width+' density'+density+' pressure has independent hydrostatic dimensions',pressureRelative<1e-6,{pressurePaPerNative,pressureRelative});
  const headNative=123.5,pNative=density*250*headNative,pSI=waterSI*earthSI*lengthSI*headNative;
  check('width'+width+' density'+density+' arbitrary hydrostatic head agrees in SI',Math.abs(scale.psi(pNative)*psiPa-pSI)/pSI<1e-6);
  results.push({width,density,lengthMetersPerNative:lengthSI,secondsPerSimulationSecond:seconds,pressurePaPerNative,timeRelative,pressureRelative});
}
const world=saved.world,scale=I.scale({width:world.widthNative,density:world.instrumentFormula.density,referenceGravity:world.instrumentFormula.referenceGravity});
const roomPa=scale.psi(world.atmosphereNative)*psiPa;
check('saved calibration uses the apparatus width and variational physical density',world.widthNative===1600&&world.widthInches===30&&world.instrumentFormula.density===1);
check('saved atmosphere maps to the declared Earth pressure',Math.abs(roomPa-world.earthAtmospherePa)/world.earthAtmospherePa<1e-6,{roomPa});
check('saved vapor and gauge floor share the same pressure conversion',Math.abs(saved.vaporNative/world.nativePressurePerPa-saved.vaporPa)<1e-9&&Math.abs(saved.minimumGaugeNative-(saved.vaporNative-world.atmosphereNative))<1e-9);
check('saved critical J follows the native density-linear constitutive law',Math.abs(saved.criticalWaterJ-saved.bulkNative/(saved.bulkNative+saved.minimumGaugeNative))<1e-14);
check('saved bulk uses material density1 without multiplying the intrinsic aux reference4',saved.bulkNative===saved.soundNative**2&&saved.world.instrumentFormula.density===1);
const soundMetersPerSecond=scale.speed(saved.soundNative)*inchMeters;
check('converted acoustic speed is finite and uses the same simulation clock',soundMetersPerSecond>103&&soundMetersPerSecond<105,{soundMetersPerSecond});
check('a quarter-width interpretation cannot masquerade as this calibration',Math.abs(I.scale({width:400}).psi(world.atmosphereNative)*psiPa/roomPa-4)<1e-14);
const report={pass:checks.every(c=>c.pass),checks,results,roomPa,soundMetersPerSecond,input,inputSHA256:crypto.createHash('sha256').update(bytes).digest('hex'),scope:'Independent SI dimensional check of the saved 1600-pixel, 30-inch, rho1 experimental calibration. No phase, coupled-solve or machine acceptance.'};
fs.writeFileSync(root+'/physical-earth-scale-dimensional-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,checks:checks.length,roomPa,soundMetersPerSecond,failures:checks.filter(c=>!c.pass)},null,2));
assert.equal(report.pass,true);
