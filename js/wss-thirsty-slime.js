/* Native parcels pass between flowing and absorbed ownership. Jaw traction
 * drives discharge through material pores; confirmed loss shrinks the gel. */
(function(root){
  'use strict';
  var AREA=1.5625,RING_CAP=256,VENTS=8,LEDGER_BYTES=32+VENTS*16;
  var SOURCE=`
struct Params {counts:vec4f, bounds:vec4f, flow:vec4f, drive:vec4f};
struct Ledger {
 bound:atomic<u32>, taken:atomic<u32>, ejected:atomic<u32>, cursor:u32,
 credit:f32, sequence:u32, pad:vec2f, jets:array<vec4f,8>,
};
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> ring:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> pos:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> flag:array<u32>;
@group(0) @binding(4) var<storage,read_write> slots:array<vec4u>;
@group(0) @binding(5) var<storage,read_write> ledger:Ledger;
@group(0) @binding(6) var<storage,read_write> affine:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> aux:array<vec4f>;
@group(0) @binding(8) var<storage,read_write> releaseUntil:array<f32>;
@group(0) @binding(9) var<storage,read> pores:array<vec4f>;
@compute @workgroup_size(64) fn uptake(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;
 if(i>=u32(p.counts.x) || slots[i].x!=1u || (flag[i]&163u)!=0u ||
    p.drive.x>12. || p.flow.x<releaseUntil[i]){return;}
 let q=pos[i].xy;
 if(any(q<p.bounds.xy) || any(q>p.bounds.zw)){return;}
 var inside=false;var distance=1e20;let n=u32(p.counts.y);
 for(var k=0u;k<n;k++){
  let a=ring[k].xy;let b=ring[(k+1u)%n].xy;let edge=b-a;
  let t=clamp(dot(q-a,edge)/max(dot(edge,edge),1e-12),0.,1.);
  distance=min(distance,dot(q-a-t*edge,q-a-t*edge));
  if((a.y>q.y)!=(b.y>q.y)){
   if(q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x){inside=!inside;}
  }
 }
 if(!inside && distance>p.counts.w){return;}
 var old=atomicLoad(&ledger.bound);
 loop{
  if(old>=u32(p.counts.z)){return;}
  let ticket=atomicCompareExchangeWeak(&ledger.bound,old,old+1u);
  if(ticket.exchanged){break;}old=ticket.old_value;
 }
 atomicAdd(&ledger.taken,1u);
 pos[i]=vec4f(16.,16.,0.,0.);affine[i]=vec4f(0.);
 aux[i]=vec4f(4.,0.,16.,16.);flag[i]=160u;slots[i].x=2u;
}
@compute @workgroup_size(1) fn discharge(){
 if(p.flow.w<=0. || atomicLoad(&ledger.bound)==0u){ledger.credit=0.;return;}
 ledger.credit+=p.flow.w*p.flow.y;
 let wanted=min(u32(ledger.credit),atomicLoad(&ledger.bound));
 if(wanted==0u){return;}
 var sent=0u;var visited=0u;let count=u32(p.counts.x);
 loop{
  if(sent>=wanted || visited>=count){break;}
  let i=ledger.cursor;ledger.cursor=(i+1u)%count;visited++;
  if(slots[i].x!=2u){continue;}
  var k=ledger.sequence%8u;
  for(var seek=0u;seek<8u;seek++){if(pores[k*2u+1u].w>0.){break;}k=(k+1u)%8u;}
  if(pores[k*2u+1u].w==0.){break;}
  ledger.sequence=k+1u;
  let pore=pores[k*2u];let material=pores[k*2u+1u];
  let serial=ledger.jets[k].x;
  let sideways=(fract((serial+.5)*.61803398875)-.5)*material.z;
  let forward=fract((serial+.5)*.41421356237)*max(2.,p.flow.z*p.flow.y);
  let point=pore.xy+vec2f(-pore.w,pore.z)*sideways+pore.zw*forward;
  let relative=pore.zw*p.flow.z;let velocity=material.xy+relative;
  pos[i]=vec4f(point,velocity);affine[i]=vec4f(0.);
  aux[i]=vec4f(4.,0.,point);flag[i]=0u;
  slots[i].y++;slots[i].z=0u;slots[i].w=0u;slots[i].x=1u;
  // A departing parcel must complete its flight away from the skin before
  // it can be absorbed again. It remains ordinary live water throughout.
  releaseUntil[i]=p.flow.x+.65;
  atomicSub(&ledger.bound,1u);atomicAdd(&ledger.ejected,1u);
  let impulse=relative*p.drive.y*(1.5625/180.);
  ledger.jets[k]+=vec4f(1.,impulse,.5*(1.5625/180.)*dot(relative,relative)*p.drive.y*p.drive.y);
  sent++;
 }
 ledger.credit-=f32(sent);
}
`;
  async function create(options){
    var L=options.liquid,b=options.body,boundary=options.boundary;
    if(!b || !boundary || !boundary.ready)throw Error('The drinking slime needs its native water inventory.');
    var device=L.device,queue=L.queue,U=GPUBufferUsage,buffers=[],retired=false,pending=false,captured=false;
    var dryArea=b.restArea,capacity=Math.floor(dryArea*15/AREA),latest=0,grown=0,taken=0,ejected=0;
    var error=null,clock=0,lastUptakeClock=-Infinity,lastEjectionClock=-Infinity,pressure=0,speed=0,rate=0;
    var jetCounts=new Array(VENTS).fill(0),jetImpulses=new Float64Array(VENTS*2),pendingRecoil=new Float64Array(VENTS*2),jetEnergy=0;
    function buffer(label,size,usage){var v=device.createBuffer({label:'toy.uptake.'+label,size:size,usage:usage});buffers.push(v);return v;}
    try{
      var params=buffer('params',64,U.UNIFORM|U.COPY_DST);
      var ring=buffer('ring',RING_CAP*16,U.STORAGE|U.COPY_DST);
      var owned=buffer('water-ledger',LEDGER_BYTES,U.STORAGE|U.COPY_SRC);
      var read=buffer('read',LEDGER_BYTES,U.MAP_READ|U.COPY_DST);
      var cooldown=buffer('release-until',boundary.stats().count*4,U.STORAGE);
      var pores=buffer('pores',VENTS*32,U.STORAGE|U.COPY_DST);
      var module=device.createShaderModule({label:'toy.uptake.porous-skin',code:SOURCE});
      var info=await module.getCompilationInfo(),errors=info.messages.filter(function(m){return m.type==='error';});
      if(errors.length)throw Error(errors.map(function(m){return m.message;}).join('; '));
      var resources=[params,ring,L.buf.pos,L.buf.flag,boundary.slotsBuffer,owned,L.buf.affine,L.buf.aux,cooldown,pores],pipelines={},groups={};
      for(var name of ['uptake','discharge']){
        var indices=name==='uptake'?[0,1,2,3,4,5,6,7,8]:[0,2,3,4,5,6,7,8,9];
        pipelines[name]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:name}});
        groups[name]=device.createBindGroup({layout:pipelines[name].getBindGroupLayout(0),entries:indices.map(function(i){return {binding:i,resource:{buffer:resources[i]}};})});
      }
    }catch(e){buffers.forEach(function(v){v.destroy();});throw e;}
    function dispatch(encoder,name,count){var pass=encoder.beginComputePass({label:'toy.uptake.'+name});
      pass.setPipeline(pipelines[name]);pass.setBindGroup(0,groups[name]);pass.dispatchWorkgroups(count);pass.end();}
    var companion={error:null,
      beginFrame:function(encoder,state){
        if(retired)return;
        if(b.ringN<3 || b.ringN>RING_CAP)throw Error('The drinking skin exceeds its contact allocation.');
        var points=new Float32Array(b.ringN*4),left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
        for(var k=0;k<b.ringN;k++){
          var i=b.ring[k],x=b.px[i],y=b.py[i];
          if(!Number.isFinite(x+y))throw Error('The drinking skin is not finite.');
          points[k*4]=x;points[k*4+1]=y;
          left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
        }
        var waterTime=L.getSimParam('TIMESCALE'),vents=companion.press?companion.press.outlets():[],ports=new Float32Array(VENTS*8),width=3.2,open=0;
        pressure=companion.press?companion.press.pressure():0;
        // Orifice speed follows compressive traction and the same water mass
        // per area as the gel. Native gravity carries each emitted jet after exit.
        speed=Math.min(350,Math.sqrt(2*Math.max(0,pressure-12)*180)/waterTime);
        vents.forEach(function(v,k){if(v.open)open++;ports.set([v.exitX,v.exitY,v.nx,v.ny,v.vx/waterTime,v.vy/waterTime,width,v.open?1:0],k*8);});
        rate=.78*open*width*speed/AREA;
        queue.writeBuffer(ring,0,points);queue.writeBuffer(pores,0,ports);
        queue.writeBuffer(params,0,new Float32Array([state.count,b.ringN,capacity,36,left-6,top-6,right+6,bottom+6,
          state.clock,state.h,speed,rate,pressure,waterTime,open,width]));
        clock=state.clock;
      },
      beforeSubstep:function(encoder){dispatch(encoder,'discharge',1);},
      afterSubstep:function(encoder,state){dispatch(encoder,'uptake',Math.ceil(state.count/64));},
      captureFrame:function(encoder){if(!pending){pending=true;captured=true;encoder.copyBufferToBuffer(owned,0,read,0,LEDGER_BYTES);}},
      afterSubmit:function(){
        if(!captured)return;captured=false;
        read.mapAsync(GPUMapMode.READ).then(function(){
          if(!retired){
            var u=new Uint32Array(read.getMappedRange()),f=new Float32Array(u.buffer);
            if(u[1]>taken)lastUptakeClock=clock;if(u[2]>ejected)lastEjectionClock=clock;
            latest=u[0];taken=u[1];ejected=u[2];jetEnergy=0;
            for(var k=0;k<VENTS;k++){
              var at=8+k*4;jetCounts[k]=f[at];jetEnergy+=f[at+3];
              for(var axis=0;axis<2;axis++){var next=f[at+1+axis],j=k*2+axis;pendingRecoil[j]-=next-jetImpulses[j];jetImpulses[j]=next;}
            }
          }
          read.unmap();
        }).catch(function(e){if(!retired){error=e.message;companion.error=error;}}).finally(function(){pending=false;});
      },
      grow:function(){if(!retired && !error){
        options.grow(b,latest*AREA,dryArea);grown=latest;
        if(companion.press)for(var k=0;k<VENTS;k++){var x=pendingRecoil[k*2],y=pendingRecoil[k*2+1];
          if(x || y)companion.press.recoil(k,x,y);pendingRecoil[k*2]=pendingRecoil[k*2+1]=0;}
      }},
      stats:function(){return {absorbedParcels:latest,grownParcels:grown,absorbedArea:latest*AREA,capacityParcels:capacity,
        totalTaken:taken,ejectedParcels:ejected,jetCounts:jetCounts.slice(),jetImpulses:Array.from(jetImpulses),jetEnergy:jetEnergy,
        pressure:pressure,jetSpeed:speed,dischargeRate:rate,ejecting:clock-lastEjectionClock<.2,
        fraction:latest/capacity,full:latest>=capacity,drinking:latest>0 && clock-lastUptakeClock<.4,dryArea:dryArea,targetArea:dryArea+latest*AREA,
        restArea:b.restArea,clock:clock,error:error};},
      destroy:function(){retired=true;buffers.forEach(function(v){try{v.destroy();}catch(e){}});}
    };
    return companion;
  }
  root.WSSThirstySlime={create:create};
})(typeof window!=='undefined'?window:globalThis);
