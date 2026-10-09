#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const I=require('../js/water-machines-instruments.js');
function near(a,b,tolerance=1e-8){assert(Math.abs(a-b)<tolerance*Math.max(1,Math.abs(b)),`${a} versus ${b}`);}
const scale=I.scale({width:960});
near(scale.inches(960),30);
near(scale.speed(Math.sqrt(2*250*96)),Math.sqrt(2*386.0886*3));
near(scale.psi(250*96),0.0361273*3);
near(scale.volume(960*32),30);
const def={measure:{outlet:{y:240},nozzle:{y:60}},pipes:[{points:[{y:200}]}]};
near(I.prediction('heron',{basin:60,bottom:260,source:160},def,250).head,100);
near(I.prediction('siphon',{source:200},def,250).speed,Math.sqrt(20000));
assert.equal(I.prediction('siphon',{source:null},def,250).speed,null);
near(I.gasWork(0,100,1000),0);
assert(I.gasWork(100,100,1000)>0);
assert.throws(()=>I.gasWork(-1000,100,1000));
const meter={a:{x:5,y:0},b:{x:5,y:10},axis:'x',positive:1};
const crossings=I.createCrossings(meter);
const particles=(x,y,time)=>({count:x.length,x,y,time});
crossings.sample(particles([4,4,6],[3,30,6],0));
let result=crossings.sample(particles([6,6,4],[3,30,6],.5));
near(result.totalForwardArea,1.5625);near(result.totalBackwardArea,1.5625);near(result.netArea,0);
assert.equal(crossings.sample(particles([6,6,4],[3,30,6],.5)),result);
result=crossings.sample(particles([7],[3],1));
assert.equal(result.dt,0);near(result.totalForwardArea,1.5625);
const cells=new Float32Array(8*4),bits=new Uint32Array(cells.buffer),pressure=new Float32Array(16);
for(let i=0;i<4;i++){cells[i*8]=.5;bits[i*8+3]=1;pressure[i*4]=50;pressure[i*4+1]=20;}
const snapshot={width:2,height:2,cellSize:5,cells,pressure,labels:new Uint32Array(8),simulationTime:2};
result=I.section(snapshot,meter);near(result.areaPerSecond,100);near(result.speed,20);near(result.pressure,50);
bits[3]=0;bits[8+3]=0;
assert.equal(I.cell(snapshot,-1,0),null);
near(I.quantile([20,2,10,4],.5),7);
const initialEnergy=I.waterEnergy({count:2,y:[20,30],vx:[3,0],vy:[4,0],time:0},{floor:100,gravity:250});
near(initialEnergy.potential,250*150*1.5625);near(initialEnergy.kinetic,12.5*1.5625);
const fallingEnergy=I.waterEnergy({count:1,y:[30],vx:[0],vy:[Math.sqrt(2*250*10)],time:1},{floor:100,gravity:250});
near(fallingEnergy.total,250*80*1.5625);
bits[3]=1;cells[0]=.5;pressure[0]=100;
near(I.acousticEnergy(snapshot,1,500),10000/500000*.5*25+2500/500000*.5*25*2);
snapshot.geometry=new Float32Array(32);snapshot.geometry[0]=.6;
near(I.cell(snapshot,2,2).accessibleArea,10,1e-6);
near(I.acousticEnergy(snapshot,1,500),10000/500000*.5*10+2500/500000*.5*25*2,1e-7);
const particleFlow=I.particleSection({count:3,x:[4,5,6],y:[2,5,30],vx:[10,20,100],vy:[0,0,0],time:2},meter,{thickness:5});
assert.equal(particleFlow.count,2);near(particleFlow.speed,15);near(particleFlow.areaPerSecond,30*1.5625/5);
const material=j=>I.materialEnergy({count:1,density:[4/j],time:7},{density:2,soundSpeed:10,particleArea:3});
near(material(1).energy,0);near(material(.8).energy,600*(-.2-Math.log(.8)));near(material(1.2).energy,600*(.2-Math.log(1.2)));
assert.equal(material(1.2).sampleTime,7);
for(const j of [.68,.8,1,1.2,1.470588]){
  const delta=1e-5,derivative=(material(j+delta).energy-material(j-delta).energy)/(2*delta);
  near(derivative,-3*200*(1/j-1),1e-6);
  assert(material(j).energy>=0);
}
const small=1e-4;near(material(1+small).energy,.5*600*small*small,1e-6);
near(I.materialEnergy({count:0,density:[]},{soundSpeed:500}).energy,0);
assert.throws(()=>I.materialEnergy({count:1,density:[0]},{soundSpeed:500}));
assert.throws(()=>I.materialEnergy({count:1,density:[NaN]},{soundSpeed:500}));
assert.throws(()=>I.materialEnergy({count:1},{soundSpeed:500}));
console.log('PASS instrument scale, Earth-gravity consistency, pressure, Heron head, gas work, particle energies, nonlinear material energy/work identity, sampled crossings and wet-section flux.');
