/* Fire's small, current native-water sensor and sensible-heat ledger.
 * This is a toy-only compute pass. The water integrator and its mirror are unchanged. */
(function(root){
  'use strict';
  var WGSL=`
const CAPACITY=20.;
struct Params { hot:vec4f, world:vec4f, step:vec4f, air:vec4f };
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> pos:array<vec4f>;
@group(0) @binding(2) var<storage,read> flag:array<u32>;
@group(0) @binding(3) var<storage,read_write> water:array<f32>;
@group(0) @binding(4) var<storage,read_write> sums:array<atomic<u32>>;
@group(0) @binding(5) var<storage,read_write> state:array<f32>;
fn live(i:u32)->bool {return i<u32(p.step.y) && (flag[i]&128u)==0u && (flag[i]&3u)==0u;}
fn touching(i:u32)->bool {let d=max(max(p.hot.xy-pos[i].xy,pos[i].xy-p.hot.zw),vec2f(0.));return dot(d,d)<=9.;}
@compute @workgroup_size(64) fn contact(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i)){return;}
 if(touching(i)){atomicAdd(&sums[0],1u);atomicAdd(&sums[1],u32(water[i]*64.));atomicAdd(&sums[2],u32(max(0.,75.-water[i])*64.));}
}
@compute @workgroup_size(1) fn source(){
 let dt=p.step.x;let wet=f32(atomicLoad(&sums[0]));let was=state[1];
 let capacity=p.air.z;
 state[2]+=dt;state[8]=wet;state[13]=select(0.,1.,wet>0.);
 // Stored fuel heat is finite; chemistry supplies all new heat.
 let strength=p.air.y;
 let burning=wet==0. && state[0]>=350. && strength>0.001;
 state[20]=select(0.,strength,burning);state[19]=p.world.w;
 if(was>0.5 && !burning && wet>0.){state[3]=state[2];state[18]+=1.;}
 if(was<0.5 && burning){state[14]+=1.;}
 state[1]=select(0.,1.,burning);
 // This is the exact chemical-energy credit already produced by consumed O2.
 let input=p.air.x;
 state[0]+=input/capacity;state[4]+=input;
 let conductance=p.air.w;
 let loss=capacity*(state[0]-20.)*(1.-exp(-conductance*dt/capacity));
 state[0]-=loss/capacity;state[5]+=loss;
 state[9]=0.;state[10]=f32(atomicLoad(&sums[2]))/64.;
 if(wet>0.){
  let mean=20.+f32(atomicLoad(&sums[1]))/(64.*wet);let cw=2.*wet;let reduced=capacity*cw/(capacity+cw);
  let exchange=clamp(reduced*(state[0]-mean)*(1.-exp(-20.*wet*dt/reduced)),0.,min(capacity*max(0.,state[0]-20.),2.*state[10]));
  state[0]-=exchange/capacity;state[6]+=exchange;state[7]+=exchange;state[9]=exchange;
 }
 state[17]=p.step.z;
}
@compute @workgroup_size(64) fn deposit(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i)){return;}
 if(touching(i) && state[10]>0.){let room=floor(max(0.,75.-water[i])*64.)/64.;water[i]=min(75.,water[i]+state[9]*room/(2.*state[10]));}
 let cell=vec2i(floor(pos[i].xy/p.world.xy*vec2f(12.,6.)));
 if(all(cell>=vec2i(0)) && all(cell<vec2i(12,6))){let k=u32(cell.y*12+cell.x);atomicAdd(&sums[3u+k*3u],1u);atomicAdd(&sums[4u+k*3u],u32(water[i]*64.));atomicMin(&sums[5u+k*3u],u32(max(0.,pos[i].y)*64.));}
 let mask=vec2i(floor(pos[i].xy/p.world.xy*vec2f(128.,72.)));
 if(all(mask>=vec2i(0)) && all(mask<vec2i(128,72))){atomicAdd(&sums[219u+u32(mask.y*128+mask.x)],1u);}
}
`;
  async function create(options){
    var L=options.liquid,device=L.device,queue=L.queue,n=options.maxParticles,width=options.width,height=options.height,hot=options.source;
    if(!L.simActive)throw Error('Fire needs the native water solver.');
    if(!options.oxygen)throw Error('Fire needs spatial oxygen transport.');
    var oxygen=options.oxygen || null,capacity=oxygen && options.candle?.2:20;
    var sumCount=219+128*72,stateSize=24*4,bytes=stateSize+sumCount*4;
    function buffer(size,usage){return device.createBuffer({size:size,usage:usage});}
    var U=GPUBufferUsage,params=buffer(64,U.UNIFORM|U.COPY_DST),temps=buffer(n*4,U.STORAGE|U.COPY_SRC),
      sums=buffer(sumCount*4,U.STORAGE|U.COPY_DST|U.COPY_SRC),state=buffer(stateSize,U.STORAGE|U.COPY_DST|U.COPY_SRC),
      read=buffer(bytes,U.MAP_READ|U.COPY_DST),initial=new Float32Array(24),reset=new Uint32Array(sumCount);
    // Local reaction readings are diagnostic. Oxygen inventory lives in the spatial solver.
    initial[0]=900;initial[1]=1;initial[3]=-1;initial[16]=capacity*880;initial[19]=.209;initial[20]=1;queue.writeBuffer(state,0,initial);
    for(var k=0;k<72;k++)reset[5+k*3]=0xffffffff;
    var shader=options.excludeFrozen ? WGSL.replace('(flag[i]&128u)==0u','(flag[i]&160u)==0u') : WGSL;
    var module=device.createShaderModule({code:shader}),info=await module.getCompilationInfo();
    if(info.messages.some(function(m){return m.type==='error';}))throw Error(info.messages.map(function(m){return m.message;}).join('; '));
    var pipelines={},groups={};
    for(var name of ['contact','source','deposit']){
      pipelines[name]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:name}});
      var used=name==='source'?[0,4,5]:name==='contact'?[0,1,2,3,4]:[0,1,2,3,4,5];
      var resources=[params,L.buf.pos,L.buf.flag,temps,sums,state];
      groups[name]=device.createBindGroup({layout:pipelines[name].getBindGroupLayout(0),entries:used.map(function(binding){return {binding:binding,resource:{buffer:resources[binding]}};})});
    }
    var pending=false,retired=false,error=null,latest=initial,mask=new Uint8Array(128*72*4),field=new Float32Array(296),poured=0,receivedClock=0,maxDelay=0,events=[];
    field.set([0,0,width/12,height/6,1,20,0,0]);for(k=0;k<72;k++)field[8+k*4]=20;
    function tick(dt,water){
      if(retired || !(dt>0) || error)return;dt=Math.min(.1,dt*(oxygen?oxygen.constants.secondsPerSimulationSecond:1));
      var gas=oxygen?oxygen.stats():null,credit=oxygen?oxygen.takeHeat():0;
      var strength=gas&&Number.isFinite(gas.heatReleaseW)?Math.min(1,gas.heatReleaseW/gas.maxPowerW):1;
      var clock=water.clock,count=water.count,values=new Float32Array([hot.x,hot.y,hot.x+hot.width,hot.y+hot.height,width,height,oxygen?1:0,gas&&gas.localOxygenFraction||.209,dt,count,clock,options.noEmber?0:1,
        credit,strength,capacity,options.candle?.03:.2]);
      queue.writeBuffer(params,0,values);queue.writeBuffer(sums,0,reset);
      var enc=device.createCommandEncoder({label:'toy.fire.native-contact'});
      for(var key of ['contact','source','deposit']){var pass=enc.beginComputePass();pass.setPipeline(pipelines[key]);pass.setBindGroup(0,groups[key]);pass.dispatchWorkgroups(key==='source'?1:Math.max(1,Math.ceil(count/64)));pass.end();}
      if(!pending){enc.copyBufferToBuffer(state,0,read,0,stateSize);enc.copyBufferToBuffer(sums,0,read,stateSize,sumCount*4);}
      queue.submit([enc.finish()]);
      if(pending)return;pending=true;
      read.mapAsync(GPUMapMode.READ).then(function(){
        if(retired){read.unmap();return;}
        var bytesView=read.getMappedRange(),s=new Float32Array(bytesView,0,24).slice(),a=new Uint32Array(bytesView,stateSize,sumCount);
        if(s[18]>latest[18] && s[13]>.5)events.push({kind:'quench',energy:Math.max(0,s[7]-latest[7]),clock:s[17]});
        latest=s;receivedClock=s[17];maxDelay=Math.max(maxDelay,L.simulationClock-s[17]);
        var total=0,present=0;
        for(var j=0;j<72;j++){var countCell=a[3+j*3],temperature=20+(countCell?a[4+j*3]/64/countCell:0),at=8+j*4;field[at]=temperature;field[at+1]=countCell;field[at+2]=countCell?a[5+j*3]/64:height;total+=temperature*countCell;present+=countCell;}
        field[5]=present?total/present:20;
        // Current native occupancy, not the multi-second particle mirror.
        for(var y=0;y<72;y++)for(var x=0;x<128;x++){var at=((71-y)*128+x)*4,occupied=a[219+y*128+x]>0;mask[at+2]=occupied?255:0;mask[at+3]=occupied?255:0;}
        read.unmap();
      }).catch(function(e){error=e.message;}).finally(function(){pending=false;});
    }
    function stats(){
      var gas=oxygen?oxygen.stats():null;
      return Object.assign({burning:latest[1]>.5,sourceC:latest[0],ignitionC:350,elapsed:latest[2],quenchedAt:latest[3]<0?null:latest[3],
        wetParcels:latest[8],smothered:latest[13]>.5,relights:latest[14],quenchEvents:latest[18],poured:poured,waterMeanC:field[5],sourceCapacity:capacity,waterParcelCapacity:2,
        burnFraction:latest[20],burnStrength:latest[20],airStarved:!!gas && latest[0]>=350 && latest[13]<.5 && gas.fuelRemainingKg>0 && gas.heatReleaseW<gas.maxPowerW*.05,
        oxygenFraction:gas?gas.localOxygenFraction:null,oxygenLitres:gas?gas.oxygenInventoryKg/1.331*1000:null,
        oxygenConsumedLitres:gas?gas.oxygenConsumedKg/1.331*1000:null,oxygenSuppliedLitres:gas?gas.oxygenSuppliedKg/1.331*1000:null,
        oxygenResidualLitres:gas?gas.oxygenResidualKg/1.331*1000:null,extinguished:!!gas&&gas.extinguished,
        oxygenStarved:!!gas && latest[0]>=350 && latest[13]<.5 && gas.fuelRemainingKg>0 && gas.heatReleaseW<.5,
        heatInputJ:latest[4],ambientLossJ:latest[5],waterHeatJ:latest[6],sourceToWaterJ:latest[7],emberInputJ:latest[12],externalHeatJ:latest[21],
        initialHeatJ:latest[16],sourceHeatJ:capacity*(latest[0]-20),heatResidualJ:latest[16]+latest[4]+latest[12]-latest[5]-latest[6]-latest[21]-capacity*(latest[0]-20),
        contactClock:receivedClock,contactAgeSimulationSeconds:Math.max(0,L.simulationClock-receivedClock),maxContactAgeSimulationSeconds:maxDelay,pending:pending,error:error,
        approximation:oxygen?'A spatial finite-volume oxygen field shares the projected airflow. Local oxygen consumption supplies chemical heat at 13.1 MJ/kg. Fuel has finite stored sensible heat and a finite combustible inventory. Diffusion, source kinetics and the low-Mach exhaust mixture approximate a small burner; detailed chemistry and laboratory validation are not claimed.':'Native water contact and sensible fuel heat.'},gas || {},{error:error || (gas && gas.error) || null});
    }
    return {tick:tick,stats:stats,heatState:function(){return {buffer:state,capacity:capacity};},field:function(){return field;},wetField:function(){return {pixels:mask,width:128,height:72};},admit:function(n){poured+=n;},
      events:function(){return events.splice(0);},destroy:function(){retired=true;for(var b of [params,temps,sums,state,read])try{b.destroy();}catch(e){}}};
  }
  root.WSSFire={create:create};
})(typeof window!=='undefined'?window:globalThis);
