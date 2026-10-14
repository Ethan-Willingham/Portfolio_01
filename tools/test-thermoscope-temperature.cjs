/* CPU author checks. Actual thermal pressure and water motion require GPU proof. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const current=fs.readFileSync('js/liquid-air-wgpu.js','utf8');
const base=cp.execFileSync('git',['show',(process.env.BASE_REF||'9d22a3ee')+':js/liquid-air-wgpu.js'],{encoding:'utf8'});
function fixture(source,options={}){
  const allocations=[],shaders=[],pipelines=[],writes=[],trace=[];
  const queue={writeBuffer(buffer,offset,data){const bytes=new Uint8Array(data.buffer||data,data.byteOffset||0,data.byteLength);writes.push([buffer.label,offset,Array.from(bytes)]);},submit(){}};
  const device={limits:{maxStorageBuffersPerShaderStage:10},
    createBuffer(d){allocations.push([d.label,d.size]);return {...d,destroy(){}};},
    createShaderModule(d){shaders.push(d.code);return {getCompilationInfo:async()=>({messages:[]})};},
    createBindGroupLayout(d){return d;},createPipelineLayout(d){return d;},createBindGroup(d){return d;},
    createComputePipeline(d){pipelines.push(d.compute.entryPoint);return d.compute.entryPoint;}};
  const context={GPUBufferUsage:{STORAGE:1,COPY_DST:2,COPY_SRC:4,UNIFORM:8},GPUShaderStage:{COMPUTE:1},console};
  vm.createContext(context);vm.runInContext(source,context);
  const native={device,queue,cellSize:4,buf:{cellMass:{},cellVelX:{},cellVelY:{}},paramsBuf:{},grid:{cells:9}};
  const model=context.LiquidAirWGPU.create(native,{width:24,height:24,cellSize:8,...options});
  const encoder={beginComputePass(){return {setPipeline(p){trace.push(p);},setBindGroup(){},dispatchWorkgroups(){},end(){}};}};
  return {context,model,allocations,shaders,pipelines,writes,trace,encoder};
}
for(const options of [{},{smokeTemperature:false}]){
  const a=fixture(base,options),b=fixture(current,options);
  assert.deepEqual(b.allocations,a.allocations,'Feature-off buffer allocations');
  assert.deepEqual(b.shaders,a.shaders,'Feature-off compute source');
  assert.deepEqual(b.pipelines,a.pipelines,'Feature-off compiled entries');
  assert.deepEqual(b.writes,a.writes,'Feature-off initial uniform bytes');
  a.model.setEnabled(true);b.model.setEnabled(true);a.model.encode(a.encoder);b.model.encode(b.encoder);
  assert.deepEqual(b.trace,a.trace,'Feature-off pass order');
  assert.throws(()=>b.model.setSmokeTemperature(new Float32Array(9).fill(293.15)),/opt-in/);
}
const cold=fixture(current),hot=fixture(current,{smokeTemperature:true});
assert.equal(hot.allocations.find(x=>x[0]==='liquid.air.gas')[1]-cold.allocations.find(x=>x[0]==='liquid.air.gas')[1],64);
hot.model.setSmokeTemperature(new Float32Array(9).fill(293.15));
assert.equal(hot.writes.at(-1)[1],(9+2)*64+Math.ceil(9/4)*64,'Thermal tail starts beyond all phase records');
assert.equal(hot.writes.at(-1)[2].length,9*4);
assert.throws(()=>hot.model.setSmokeTemperature([NaN]),/dimensions/);
assert.throws(()=>hot.model.setSmokeTemperature(new Float32Array(9).fill(NaN)),/finite/);
assert.throws(()=>hot.model.setSmokeTemperature(new Float32Array(9).fill(280)),/range/);
hot.model.setEnabled(true);hot.model.encode(hot.encoder);
assert.deepEqual(hot.trace.slice(hot.trace.indexOf('balanceAmounts')+1,hot.trace.indexOf('initializeGas')),['clearThermalMean','collectThermalMean']);
// Every packed Kelvin value addresses its own trailing word for odd cell counts too.
for(const count of [1,9,15,16,17,4500])for(let c=0;c<count;c++){
  const fake=Math.ceil(count/4)*4+Math.floor(c/4),slot=count+2+Math.floor(fake/4),word=(fake%4)*4+c%4;
  assert.equal(slot*16+word,(count+2+Math.ceil(count/4))*16+c);
}
// The existing stable gas-law oracle also solves nRT when supplied the mean
// Kelvin factor. Pressure work changes volume; it never changes stored moles.
const M=require('../js/liquid-air-model.js'),room=293.15,atmosphere=3796635.5,amount=12000;
for(const temperature of [room,room+5,room+40])for(const coupling of [0,.001,.1]){
  const pressure=M.isothermalPressure({volume:amount,amount:amount*temperature/room,coupling,flux:0,atmosphere,minimum:-80000});
  assert(Math.abs((atmosphere+pressure)*(amount+coupling*pressure)/(atmosphere*amount)-temperature/room)<1e-6);
  if(temperature===room)assert(pressure===0,'Ambient temperature returns room equilibrium');else assert(pressure>0,'Heat supplies positive gas pressure');
}

const chilled=fixture(current,{smokeTemperature:true,minimumTemperatureK:193.15});
chilled.model.setSmokeTemperature(new Float32Array(9).fill(280));
chilled.model.setSmokeTemperature(new Float32Array(9).fill(193.15));
assert.throws(()=>chilled.model.setSmokeTemperature(new Float32Array(9).fill(190)),/range/);
assert.throws(()=>fixture(current,{smokeTemperature:true,minimumTemperatureK:0}),/minimum/);
assert(hot.context.LiquidAirWGPU.thermalShaderSource().includes('293.15,1172.6'));
assert(chilled.context.LiquidAirWGPU.thermalShaderSource(193.15).includes('193.15,1172.6'));
assert(chilled.shaders[0].includes('193.15,1172.6'),'Cold range reaches the actual compiled shader');
for(const temperature of [193.15,280,room,320]){
  const pressure=M.isothermalPressure({volume:amount,amount:amount*temperature/room,coupling:.001,flux:0,atmosphere,minimum:-2000000});
  assert(Math.abs((atmosphere+pressure)*(amount+.001*pressure)/(atmosphere*amount)-temperature/room)<1e-6);
  assert(temperature<room?pressure<0:temperature>room?pressure>0:pressure===0);
}
console.log('PASS opt-in cold range, default thermal bounds, unchanged feature-off GPU commands and signed ideal-gas pressure');
