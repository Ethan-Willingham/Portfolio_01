/* Passive unresolved channel loss. It removes actual fluid work, never sets a flow. */
(function(root){'use strict';
var source=`struct P{left:vec4f,right:vec4f,state:vec4f,physics:vec4f};
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<storage,read_write> pos:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> affine:array<vec4f>;
@group(0) @binding(3) var<storage,read> flags:array<u32>;
@group(0) @binding(4) var<storage,read_write> sums:array<atomic<i32>>;
fn within(q:vec2f,r:vec4f)->bool{return all(q>=r.xy)&&all(q<r.zw);}
@compute @workgroup_size(64) fn loss(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(p.state.x)|| (flags[i]&160u)!=0u){return;}
 let old=pos[i];if(!within(old.xy,p.left)&&!within(old.xy,p.right)){return;}
 let re=abs(old.z)*p.physics.w;
 let onset=smoothstep(200.,600.,re)*(1.-smoothstep(10000.,15000.,re));
 let reverse=select((old.z<0.),(old.z>0.),(p.state.z>.5));
 let ratio=select(1.,1.+onset,reverse&&(p.state.w<.5));
 let k=(64./max(1.,re)*p.physics.z/p.physics.y+p.physics.x)*ratio;
 // Exact stable integration of du/dt = -K u |u| / (2L).
 let keep=1./(1.+k*abs(old.z)*p.state.y/(2.*p.physics.z));
 let u=old.z*keep;pos[i].z=u;let a=affine[i];affine[i]=vec4f(a.xy*keep,a.zw);
 let lost=max(0.,.5*(old.z*old.z-u*u));
 atomicAdd(&sums[0],i32(round(lost/256.)));
 atomicAdd(&sums[1],i32(round((old.z-u)*1024.)));
 atomicAdd(&sums[2],1);
 if(u*u>old.z*old.z+.0001){atomicAdd(&sums[3],1);}
}`;
async function create(c){var L=c.liquid,d=c.definition,dev=L.device,q=L.queue,U=GPUBufferUsage,pending=false,captured=false,retired=false,error=null,latest=new Int32Array(4);
var params=dev.createBuffer({size:64,usage:U.UNIFORM|U.COPY_DST}),sums=dev.createBuffer({size:16,usage:U.STORAGE|U.COPY_DST|U.COPY_SRC}),read=dev.createBuffer({size:16,usage:U.MAP_READ|U.COPY_DST});
var mod=dev.createShaderModule({code:source});var info=await mod.getCompilationInfo();if(info.messages.some(function(m){return m.type==='error';}))throw Error(info.messages.map(function(m){return m.lineNum+':'+m.linePos+' '+m.message;}).join('; '));var pipe=await dev.createComputePipelineAsync({layout:'auto',compute:{module:mod,entryPoint:'loss'}}),resources=[params,L.buf.pos,L.buf.affine,L.buf.flag,sums],group=dev.createBindGroup({layout:pipe.getBindGroupLayout(0),entries:resources.map(function(b,i){return{binding:i,resource:{buffer:b}};})});
// Native time is mapped by matching gravity 250 px/s2 to 9.81 m/s2.
var meters=.762/720,seconds=Math.sqrt(250*meters/9.81),diameter=24*meters,reScale=meters/seconds*diameter/1e-6;
var regions=d.tesla.regions||[224,312,320,336,400,312,496,336];
var companion={ready:true,error:null,beginFrame:function(enc,s){q.writeBuffer(params,0,new Float32Array(regions.concat([s.count,s.h,d.tesla.reverse?1:0,d.tesla.symmetric?1:0,4,24,96,reScale])));},beforeSubstep:function(){},afterSubstep:function(enc,s){var p=enc.beginComputePass();p.setPipeline(pipe);p.setBindGroup(0,group);p.dispatchWorkgroups(Math.ceil(s.count/64));p.end();},captureFrame:function(enc){if(!pending){pending=true;captured=true;enc.copyBufferToBuffer(sums,0,read,0,16);}},afterSubmit:function(){if(!captured)return;captured=false;read.mapAsync(GPUMapMode.READ).then(function(){if(!retired)latest=new Int32Array(read.getMappedRange().slice(0));read.unmap();}).catch(function(e){error=e.message;companion.error=error;}).finally(function(){pending=false;});}};
L.setToyMembrane(companion);return{stats:function(){return{lossPerUnitParcelMass:latest[0]*256,wallImpulsePerUnitParcelMass:latest[1]/1024,applications:latest[2],positiveWork:latest[3],reScale:reScale,symmetric:d.tesla.symmetric,error:error};},destroy:function(){retired=true;if(L.toyMembrane===companion)L.setToyMembrane(null);params.destroy();sums.destroy();read.destroy();}};}
root.WSSTeslaLoss={create:create};
})(typeof window!=='undefined'?window:globalThis);
