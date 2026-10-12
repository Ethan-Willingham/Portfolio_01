/* Contact uptake transfers native parcels into bound storage. Rest area grows
 * by their recorded area; the elastic solver moves the skin. This is a toy
 * absorption model, not a calibrated hydrogel or closed momentum model. */
(function(root){
  'use strict';
  var AREA=1.5625, RING_CAP=256;
  var SOURCE=`
struct Params {counts:vec4f, bounds:vec4f};
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> ring:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> pos:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> flag:array<u32>;
@group(0) @binding(4) var<storage,read_write> slots:array<vec4u>;
@group(0) @binding(5) var<storage,read_write> absorbed:atomic<u32>;
@group(0) @binding(6) var<storage,read_write> affine:array<vec4f>;
@group(0) @binding(7) var<storage,read_write> aux:array<vec4f>;
@compute @workgroup_size(64) fn uptake(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;
 if(i>=u32(p.counts.x) || slots[i].x!=1u || (flag[i]&163u)!=0u){return;}
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
 // Reserve exactly one ownership ticket, bounded even at simultaneous contact.
 var old=atomicLoad(&absorbed);
 loop{
  if(old>=u32(p.counts.z)){return;}
  let ticket=atomicCompareExchangeWeak(&absorbed,old,old+1u);
  if(ticket.exchanged){break;}old=ticket.old_value;
 }
 // State 2 is bound water, never a reusable inlet reserve. Keep the native
 // frozen/lifecycle guards and park it away from the collector and tap.
 pos[i]=vec4f(16.,16.,0.,0.);affine[i]=vec4f(0.);
 aux[i]=vec4f(4.,0.,16.,16.);flag[i]=160u;slots[i].x=2u;
}
`;
  async function create(options){
    var L=options.liquid,b=options.body,boundary=options.boundary;
    if(!b || !boundary || !boundary.ready)throw Error('The drinking slime needs its native water inventory.');
    var device=L.device,queue=L.queue,U=GPUBufferUsage,buffers=[],retired=false,pending=false,captured=false;
    var dryArea=b.restArea,capacity=Math.floor(dryArea*2/AREA),latest=0,grown=0,error=null,clock=0,lastUptakeClock=-Infinity;
    function buffer(label,size,usage){var v=device.createBuffer({label:'toy.uptake.'+label,size:size,usage:usage});buffers.push(v);return v;}
    try{
      var params=buffer('params',32,U.UNIFORM|U.COPY_DST);
      var ring=buffer('ring',RING_CAP*16,U.STORAGE|U.COPY_DST);
      var owned=buffer('bound-water',4,U.STORAGE|U.COPY_SRC);
      var read=buffer('read',4,U.MAP_READ|U.COPY_DST);
      var module=device.createShaderModule({label:'toy.uptake.contact',code:SOURCE});
      var info=await module.getCompilationInfo(),errors=info.messages.filter(function(m){return m.type==='error';});
      if(errors.length)throw Error(errors.map(function(m){return m.message;}).join('; '));
      var pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:'uptake'}});
      var resources=[params,ring,L.buf.pos,L.buf.flag,boundary.slotsBuffer,owned,L.buf.affine,L.buf.aux];
      var group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:resources.map(function(v,i){return {binding:i,resource:{buffer:v}};})});
    }catch(e){buffers.forEach(function(v){v.destroy();});throw e;}
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
        queue.writeBuffer(ring,0,points);
        queue.writeBuffer(params,0,new Float32Array([state.count,b.ringN,capacity,36,left-6,top-6,right+6,bottom+6]));
        clock=state.clock;
      },
      beforeSubstep:function(){},
      afterSubstep:function(encoder,state){
        var pass=encoder.beginComputePass({label:'toy.uptake.contact'});
        pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(Math.ceil(state.count/64));pass.end();
      },
      captureFrame:function(encoder){if(!pending){pending=true;captured=true;encoder.copyBufferToBuffer(owned,0,read,0,4);}},
      afterSubmit:function(){
        if(!captured)return;captured=false;
        read.mapAsync(GPUMapMode.READ).then(function(){
          if(!retired){var next=new Uint32Array(read.getMappedRange())[0];if(next>latest)lastUptakeClock=clock;latest=next;}read.unmap();
        }).catch(function(e){if(!retired){error=e.message;companion.error=error;}}).finally(function(){pending=false;});
      },
      grow:function(){if(!retired && !error){options.grow(b,latest*AREA,dryArea);grown=latest;}},
      stats:function(){return {absorbedParcels:latest,grownParcels:grown,absorbedArea:latest*AREA,capacityParcels:capacity,
        fraction:latest/capacity,full:latest>=capacity,drinking:latest>0 && clock-lastUptakeClock<.4,dryArea:dryArea,targetArea:dryArea+latest*AREA,
        restArea:b.restArea,clock:clock,error:error};},
      destroy:function(){retired=true;buffers.forEach(function(v){try{v.destroy();}catch(e){}});}
    };
    return companion;
  }
  root.WSSThirstySlime={create:create};
})(typeof window!=='undefined'?window:globalThis);
