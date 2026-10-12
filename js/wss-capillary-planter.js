/* Native capillary-front traction and viscous porous drag. No assigned flow. */
(function(root){
'use strict';
function r(x,y,w,h){return{x:x,y:y,width:w,height:h};}
function make(w,o){
 o=o||{};var wet=o.wetting!==false,reservoir=r(136,248,240,136),pot=r(360,104,224,120),wick=r(360,152,24,216);
 return {name:'self-watering-planter',title:'Self-watering planter',draft:true,seed:o.seed||17,settings:{enabled:false},vessels:[{id:'reservoir',label:'Finite reservoir',rect:reservoir,sealed:false},{id:'pot',label:'Root storage',rect:pot,sealed:false}],pipes:[{points:[{x:360,y:360},{x:372,y:360},{x:372,y:160},{x:480,y:160}],bore:24}],solids:[r(352,376,40,8)],vents:[],parts:[],slimes:[],initial:[{kind:'rect',rect:r(144,296,216,80)}],marks:[],meters:[],viewBounds:r(96,48,528,344),boundaries:{pool:false,tap:null,drain:null,caps:[],boundStorage:true},measure:{source:reservoir,receiver:pot},primary:{kind:'capillary-toggle'},action:'Detach root uptake',capillary:{wick:wick,root:r(360,152,24,24),wetting:wet,control:r(432,116,112,24),uptake:true},setup:wet?'wet':'dry',setupNote:'The nonwetting wick changes only its contact angle. The reservoir, channel and roots are identical.',setups:[{id:'wet',label:'Wetting wick',options:{wetting:true}},{id:'dry',label:'Nonwetting wick control',options:{wetting:false}}],caption:'The wetting wick lifts actual reservoir water to the roots. Compare the nonwetting wick, which cannot climb.',readingLabel:'Root storage',boundaryNote:'Native water feels capillary pressure only at the measured wet front of a fixed porous wick. The pore-radius and contact-angle pressure 2 gamma cos(theta)/r supplies upward traction; Darcy drag dissipates motion. Root contact binds the same finite native parcels in storage. No liquid is created or moved from the reservoir to the roots.',energyBudgetStatus:'A reduced 2D porous-wick model with effective pore radius 0.05 mm, gamma 0.072 N/m and contact angle 30 degrees (wetting) or 110 degrees (control). Fixed-wall reaction impulse is recorded. Surface energy, drag loss and root binding work are not closed. This is not calibrated soil or plant physiology.'};
}
var SOURCE=`
struct P {wick:vec4f, root:vec4f, step:vec4f, model:vec4f};
@group(0) @binding(0) var<uniform> p:P;
@group(0) @binding(1) var<storage,read_write> pos:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> flag:array<u32>;
@group(0) @binding(3) var<storage,read_write> affine:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> aux:array<vec4f>;
@group(0) @binding(5) var<storage,read_write> slots:array<vec4u>;
@group(0) @binding(6) var<storage,read_write> sums:array<atomic<u32>>;
fn live(i:u32)->bool{return i<u32(p.step.x)&&slots[i].x==1u&&(flag[i]&163u)==0u;}
@compute @workgroup_size(64) fn front(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i)){return;}let q=pos[i].xy;
 if(all(q>=p.wick.xy)&&all(q<=p.wick.zw)){atomicMin(&sums[0],u32(max(0.,q.y)*256.));atomicAdd(&sums[1],1u);}
}
@compute @workgroup_size(64) fn force(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i)){return;}let q=pos[i].xy;let dt=p.step.y;
 if(all(q>=p.root.xy)&&all(q<=p.root.zw)&&p.model.w>.5){
  let before=atomicAdd(&sums[2],1u);if(before<320u){pos[i]=vec4f(q,0.,0.);flag[i]=160u;slots[i].x=2u;affine[i]=vec4f(0.);aux[i]=vec4f(4.,0.,q);}else{atomicSub(&sums[2],1u);}return;
 }
 if(!all(q>=p.wick.xy)||!all(q<=p.wick.zw)){return;}
 let top=f32(atomicLoad(&sums[0]))/256.;let depth=max(8.,p.wick.w-top);
 // Pressure traction acts at the free meniscus, over an 8-pixel front layer.
 let near=clamp(1.-(q.y-top)/8.,0.,1.);let acceleration=p.model.x*near;
 flag[i]=flag[i]&0xff00006fu;let old=pos[i].w;pos[i].w=(old-acceleration*dt)/(1.+p.model.y*dt);pos[i].z/=1.+p.model.y*dt;
 if(acceleration>0.){atomicAdd(&sums[3],u32(acceleration*dt*1024.));}
}
`;
async function create(c){
 var L=c.liquid,d=c.definition,m=d.capillary,B=c.nativeBoundary,dev=L.device,q=L.queue,U=GPUBufferUsage,retired=false,pending=false,captured=false,last=[400*256,0,0,0],clock=0,error=null,uptake=true;
 function buf(size,usage){return dev.createBuffer({size:size,usage:usage});}
 var params=buf(64,U.UNIFORM|U.COPY_DST),sums=buf(16,U.STORAGE|U.COPY_DST|U.COPY_SRC),read=buf(16,U.MAP_READ|U.COPY_DST),mod=dev.createShaderModule({code:SOURCE}),pipes={},groups={},resources=[params,L.buf.pos,L.buf.flag,L.buf.affine,L.buf.aux,B.slotsBuffer,sums];
 for(var name of ['front','force']){pipes[name]=await dev.createComputePipelineAsync({layout:'auto',compute:{module:mod,entryPoint:name}});var used=name==='front'?[0,1,2,5,6]:[0,1,2,3,4,5,6];groups[name]=dev.createBindGroup({layout:pipes[name].getBindGroupLayout(0),entries:used.map(function(i){return{binding:i,resource:{buffer:resources[i]}};})});}
 var a=2*.072*Math.cos((m.wetting?30:110)*Math.PI/180)/.00005;
 // Match capillary head under native gravity 250 px/s2 and 24 px/in.
 var nativePressure=a*250/9.81*(24/.0254)/1000;
 var companion={error:null,beginFrame:function(enc,s){clock=s.clock;},beforeSubstep:function(enc,s){
  var w=m.wick,z=m.root;q.writeBuffer(params,0,new Float32Array([w.x,w.y,w.x+w.width,w.y+w.height,z.x,z.y,z.x+z.width,z.y+z.height,s.count,s.h,clock,0,nativePressure/8,24,0,uptake?1:0]));q.writeBuffer(sums,0,new Uint32Array([400*256,0]));
  for(var name of ['front','force']){var p=enc.beginComputePass();p.setPipeline(pipes[name]);p.setBindGroup(0,groups[name]);p.dispatchWorkgroups(Math.ceil(s.count/64));p.end();}
 },afterSubstep:function(){},captureFrame:function(enc){if(!pending){pending=true;captured=true;enc.copyBufferToBuffer(sums,0,read,0,16);}},afterSubmit:function(){if(!captured)return;captured=false;read.mapAsync(GPUMapMode.READ).then(function(){if(!retired)last=Array.from(new Uint32Array(read.getMappedRange()));read.unmap();}).catch(function(e){error=e.message;companion.error=error;}).finally(function(){pending=false;});}};
 L.setToyMembrane(companion);
 return {primary:function(){uptake=!uptake;d.action=uptake?'Detach root uptake':'Attach root uptake';return true;},tick:function(){d.readingLabel='Roots '+last[2]+' parcels';},stats:function(){return {wetting:m.wetting,contactAngle:m.wetting?30:110,capillaryPressurePa:a,wetFrontY:last[0]/256,wetWickParcels:last[1],boundWaterParcels:last[2],capacityParcels:320,solidReactionImpulse:last[3]/1024,uptake:uptake,clock:clock,error:error};},draw:function(ctx){var st=getComputedStyle(document.documentElement);ctx.strokeStyle=st.getPropertyValue('--app-brass').trim();ctx.setLineDash([2,4]);ctx.strokeRect(m.wick.x+3,m.wick.y,m.wick.width-6,m.wick.height);ctx.setLineDash([]);ctx.strokeRect(m.root.x,m.root.y,m.root.width,m.root.height);ctx.save();ctx.globalAlpha=.25+Math.min(.6,last[2]/320);ctx.fillStyle=st.getPropertyValue('--accent').trim();ctx.fillRect(m.root.x,m.root.y,m.root.width*last[2]/320,m.root.height);ctx.restore();ctx.beginPath();ctx.moveTo(m.root.x+8,m.root.y);ctx.lineTo(472,148);ctx.moveTo(472,148);ctx.lineTo(472,72);ctx.moveTo(472,112);ctx.quadraticCurveTo(432,80,448,72);ctx.quadraticCurveTo(478,76,472,112);ctx.moveTo(472,96);ctx.quadraticCurveTo(508,56,520,72);ctx.quadraticCurveTo(504,96,472,96);ctx.stroke();ctx.strokeRect(m.control.x,m.control.y,m.control.width,m.control.height);ctx.fillStyle=st.getPropertyValue('--text-dim').trim();ctx.font='11px Commit Mono';ctx.fillText('Root contact',m.control.x+5,m.control.y+16);},destroy:function(){retired=true;L.setToyMembrane(null);[params,sums,read].forEach(function(v){v.destroy();});}};
}
var prev=root.WSSDraftRuntime;root.WSSDraftRuntime={create:function(c){return c.definition.capillary?create(c):prev&&prev.create?prev.create(c):null;}};root.WSSCapillaryPlanter={make:make};root.WSSMachines=root.WSSMachines||{};root.WSSMachines['self-watering-planter']={make:make};
})(typeof window!=='undefined'?window:globalThis);
