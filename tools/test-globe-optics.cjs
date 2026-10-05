#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const optics=require('../js/globe-optics.js');
const DEG=Math.PI/180,PI=Math.PI,zero={x:0,y:0,z:0};
function close(actual,expected,tolerance,label){assert(Number.isFinite(actual),label+' is finite');assert(Math.abs(actual-expected)<=tolerance,label+': '+actual+' versus '+expected);}
const sun={center:{x:0,y:0,z:75},radius:75*Math.sin(.535*DEG/2)};
const a=.535*DEG/2;
function body(distance,radius,angle,azimuth=0,name='body'){
  return {center:{x:distance*Math.sin(angle)*Math.cos(azimuth),y:distance*Math.sin(angle)*Math.sin(azimuth),z:distance*Math.cos(angle)},radius,name};
}
close(optics.circleOverlapArea(1,1,1),2*PI/3-Math.sqrt(3)/2,1e-12,'known equal-circle lens');
close(optics.circleOverlapArea(3,1,0),PI,1e-12,'contained circle');
close(optics.circleOverlapArea(1,1,2),0,0,'external tangent');
close(optics.circleOverlapArea(3,1,2),PI,1e-12,'internal tangent');
close(optics.capOverlapArea(PI/2,PI/2,PI/2),PI,1e-12,'quarter-sphere cap lens');
close(optics.capOverlapArea(a,a,0),4*PI*Math.sin(a/2)**2,1e-14,'coincident caps');
assert.throws(()=>optics.circleOverlapArea(-1,1,0),RangeError);
assert.throws(()=>optics.capOverlapArea(2,1,1),RangeError);
close(optics.angleBetween({x:1,y:0,z:0},{x:1,y:1e-9,z:0}),1e-9,1e-18,'small vector angle does not lose acos precision');
const earthAngle=Math.asin(1/4),moonAngle=Math.asin(.273/5.5);
const earth=body(4,1,earthAngle,0,'Earth');
const moon=body(5.5,.273,moonAngle,PI/2,'Moon');
// Independent reference: equal-solid-angle midpoint grid and quadratic
// ray/sphere intersections. It never calls the production cap/arc functions.
function reference(spheres,u=.6,rings=1100,spokes=1600){
  let visible=0,total=0,visibleFlux=0,totalFlux=0;
  const height=1-Math.cos(a),sinA=Math.sin(a),cosines=[],sines=[];
  for(let j=0;j<spokes;j++){const angle=2*PI*(j+.5)/spokes;cosines.push(Math.cos(angle));sines.push(Math.sin(angle));}
  for(let i=0;i<rings;i++){
    const z=1-height*(i+.5)/rings,r=Math.sqrt(Math.max(0,1-z*z)),mu=Math.sqrt(Math.max(0,1-r*r/(sinA*sinA))),intensity=1-u+u*mu;
    for(let j=0;j<spokes;j++){
      const x=r*cosines[j],y=r*sines[j];let hit=false;
      for(const sphere of spheres){
        const p=sphere.center,along=x*p.x+y*p.y+z*p.z,discriminant=along*along-(p.x*p.x+p.y*p.y+p.z*p.z-sphere.radius*sphere.radius);
        if(along>0&&discriminant>=0&&along-Math.sqrt(discriminant)<75-sun.radius){hit=true;break;}
      }
      total++;totalFlux+=intensity;
      if(!hit){visible++;visibleFlux+=intensity;}
    }
  }
  return {visibleFraction:visible/total,fluxFraction:visibleFlux/totalFlux};
}
const fixtures=[
  {name:'Earth center on solar limb',spheres:[earth]},
  {name:'Earth thin last light',spheres:[body(4,1,earthAngle-.85*a)]},
  {name:'Moon partial coverage',spheres:[body(5.5,.273,moonAngle+.4*a)]},
  {name:'Earth and Moon perpendicular partial limbs',spheres:[earth,moon]},
  {name:'overlapping partial limbs',spheres:[earth,body(5.5,.273,moonAngle+.1*a,.4)]},
  {name:'annular small foreground body',spheres:[body(5,.0125,0)]}
];
let maximumAreaError=0,maximumFluxError=0;
for(const fixture of fixtures){
  const result=optics.sunVisibility(zero,sun,fixture.spheres),expected=reference(fixture.spheres);
  const areaError=Math.abs(result.visibleFraction-expected.visibleFraction),fluxError=Math.abs(result.fluxFraction-expected.fluxFraction);
  close(result.visibleFraction,expected.visibleFraction,.001,fixture.name+' area');
  close(result.fluxFraction,expected.fluxFraction,.001,fixture.name+' flux');
  assert(result.samples<=80,'quadrature bounded to 80 continuous radial samples for two bodies');
  maximumAreaError=Math.max(maximumAreaError,areaError);maximumFluxError=Math.max(maximumFluxError,fluxError);
}
const full=optics.sunVisibility(zero,sun,[body(4,1,0)]),clear=optics.sunVisibility(zero,sun,[]);
assert.equal(full.visibleFraction,0);assert.equal(full.fluxFraction,0);assert.equal(full.samples,0);
assert.equal(clear.visibleFraction,1);assert.equal(clear.fluxFraction,1);assert.equal(clear.samples,0);
assert.equal(optics.sunVisibility(zero,sun,[body(90,1,0)]).visibleFraction,1,'sphere behind source does not occult it');
assert.equal(optics.sunVisibility(zero,sun,[{center:zero,radius:1}]).visibleFraction,0,'inside body cannot see Sun');
const one=optics.sunVisibility(zero,sun,[earth]);
const sameCap=body(1.092,.273,earthAngle,0,'Moon');
const hiddenMoon=optics.sunVisibility(zero,sun,[earth,sameCap]);
close(hiddenMoon.fluxFraction,one.fluxFraction,1e-9,'same cap cannot dim Sun twice');
const uniform=optics.sunVisibility(zero,sun,[earth],{limbDarkening:0});
assert.equal(uniform.fluxFraction,uniform.visibleFraction,'uniform single disk uses analytic flux');
// A hidden bright solar center reduces flux more than area; a hidden dim limb
// reduces flux less than area. These are measurable checks on limb weighting.
const central=optics.sunVisibility(zero,sun,[body(5,.0125,0)]);
assert(central.fluxFraction<central.visibleFraction,'central occultation removes bright photosphere');
const limb=optics.sunVisibility(zero,sun,[body(5.5,.273,moonAngle+.7*a)]);
assert(limb.fluxFraction>limb.visibleFraction,'limb occultation removes dimmer photosphere');
let previous=-1,previousFlux=-1;
for(let i=0;i<=400;i++){
  const result=optics.sunVisibility(zero,sun,[body(4,1,earthAngle+a*(-1.001+2.002*i/400))]);
  assert(result.visibleFraction>=previous-1e-8,'Earth contact area changes monotonically');
  assert(result.fluxFraction>=previousFlux-1e-6,'Earth contact flux changes monotonically');
  if(i)assert(result.fluxFraction-previousFlux<.01,'small camera steps have no point-sampling jumps');
  previous=result.visibleFraction;previousFlux=result.fluxFraction;
}
function translate(sphere,shift){return {...sphere,center:{x:sphere.center.x+shift.x,y:sphere.center.y+shift.y,z:sphere.center.z+shift.z}};}
const shift={x:13,y:-22,z:9};
const moved=optics.sunVisibility(shift,translate(sun,shift),[translate(earth,shift),translate(moon,shift)]);
const original=optics.sunVisibility(zero,sun,[earth,moon]);
close(moved.fluxFraction,original.fluxFraction,1e-9,'translation uses actual camera-relative disks');
function rotate(v){return {x:v.y,y:v.z,z:v.x};}
const rotated=optics.sunVisibility(zero,{...sun,center:rotate(sun.center)},[earth,moon].map(s=>({...s,center:rotate(s.center)})));
close(rotated.fluxFraction,original.fluxFraction,1e-9,'orientation does not change occultation');
const frame=optics.frameEarthSun(4,1,35*DEG,a,4*DEG);
close(frame.earthAngularRadius/DEG,14.477512185929925,1e-10,'Earth apparent radius');
close(frame.aimShift/DEG,10.394993907035036,1e-10,'Earth/Sun interval aim');
close(frame.horizontalFov/DEG,57.74501218592992,1e-10,'frame fits Earth and Sun at physical bearing');
const projected=optics.projectDirection({x:Math.sin(20*DEG),y:0,z:-Math.cos(20*DEG)},{x:0,y:0,z:4},zero,{x:0,y:1,z:0},42*DEG,2);
close(projected.horizontalAngle/DEG,20,1e-10,'camera horizontal bearing');assert(projected.inside);
assert(!optics.projectDirection({x:0,y:0,z:1},{x:0,y:0,z:4},zero,{x:0,y:1,z:0},42*DEG,1).inside,'behind-camera source is outside');
console.log('Globe optics passed. Independent ray-grid max area error '+maximumAreaError.toExponential(3)+', max limb-weighted flux error '+maximumFluxError.toExponential(3)+'.');
