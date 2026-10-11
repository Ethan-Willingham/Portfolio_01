/* Opt-in multi-species APIC transfer over the existing native MLS particles. */
(function(root){
'use strict';
// Reduced co-located form of Tampubolon et al. (2017), equations 16-20.
// Pressure is the shared compressive volume stress. Drag alone has a closed
// equal/opposite momentum and dissipative energy proof; contacts do not.
var SOURCE = /* wgsl */ `
struct Grid {count:u32,w:u32,h:u32,ox:u32,oy:u32,cells:u32,dt:f32,inv:f32,
 cols:f32,tile:f32,rows:f32,pad:f32,tc:u32,tr:u32,tw:u32,th:u32,region:vec4<f32>};
struct Config {density:vec4<f32>,drag:vec4<f32>,world:vec4<f32>,constants:vec4<f32>};
struct Physics {lanes:array<vec4<f32>,15>};
struct Species {volume:atomic<i32>,px:atomic<i32>,py:atomic<i32>};
struct Cell {species:array<Species,3>,fx:atomic<i32>,fy:atomic<i32>,padding:atomic<i32>};
@group(0) @binding(0) var<uniform> gp:Grid;
@group(0) @binding(1) var<uniform> cfg:Config;
@group(0) @binding(2) var<storage,read_write> pos:array<vec4<f32>>;
@group(0) @binding(3) var<storage,read_write> affine:array<vec4<f32>>;
@group(0) @binding(4) var<storage,read_write> aux:array<vec4<f32>>;
@group(0) @binding(5) var<storage,read> flags:array<u32>;
@group(0) @binding(6) var<storage,read_write> cells:array<Cell>;
@group(0) @binding(7) var<storage,read_write> velocities:array<vec4<f32>>;
@group(0) @binding(8) var<storage,read_write> volume:array<atomic<i32>>;
@group(0) @binding(9) var<storage,read_write> oilVolume:array<atomic<i32>>;
@group(0) @binding(10) var<uniform> sp:Physics;
@group(0) @binding(11) var<storage,read> terrainMask:array<u32>;
@group(0) @binding(12) var<storage,read_write> resolved:array<vec4<f32>>;
fn encodeFx(v:f32)->i32{return i32(round(v*cfg.constants.z));}
fn decodeFx(v:i32)->f32{return f32(v)/cfg.constants.z;}
fn phase(fl:u32)->u32{
 let material=(fl&3u)|((fl>>4u)&4u);
 return select(select(0u,1u,material==1u),2u,material==5u);
}
fn live(i:u32)->bool{
 let p=pos[i].xy;
 return (flags[i]&32u)==0u && all(p>=gp.region.xy) && all(p<=gp.region.zw);
}
struct Stencil {base:vec2<i32>,delta:vec2<f32>,wx:vec3<f32>,wy:vec3<f32>,valid:bool};
fn stencil(p:vec2<f32>)->Stencil{
 let q=p*gp.inv;let base=vec2<i32>(floor(q));let d=vec2<f32>(base)+vec2<f32>(0.5)-q;
 let local=base-vec2<i32>(bitcast<i32>(gp.ox),bitcast<i32>(gp.oy));
 return Stencil(local,d,vec3<f32>(0.5*(d.x+0.5)*(d.x+0.5),0.75-d.x*d.x,0.5*(d.x-0.5)*(d.x-0.5)),
  vec3<f32>(0.5*(d.y+0.5)*(d.y+0.5),0.75-d.y*d.y,0.5*(d.y-0.5)*(d.y-0.5)),
  all(local>=vec2<i32>(1))&&all(local<vec2<i32>(i32(gp.w)-1,i32(gp.h)-1)));
}
fn index(s:Stencil,x:i32,y:i32)->u32{return u32(s.base.y+y-1)*gp.w+u32(s.base.x+x-1);}
@compute @workgroup_size(256)
fn clearCells(@builtin(global_invocation_id) id:vec3<u32>){
 let c=id.x;if(c>=gp.cells){return;}
 for(var a=0u;a<3u;a++){
  atomicStore(&cells[c].species[a].volume,0);atomicStore(&cells[c].species[a].px,0);atomicStore(&cells[c].species[a].py,0);
  velocities[c*3u+a]=vec4<f32>(0.0);
 }
 atomicStore(&cells[c].fx,0);atomicStore(&cells[c].fy,0);
}
@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=gp.count||!live(i)){return;}
 let a=phase(flags[i]);let p=pos[i];let s=stencil(p.xy);if(!s.valid){return;}
 let C=affine[i];let v=p.zw*(gp.dt*gp.inv);
 for(var y=0;y<3;y++){for(var x=0;x<3;x++){
  let c=index(s,x,y);let w=s.wx[u32(x)]*s.wy[u32(y)];let d=s.delta+vec2<f32>(f32(x-1),f32(y-1));
  let apic=v+vec2<f32>(dot(C.xy,d),dot(C.zw,d));
  atomicAdd(&cells[c].species[a].volume,encodeFx(w));
  atomicAdd(&cells[c].species[a].px,encodeFx(w*cfg.density[a]*apic.x));
  atomicAdd(&cells[c].species[a].py,encodeFx(w*cfg.density[a]*apic.y));
  // Native P2G already contributed water and oil reference volumes. Grains
  // now contribute to that same occupied-volume pressure field as well.
  if(a==2u){atomicAdd(&volume[c],encodeFx(w));atomicAdd(&oilVolume[c+u32(cfg.world.w)],encodeFx(w));}
 }}
}
@compute @workgroup_size(256)
fn stress(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=gp.count||!live(i)){return;}
 let s=stencil(pos[i].xy);if(!s.valid){return;}
 var density=0.0;
 for(var y=0;y<3;y++){for(var x=0;x<3;x++){
  density+=s.wx[u32(x)]*s.wy[u32(y)]*decodeFx(atomicLoad(&volume[index(s,x,y)]));
 }}
 aux[i].x=density;aux[i].y=0.0;
 // The native water bulk law, applied once to total reference volume.
 // Every material has the same stress and the same gravitational field.
 let pressure=max(0.0,density/cfg.constants.x-1.0)*sp.lanes[0].z;
 let coefficient=select(0.0,4.0*pressure/max(density,1e-9),density>0.0);
 for(var y=0;y<3;y++){for(var x=0;x<3;x++){
  let c=index(s,x,y);let w=s.wx[u32(x)]*s.wy[u32(y)];let d=s.delta+vec2<f32>(f32(x-1),f32(y-1));
  atomicAdd(&cells[c].fx,encodeFx(w*coefficient*d.x));atomicAdd(&cells[c].fy,encodeFx(w*coefficient*d.y));
 }}
}
@compute @workgroup_size(256)
fn solve(@builtin(global_invocation_id) id:vec3<u32>){
 let c=id.x;if(c>=gp.cells){return;}
 var m:array<f32,3>;var v:array<vec2<f32>,3>;var totalVolume=0.0;
 for(var a=0u;a<3u;a++){totalVolume+=decodeFx(atomicLoad(&cells[c].species[a].volume));}
 var impulse=vec2<f32>(decodeFx(atomicLoad(&cells[c].fx)),decodeFx(atomicLoad(&cells[c].fy)));
 // Retain the native shock limiter as a disclosed numerical stabilizer.
 let cap=sp.lanes[8].z*gp.dt*gp.inv*totalVolume;
 if(cap>0.0&&length(impulse)>cap){impulse*=cap/length(impulse);}
 for(var a=0u;a<3u;a++){
  let q=decodeFx(atomicLoad(&cells[c].species[a].volume));m[a]=q*cfg.density[a];v[a]=vec2<f32>(0.0);
  if(m[a]>0.0){
   let momentum=vec2<f32>(decodeFx(atomicLoad(&cells[c].species[a].px)),decodeFx(atomicLoad(&cells[c].species[a].py)));
   // Partial pressure traction is phi_a times total pressure impulse.
   // Division by actual phase mass gives buoyancy without a class force.
   v[a]=momentum/m[a]+impulse/(max(totalVolume,1e-9)*cfg.density[a]);
   v[a].y+=sp.lanes[0].x*gp.dt*gp.dt*gp.inv;
  }
 }
 // Backward-Euler pair solves. Each impulse is equal and opposite, with
 // nonnegative drag and strictly nonincreasing pair kinetic energy.
 var pair=0u;
 for(var a=0u;a<3u;a++){for(var b=a+1u;b<3u;b++){
  let sum=m[a]+m[b];
  if(m[a]>0.0&&m[b]>0.0){
   let mean=(m[a]*v[a]+m[b]*v[b])/sum;
   let relative=(v[a]-v[b])/(1.0+gp.dt*cfg.drag[pair]);
   v[a]=mean+relative*(m[b]/sum);v[b]=mean-relative*(m[a]/sum);
  }
  pair++;
 }}
 for(var a=0u;a<3u;a++){resolved[c*3u+a]=vec4<f32>(v[a],m[a],0.0);}
}
// Snapshot the resolved phase field before any thread filters it. The native
// cardinal operators keep their live coefficients, but never mix phases.
fn phaseNeighbor(c:u32,a:u32)->vec3<f32>{
 let state=resolved[c*3u+a];
 if(state.z<=0.0){return vec3<f32>(0.0);}
 return vec3<f32>(state.xy,1.0);
}
fn phaseEddyPair(myM:f32,myV:vec2<f32>,c:u32,a:u32,pxPerStep:f32)->vec2<f32>{
 let other=resolved[c*3u+a];if(other.z<=0.0){return vec2<f32>(0.0);}
 let dv=other.xy-myV;let mu=(myM*other.z)/(myM+other.z);
 let gate=smoothstep(sp.lanes[13].y*0.08,sp.lanes[13].y,length(dv)*pxPerStep);
 return dv*(mu*gate);
}
@compute @workgroup_size(256)
fn stabilizeGrid(@builtin(global_invocation_id) id:vec3<u32>){
 let c=id.x;if(c>=gp.cells){return;}
 let col=c%gp.w;let visc=sp.lanes[6].z;let quietVisc=sp.lanes[12].x;let turbVisc=sp.lanes[13].x;
 for(var a=0u;a<3u;a++){
  let node=c*3u+a;let state=resolved[node];var v=state.xy;
  // Preserve the current grain transfer/contact path. Only liquid phases
  // inherit native water/oil spatial smoothing and its oil exclusions.
  if(a<2u&&state.z>0.0&&(visc>0.0||quietVisc>0.0||turbVisc>0.0)){
   let oilK=select(0.0,1.0,a==1u);var nSum=vec3<f32>(0.0);
   if(col>0u){nSum+=phaseNeighbor(c-1u,a);}
   if(col+1u<gp.w){nSum+=phaseNeighbor(c+1u,a);}
   if(c>=gp.w){nSum+=phaseNeighbor(c-gp.w,a);}
   if(c+gp.w<gp.cells){nSum+=phaseNeighbor(c+gp.w,a);}
   if(nSum.z>0.0){
    let avg=nSum.xy/nSum.z;var viscEff=clamp(visc,0.0,0.95);
    let pxPerStep=1.0/max(gp.dt*gp.inv,0.000001);let shearPx=length(avg-v)*pxPerStep;
    if(quietVisc>0.0&&nSum.z>=2.0){
     let speedQuiet=1.0-smoothstep(sp.lanes[12].y*0.4,sp.lanes[12].y,length(v)*pxPerStep);
     let shearQuiet=1.0-smoothstep(sp.lanes[12].z*0.3,sp.lanes[12].z,shearPx);
     let quietK=clamp(quietVisc*speedQuiet*shearQuiet*(1.0-oilK),0.0,0.95);
     viscEff=1.0-(1.0-viscEff)*(1.0-quietK);
    }
    v+=(avg-v)*viscEff;
    if(turbVisc>0.0){
     var ex=vec2<f32>(0.0);
     if(col>0u){ex+=phaseEddyPair(state.z,state.xy,c-1u,a,pxPerStep);}
     if(col+1u<gp.w){ex+=phaseEddyPair(state.z,state.xy,c+1u,a,pxPerStep);}
     if(c>=gp.w){ex+=phaseEddyPair(state.z,state.xy,c-gp.w,a,pxPerStep);}
     if(c+gp.w<gp.cells){ex+=phaseEddyPair(state.z,state.xy,c+gp.w,a,pxPerStep);}
     var exK=turbVisc*(1.0-oilK)/state.z;let exLen2=dot(ex,ex)*exK*exK;
     let agree2=(shearPx/max(pxPerStep,0.000001))*(shearPx/max(pxPerStep,0.000001));
     if(exLen2>agree2*0.81&&exLen2>0.0){exK*=sqrt(agree2*0.81/exLen2);}
     v+=ex*exK;
    }
   }
  }
  velocities[node]=vec4<f32>(v,state.zw);
 }
}
// The native static gridBoundary core, independently on each phase's
// resolved velocity. The mask and coefficients are the engine's live ones.
fn terrainSolidAt(px:f32,py:f32)->bool{
 let tc=i32(floor(px/gp.tile))-bitcast<i32>(gp.tc);
 let tr=i32(floor(py/gp.tile))-bitcast<i32>(gp.tr);
 if(tc<0||tr<0||tc>=i32(gp.tw)||tr>=i32(gp.th)){return false;}
 let idx=u32(tr)*gp.tw+u32(tc);
 return ((terrainMask[idx>>5u]>>(idx&31u))&1u)!=0u;
}
fn gridSolid(gx:i32,gy:i32)->bool{
 return terrainSolidAt((f32(gx)+0.5)*cfg.constants.y,(f32(gy)+0.5)*cfg.constants.y);
}
fn boundaryVelocity(input:vec2<f32>,b:vec4<f32>,inside:bool,left:bool,right:bool,up:bool,down:bool,lip:bool)->vec2<f32>{
 var vx=input.x;var vy=input.y;
 if(inside){vx*=-b.x;vy*=-b.x;}
 else{
  if(left&&vx<0.0){vx*=-b.y;}
  if(right&&vx>0.0){vx*=-b.y;}
  if(up&&vy<0.0){vy*=-b.y;}
  if(down&&vy>0.0){vy*=-b.y;}
  if(down){var friction=b.z;if(lip){friction=max(friction,sp.lanes[8].w);}vx*=friction;}
  if(left||right){vy*=b.w;}
 }
 return vec2<f32>(vx,vy);
}
@compute @workgroup_size(256)
fn gridBoundary(@builtin(global_invocation_id) id:vec3<u32>){
 let c=id.x;if(c>=gp.cells){return;}
 let gx=i32(c%gp.w)+bitcast<i32>(gp.ox);let gy=i32(c/gp.w)+bitcast<i32>(gp.oy);
 let inside=gridSolid(gx,gy);let left=gridSolid(gx-1,gy);let right=gridSolid(gx+1,gy);
 let up=gridSolid(gx,gy-1);let down=gridSolid(gx,gy+1);
 let lip=(!left&&!gridSolid(gx-1,gy+1))||(!right&&!gridSolid(gx+1,gy+1));
 for(var a=0u;a<3u;a++){
  let node=c*3u+a;let state=velocities[node];if(state.z<=0.0){continue;}
  // Native non-oil cells use water boundary coefficients, including grains.
  var b=sp.lanes[2];if(a==1u){b=sp.lanes[3];}
  velocities[node]=vec4<f32>(boundaryVelocity(state.xy,b,inside,left,right,up,down,lip),state.zw);
 }
}
@compute @workgroup_size(256)
fn gather(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=gp.count||!live(i)){return;}
 let p=pos[i];let s=stencil(p.xy);if(!s.valid){return;}
 let a=phase(flags[i]);var v=vec2<f32>(0.0);var C=vec4<f32>(0.0);
 for(var y=0;y<3;y++){for(var x=0;x<3;x++){
  let w=s.wx[u32(x)]*s.wy[u32(y)];let d=s.delta+vec2<f32>(f32(x-1),f32(y-1));
  let node=velocities[index(s,x,y)*3u+a].xy;
  v+=w*node;C+=4.0*w*vec4<f32>(node.x*d.x,node.x*d.y,node.y*d.x,node.y*d.y);
 }}
 // Restore the native water transport invariant before position changes:
 // an extreme displacement scales its APIC tensor by the SAME factor.
 if(a==0u){
  v*=sp.lanes[4].x;C*=sp.lanes[4].x;
  if(sp.lanes[7].x>0.0){
   let maxDisp=sp.lanes[7].x*gp.dt*gp.inv;let move2=dot(v,v);
   if(move2>maxDisp*maxDisp){let moveSc=maxDisp/sqrt(move2);v*=moveSc;C*=moveSc;}
  }
 }
 let destination=clamp(p.xy+v/gp.inv,vec2<f32>(0.001),cfg.world.xy-vec2<f32>(0.001));
 let delta=(destination-p.xy)*gp.inv;
 var damp=1.0;if(a==0u){damp=sp.lanes[4].y;}else if(a==1u){damp=sp.lanes[4].z;}
 var carried=delta/(gp.dt*gp.inv);
 if(a<2u){carried=delta*cfg.constants.y*(1.0/gp.dt)*damp;}
 if(a==0u){
  let vBrk=dot(carried,carried);let burstDamp=sp.lanes[7].y;
  if(burstDamp<1.0){
   let gLo=sp.lanes[7].z*sp.lanes[7].z;
   if(vBrk>gLo){let gHi=sp.lanes[7].w*sp.lanes[7].w;var bT=(vBrk-gLo)/(gHi-gLo);if(bT>1.0){bT=1.0;}carried*=1.0+(burstDamp-1.0)*bT;}
  }
  let maxVel=sp.lanes[7].x;let spd2=dot(carried,carried);
  if(maxVel>0.0&&spd2>maxVel*maxVel){carried*=maxVel/sqrt(spd2);}
  let densityRatio=aux[i].x/cfg.constants.x;let airDrag=sp.lanes[8].y;
  if(airDrag<1.0&&densityRatio<0.55){var adT=(0.55-densityRatio)*5.0;if(adT>1.0){adT=1.0;}carried*=1.0+(airDrag-1.0)*adT;}
 }
 aux[i].zw=p.xy;affine[i]=C;
 pos[i]=vec4<f32>(destination,carried);
}
@compute @workgroup_size(256)
fn jolt(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=gp.count||!live(i)){return;}
 pos[i].z+=cfg.world.z;
}
`;
function dragPair(ma,mb,va,vb,h,rate){
 if(!(ma>0&&mb>0))return [va.slice(),vb.slice()];
 var sum=ma+mb,mean=va.map(function(v,i){return (ma*v+mb*vb[i])/sum;}),rel=va.map(function(v,i){return (v-vb[i])/(1+h*rate);});
 return [mean.map(function(v,i){return v+mb/sum*rel[i];}),mean.map(function(v,i){return v-ma/sum*rel[i];})];
}
function create(instance,options){
 var opts=options||{},device=instance.device,queue=instance.queue;
 var width=+opts.width,height=+opts.height,density=opts.density||[1,0.7733,2.65],drag=opts.drag||[4,4,4];
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!density.every(function(d){return d>0&&Number.isFinite(d);})||density.length!==3||drag.length!==3||!drag.every(function(d){return d>=0&&Number.isFinite(d);}))throw Error('Invalid material-slip physical parameters.');
 if(!opts.cellSize||!opts.restDensity||!opts.fixedScale)throw Error('The native grid constants are required.');
 // Complete native world plus its padded 16-cell blocks, not a particle cap.
 // Native bounds include both endpoints before their 16-cell margin and block rounding.
 var capacity=Math.min(2097152,Math.ceil((Math.ceil(width/opts.cellSize)+33)/16)*16*Math.ceil((Math.ceil(height/opts.cellSize)+33)/16)*16);
 var buffers=[],destroyed=false;
 function buffer(name,size,usage){var b=device.createBuffer({label:'liquid.slip.'+name,size:size,usage:usage});buffers.push(b);return b;}
 var config=buffer('config',64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),packed=buffer('momentum',capacity*48,GPUBufferUsage.STORAGE),velocity=buffer('velocity',capacity*48,GPUBufferUsage.STORAGE),snapshot=buffer('resolved',capacity*48,GPUBufferUsage.STORAGE);
 var contactAffine=buffer('contactAffine',instance.maxParticles*16,GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);
 queue.writeBuffer(config,0,new Float32Array([density[0],density[1],density[2],0,drag[0],drag[1],drag[2],0,width,height,0,opts.gridMaxCells,opts.restDensity,opts.cellSize,opts.fixedScale,capacity]));
 var module=device.createShaderModule({label:'liquid.materialSlip',code:SOURCE}),resources=[instance.paramsBuf,config,instance.buf.pos,instance.buf.affine,instance.buf.aux,instance.buf.flag,packed,velocity,instance.buf.cellMass,instance.buf.cellOilMass,instance.simParamsBuf,instance.buf.terrainMask,snapshot];
 var bindings={clearCells:[0,1,6,7],scatter:[0,1,2,3,5,6,8,9],stress:[0,1,2,4,5,6,8,10],solve:[0,1,6,10,12],stabilizeGrid:[0,7,10,12],gridBoundary:[0,1,7,10,11],gather:[0,1,2,3,4,5,7,10],jolt:[0,1,2,5]},pipes={},groups={};
 Object.keys(bindings).forEach(function(name){
  var entries=bindings[name].map(function(binding){return {binding:binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===0||binding===1||binding===10?'uniform':binding===5||binding===11?'read-only-storage':'storage'}};});
  var layout=device.createBindGroupLayout({label:'liquid.slip.'+name,entries:entries});
  pipes[name]=device.createComputePipeline({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module:module,entryPoint:name}});
  groups[name]=device.createBindGroup({layout:layout,entries:bindings[name].map(function(binding){return {binding:binding,resource:{buffer:resources[binding]}};})});
 });
 var model={ready:false,error:null,capacity:capacity,
  readyPromise:module.getCompilationInfo().then(function(info){var errors=info.messages.filter(function(m){return m.type==='error';});if(errors.length)throw Error(errors.map(function(m){return m.lineNum+': '+m.message;}).join('\n'));if(destroyed)throw Error('Material slip was retired during compilation.');model.ready=true;return model;}).catch(function(error){model.error=error.message;throw error;}),
  encode:function(encoder){
   if(!model.ready||destroyed)throw Error('Material slip is not ready.');
   if(instance.grid.cells>capacity)throw Error('Material-slip grid exceeds its declared world allocation.');
   var pass=encoder.beginComputePass({label:'liquid.materialSlip.step'});
   ['clearCells','scatter','stress','solve','stabilizeGrid','gridBoundary','gather'].forEach(function(name){pass.setPipeline(pipes[name]);pass.setBindGroup(0,groups[name]);pass.dispatchWorkgroups(Math.ceil((name==='clearCells'||name==='solve'||name==='stabilizeGrid'||name==='gridBoundary'?instance.grid.cells:instance.uploadedCount)/256));});pass.end();
  },
  jolt:function(speed){
   if(!model.ready||destroyed||!Number.isFinite(speed)||Math.abs(speed)>100)throw Error('Invalid declared jar impulse.');
   queue.writeBuffer(config,40,new Float32Array([speed]));var encoder=device.createCommandEncoder({label:'liquid.slip.handImpulse'}),pass=encoder.beginComputePass();
   pass.setPipeline(pipes.jolt);pass.setBindGroup(0,groups.jolt);pass.dispatchWorkgroups(Math.ceil(instance.uploadedCount/256));pass.end();queue.submit([encoder.finish()]);
   return {horizontalVelocityImpulse:speed,allMaterials:true};
  },
  // Stock snow contacts reuse two affine lanes for neighbor certificates.
  // Save the actual APIC tensor around those passes, without changing their
  // native position/velocity constraints or their validated spatial search.
  beforeGrains:function(encoder){encoder.copyBufferToBuffer(instance.buf.affine,0,contactAffine,0,instance.uploadedCount*16);},
  afterGrains:function(encoder){encoder.copyBufferToBuffer(contactAffine,0,instance.buf.affine,0,instance.uploadedCount*16);},
  stats:function(){return {enabled:!destroyed,ready:model.ready,error:model.error,densities:density.slice(),dragRates:drag.slice(),commonGravity:instance.simParamsHost[0],referenceArea:opts.cellSize*opts.cellSize/opts.restDensity,gridCapacity:capacity,method:'Separate APIC phase momentum, shared compressive volume stress, implicit equal/opposite drag. No calibrated oil viscosity, surface tension or Drucker-Prager sand law.'};},
  destroy:function(){if(destroyed)return;destroyed=true;model.ready=false;if(instance.materialSlip===model)delete instance.materialSlip;instance.needsDenseClear=true;buffers.forEach(function(b){b.destroy();});}
 };
 return model;
}
root.LiquidMaterialSlipWGPU={create:create,source:SOURCE,dragPair:dragPair};
})(typeof window!=='undefined'?window:globalThis);
