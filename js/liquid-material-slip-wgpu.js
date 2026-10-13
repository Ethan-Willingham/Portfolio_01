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
// The drawn downhill bed and these collision polygons have identical vertices.
// Grid traction and swept particle contacts use outward polygon normals,
// including the sloped floor. There is no tile staircase underneath the bed.
var BED_GEOMETRY=/* wgsl */ `
fn bedY(x:f32)->f32{return cfg.bed.y+(x-cfg.bed.x)*(cfg.bed.w-cfg.bed.y)/(cfg.bed.z-cfg.bed.x);}
fn bedVertex(k:u32,e:u32)->vec2<f32>{
 var x0=cfg.bed.x;var x1=cfg.bed.z;var rise=0.0;var depth=cfg.bedOther.x;
 if(k>0u){x0=cfg.riffles.x+f32(k-1u)*cfg.riffles.y;x1=x0+cfg.riffles.z;rise=cfg.riffles.w;depth=0.0;}
 if(e==0u){return vec2<f32>(x0,bedY(x0)-rise);}
 if(e==1u){return vec2<f32>(x1,bedY(x1)-rise);}
 if(e==2u){return vec2<f32>(x1,bedY(x1)+depth);}
 return vec2<f32>(x0,bedY(x0)+depth);
}
struct BedDistance {distance:f32,normal:vec2<f32>};
fn bedDistance(k:u32,p:vec2<f32>)->BedDistance{
 var inside=true;var best=1e20;var normal=vec2<f32>(0.0,-1.0);var faceNormal=normal;
 for(var e=0u;e<4u;e++){
  let a=bedVertex(k,e);let b=bedVertex(k,(e+1u)%4u);let edge=b-a;let outward=normalize(vec2<f32>(edge.y,-edge.x));
  if(dot(p-a,outward)>0.0){inside=false;}
  let q=a+edge*clamp(dot(p-a,edge)/dot(edge,edge),0.0,1.0);let delta=p-q;let distance=length(delta);
  if(distance<best){best=distance;faceNormal=outward;normal=select(outward,delta/max(distance,1e-10),distance>1e-8);}
 }
 if(inside){return BedDistance(-best,faceNormal);}return BedDistance(best,normal);
}
fn bedSolid(p:vec2<f32>)->bool{
 for(var k=0u;k<=u32(cfg.bedOther.y);k++){if(bedDistance(k,p).distance<=0.0){return true;}}return false;
}
fn bedGridVelocity(input:vec2<f32>,p:vec2<f32>)->vec2<f32>{
 var v=input;
 for(var k=0u;k<=u32(cfg.bedOther.y);k++){
  let d=bedDistance(k,p);if(d.distance<0.0){return vec2<f32>(0.0);}
  if(d.distance<cfg.constants.y){v-=d.normal*min(0.0,dot(v,d.normal));}
 }return v;
}
`;
var BED_COLLIDE=/* wgsl */ `
fn resolveBed(i:u32,grainOnly:bool){
 if(i>=gp.count||!live(i)){return;}let a=phase(flags[i]);if(grainOnly&&a<2u){return;}
 let radius=select(0.42,2.5/sqrt(3.2)*0.5,a>=2u);let start=aux[i].zw;let state=pos[i];
 let delta=state.xy-start;let steps=max(1u,u32(ceil(length(delta)/(radius*0.5))));
 var p=start;var v=state.zw;
 for(var step=0u;step<steps;step++){
  // Continue the unblocked tangential displacement after a collision.
  var motion=delta/f32(steps);
  for(var k=0u;k<=u32(cfg.bedOther.y);k++){
   let d=bedDistance(k,p+motion);
   if(d.distance<radius){
    motion+=d.normal*(radius-d.distance);
    let inward=min(0.0,dot(v,d.normal));v-=d.normal*inward;
    if(a>=2u){let tangent=v-d.normal*dot(v,d.normal);let speed=length(tangent);
     if(speed>1e-8){v-=tangent/speed*min(speed,-inward*0.35);}}
   }
  }p+=motion;
 }
 pos[i]=vec4<f32>(p,v);aux[i].zw=p;
}
@compute @workgroup_size(256)
fn bedCollide(@builtin(global_invocation_id) id:vec3<u32>){resolveBed(id.x,false);}
@compute @workgroup_size(256)
fn bedGrains(@builtin(global_invocation_id) id:vec3<u32>){resolveBed(id.x,true);}
`;
// A fourth momentum field is opt-in. The existing three-phase shader remains
// byte-identical for jars and the other material scenes. Both grain classes use
// native grain geometry; the preserved origin bits carry their mass identity.
function sluiceSource(blackSand){
 var code=SOURCE
  .replace('constants:vec4<f32>','constants:vec4<f32>,extraDrag:vec4<f32>,bed:vec4<f32>,riffles:vec4<f32>,bedOther:vec4<f32>')
  .replace('array<Species,3>','array<Species,4>')
  .replaceAll('a<3u','a<4u').replaceAll('b<3u','b<4u')
  .replaceAll('*3u+a','*4u+a').replaceAll('array<f32,3>','array<f32,4>')
  .replaceAll('array<vec2<f32>,3>','array<vec2<f32>,4>')
  .replace('if(a==2u)','if(a>=2u)')
  .replace('return select(select(0u,1u,material==1u),2u,material==5u);',
   'if(material==5u){return select(2u,3u,((fl>>2u)&3u)==3u);}return select(0u,1u,material==1u);')
  .replace('gp.dt*cfg.drag[pair]','gp.dt*pairDrag(pair)*(m[a]/cfg.density[a])*(m[b]/cfg.density[b])*(1.0/m[a]+1.0/m[b])');

 code=code.replace('velocities[node]=vec4<f32>(boundaryVelocity(state.xy,b,inside,left,right,up,down,lip),state.zw);', 'velocities[node]=vec4<f32>(bedGridVelocity(boundaryVelocity(state.xy,b,inside,left,right,up,down,lip),vec2<f32>((f32(gx)+0.5)*cfg.constants.y,(f32(gy)+0.5)*cfg.constants.y)),state.zw);');
 var collide=BED_COLLIDE;
 if(blackSand){
  // This scene has no oil. Its fourth field carries actual magnetite grains,
  // with grain transport and boundary rules, not the native oil filters.
  code=code.replace('return select(2u,3u,((fl>>2u)&3u)==3u);','let origin=(fl>>2u)&3u;if(origin==2u){return 1u;}return select(2u,3u,origin==3u);')
   .replace('if(a>=2u)','if(a>=1u)')
   .replace('if(a==1u){b=sp.lanes[3];}','')
   .replace('else if(a==1u){damp=sp.lanes[4].z;}','')
   .replaceAll('a<2u','a==0u');
  collide=collide.replace('grainOnly&&a<2u','grainOnly&&a==0u').replaceAll('a>=2u','a>=1u');
 }
 return BED_GEOMETRY+code.replace('fn encodeFx', 'fn pairDrag(pair:u32)->f32{if(pair<3u){return cfg.drag[pair];}return cfg.extraDrag[pair-3u];}\nfn encodeFx')+collide;
}
// All contacting pairs are visited, without neighbor sampling. Snapshot
// Jacobi updates use the same pair degree and opposite impulse on both ends.
// Terrain sweeps follow each iteration in the native host.
var CONTACT_SOURCE=/* wgsl */ `
struct Grid {count:u32,w:u32,h:u32,ox:u32,oy:u32,cells:u32,dt:f32,inv:f32,
 cols:f32,tile:f32,rows:f32,pad:f32,tc:u32,tr:u32,tw:u32,th:u32,region:vec4<f32>};
struct Config {density:vec4<f32>,drag:vec4<f32>,world:vec4<f32>,constants:vec4<f32>,extraDrag:vec4<f32>};
@group(0) @binding(0) var<uniform> gp:Grid;
@group(0) @binding(1) var<uniform> cfg:Config;
@group(0) @binding(2) var<storage,read_write> pos:array<vec4<f32>>;
@group(0) @binding(3) var<storage,read> before:array<vec4<f32>>;
@group(0) @binding(4) var<storage,read> flags:array<u32>;
@group(0) @binding(5) var<storage,read_write> degree:array<u32>;
@group(0) @binding(6) var<storage,read> counts:array<u32>;
@group(0) @binding(7) var<storage,read> starts:array<u32>;
@group(0) @binding(8) var<storage,read> sorted:array<u32>;
@group(0) @binding(9) var<storage,read_write> aux:array<vec4<f32>>;
fn grain(i:u32)->bool{return ((flags[i]&3u)|((flags[i]>>4u)&4u))==5u&&(flags[i]&32u)==0u;}
fn mass(i:u32)->f32{return cfg.density[select(2u,3u,((flags[i]>>2u)&3u)==3u)];}
fn cell(p:vec2<f32>)->vec2<i32>{return vec2<i32>(floor(p*gp.inv))-vec2<i32>(bitcast<i32>(gp.ox),bitcast<i32>(gp.oy));}
const DIAMETER:f32=2.5/1.7888543819998317;
@compute @workgroup_size(256)
fn degrees(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=gp.count){return;}degree[i]=0u;if(!grain(i)){return;}
 let p=before[i].xy;let c=cell(p);var n=0u;
 for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  let q=c+vec2<i32>(x,y);if(any(q<vec2<i32>(0))||q.x>=i32(gp.w)||q.y>=i32(gp.h)){continue;}
  let k=u32(q.y)*gp.w+u32(q.x);
  for(var slot=starts[k];slot<starts[k]+counts[k];slot++){
   let j=sorted[slot];if(j==i||!grain(j)){continue;}
   if(distance(p,before[j].xy)<DIAMETER){n++;}
  }
 }}degree[i]=n;
}
@compute @workgroup_size(256)
fn contacts(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=gp.count||!grain(i)){return;}let p=before[i];let c=cell(p.xy);
 let invMass=1.0/mass(i);var shift=vec2<f32>(0.0);var dv=vec2<f32>(0.0);
 for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  let q=c+vec2<i32>(x,y);if(any(q<vec2<i32>(0))||q.x>=i32(gp.w)||q.y>=i32(gp.h)){continue;}
  let k=u32(q.y)*gp.w+u32(q.x);
  for(var slot=starts[k];slot<starts[k]+counts[k];slot++){
   let j=sorted[slot];if(j==i||!grain(j)){continue;}let other=before[j];let delta=p.xy-other.xy;
   let d=length(delta);if(d>=DIAMETER){continue;}
   var normal=vec2<f32>(1.0,0.0);
   if(d>1e-8){normal=delta/d;}else{normal.x=select(-1.0,1.0,i<j);}
   let invOther=1.0/mass(j);let pairScale=1.0/f32(max(1u,max(degree[i],degree[j])));
   let inverse=1.0/(invMass+invOther);let relative=p.zw-other.zw;
   let closing=min(0.0,dot(relative,normal));let jn=-closing*inverse;
   let tangent=relative-normal*dot(relative,normal);let speed=length(tangent);
   var impulse=normal*jn;
   if(speed>1e-8){impulse-=tangent/speed*min(speed*inverse,0.35*jn);}
   dv+=impulse*(invMass*pairScale);
   shift+=normal*((DIAMETER-d)*inverse*invMass*pairScale);
  }
 }}
 pos[i]=vec4<f32>(p.xy+shift,p.zw+dv);aux[i].zw=p.xy;
}
`;
function contactSource(blackSand){return blackSand?CONTACT_SOURCE.replace('return cfg.density[select(2u,3u,((flags[i]>>2u)&3u)==3u)];','let origin=(flags[i]>>2u)&3u;if(origin==2u){return cfg.density[1u];}return cfg.density[select(2u,3u,origin==3u)];'):CONTACT_SOURCE;}
function dragPair(ma,mb,va,vb,h,rate){
 if(!(ma>0&&mb>0))return [va.slice(),vb.slice()];
 var sum=ma+mb,mean=va.map(function(v,i){return (ma*v+mb*vb[i])/sum;}),rel=va.map(function(v,i){return (v-vb[i])/(1+h*rate);});
 return [mean.map(function(v,i){return v+mb/sum*rel[i];}),mean.map(function(v,i){return v-ma/sum*rel[i];})];
}
function create(instance,options){
 var opts=options||{},device=instance.device,queue=instance.queue;
 var width=+opts.width,height=+opts.height,density=opts.density||[1,0.7733,2.65],drag=opts.drag||[4,4,4];
 var phases=opts.separateGold?4:3,pairs=phases*(phases-1)/2;
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!density.every(function(d){return d>0&&Number.isFinite(d);})||density.length!==phases||drag.length!==pairs||!drag.every(function(d){return d>=0&&Number.isFinite(d);}))throw Error('Invalid material-slip physical parameters.');
 if(!opts.cellSize||!opts.restDensity||!opts.fixedScale)throw Error('The native grid constants are required.');
 // Complete native world plus its padded 16-cell blocks, not a particle cap.
 // Native bounds include both endpoints before their 16-cell margin and block rounding.
 var capacity=Math.min(2097152,Math.ceil((Math.ceil(width/opts.cellSize)+33)/16)*16*Math.ceil((Math.ceil(height/opts.cellSize)+33)/16)*16);
 var buffers=[],destroyed=false;
 function buffer(name,size,usage){var b=device.createBuffer({label:'liquid.slip.'+name,size:size,usage:usage});buffers.push(b);return b;}
 var config=buffer('config',phases===4?128:64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),packed=buffer('momentum',capacity*(phases*12+12),GPUBufferUsage.STORAGE),velocity=buffer('velocity',capacity*phases*16,GPUBufferUsage.STORAGE),snapshot=buffer('resolved',capacity*phases*16,GPUBufferUsage.STORAGE);
 var contactAffine=buffer('contactAffine',instance.maxParticles*16,GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);
 queue.writeBuffer(config,0,new Float32Array([density[0],density[1],density[2],density[3]||0,drag[0],drag[1],drag[2],0,width,height,0,opts.gridMaxCells,opts.restDensity,opts.cellSize,opts.fixedScale,capacity]));
 if(phases===4){
  if(!opts.bed)throw Error('A mixed-grain sluice requires its physical bed.');
  queue.writeBuffer(config,64,new Float32Array([drag[3],drag[4],drag[5],0].concat(opts.bed.line,opts.bed.riffles,[opts.bed.thickness,opts.bed.count,0,0])));
 }
 var module=device.createShaderModule({label:'liquid.materialSlip',code:phases===4?sluiceSource(opts.blackSand):SOURCE}),resources=[instance.paramsBuf,config,instance.buf.pos,instance.buf.affine,instance.buf.aux,instance.buf.flag,packed,velocity,instance.buf.cellMass,instance.buf.cellOilMass,instance.simParamsBuf,instance.buf.terrainMask,snapshot];
 var bindings={clearCells:[0,1,6,7],scatter:[0,1,2,3,5,6,8,9],stress:[0,1,2,4,5,6,8,10],solve:[0,1,6,10,12],stabilizeGrid:[0,7,10,12],gridBoundary:[0,1,7,10,11],gather:[0,1,2,3,4,5,7,10],jolt:[0,1,2,5]},pipes={},groups={};
 if(phases===4){bindings.bedCollide=[0,1,2,4,5];bindings.bedGrains=[0,1,2,4,5];}
 Object.keys(bindings).forEach(function(name){
  var entries=bindings[name].map(function(binding){return {binding:binding,visibility:GPUShaderStage.COMPUTE,buffer:{type:binding===0||binding===1||binding===10?'uniform':binding===5||binding===11?'read-only-storage':'storage'}};});
  var layout=device.createBindGroupLayout({label:'liquid.slip.'+name,entries:entries});
  pipes[name]=device.createComputePipeline({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module:module,entryPoint:name}});
  groups[name]=device.createBindGroup({layout:layout,entries:bindings[name].map(function(binding){return {binding:binding,resource:{buffer:resources[binding]}};})});
 });
 var contactPipes={},contactGroups={},contactModule=null,contactBefore=null;
 if(opts.grainContacts){
  if(phases!==4)throw Error('Mixed grain contacts require four phases.');
  contactBefore=buffer('grainBefore',instance.maxParticles*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
  var degrees=buffer('grainDegrees',instance.maxParticles*4,GPUBufferUsage.STORAGE);
  contactModule=device.createShaderModule({label:'liquid.slip.grainContacts',code:contactSource(opts.blackSand)});
  var cr=[instance.paramsBuf,config,instance.buf.pos,contactBefore,instance.buf.flag,degrees,instance.buf.cellCount,instance.buf.cellStart,instance.buf.sortedIdx,instance.buf.aux];
  [['degrees',[0,3,4,5,6,7,8]],['contacts',[0,1,2,3,4,5,6,7,8,9]]].forEach(function(row){
   var layout=device.createBindGroupLayout({entries:row[1].map(function(b){return {binding:b,visibility:GPUShaderStage.COMPUTE,buffer:{type:b<2?'uniform':b===2||b===5||b===9?'storage':'read-only-storage'}};})});
   contactPipes[row[0]]=device.createComputePipeline({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module:contactModule,entryPoint:row[0]}});
   contactGroups[row[0]]=device.createBindGroup({layout:layout,entries:row[1].map(function(b){return {binding:b,resource:{buffer:cr[b]}};})});
  });
 }
 var model={ready:false,error:null,capacity:capacity,
  readyPromise:Promise.all([module.getCompilationInfo(),contactModule?contactModule.getCompilationInfo():Promise.resolve({messages:[]})]).then(function(infos){var errors=infos.flatMap(function(info){return info.messages;}).filter(function(m){return m.type==='error';});if(errors.length)throw Error(errors.map(function(m){return m.lineNum+': '+m.message;}).join('\n'));if(destroyed)throw Error('Material slip was retired during compilation.');model.ready=true;return model;}).catch(function(error){model.error=error.message;throw error;}),
  encode:function(encoder){
   if(!model.ready||destroyed)throw Error('Material slip is not ready.');
   if(instance.grid.cells>capacity)throw Error('Material-slip grid exceeds its declared world allocation.');
   var pass=encoder.beginComputePass({label:'liquid.materialSlip.step'});
   ['clearCells','scatter','stress','solve','stabilizeGrid','gridBoundary','gather'].concat(phases===4?['bedCollide']:[]).forEach(function(name){pass.setPipeline(pipes[name]);pass.setBindGroup(0,groups[name]);pass.dispatchWorkgroups(Math.ceil((name==='clearCells'||name==='solve'||name==='stabilizeGrid'||name==='gridBoundary'?instance.grid.cells:instance.uploadedCount)/256));});pass.end();
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
  stats:function(){return {grainClasses:opts.blackSand?['quartz','magnetite','gold']:phases===4?['quartz','gold']:['grain'],mixedGrainContacts:!!opts.grainContacts,enabled:!destroyed,ready:model.ready,error:model.error,densities:density.slice(),dragRates:drag.slice(),commonGravity:instance.simParamsHost[0],referenceArea:opts.cellSize*opts.cellSize/opts.restDensity,gridCapacity:capacity,method:'Separate APIC phase momentum, shared compressive volume stress, implicit equal/opposite drag. '+(opts.grainContacts?'Mass-weighted grain contacts and Coulomb friction. ':'')+'No calibrated viscosity, permeability, surface tension or Drucker-Prager sand law.'};},
  destroy:function(){if(destroyed)return;destroyed=true;model.ready=false;if(instance.materialSlip===model)delete instance.materialSlip;instance.needsDenseClear=true;buffers.forEach(function(b){b.destroy();});}
 };
 if(opts.grainContacts)model.encodeGrainContacts=function(encoder){
  encoder.copyBufferToBuffer(instance.buf.pos,0,contactBefore,0,instance.uploadedCount*16);
  var pass=encoder.beginComputePass({label:'liquid.slip.mixedGrainContacts'});
  ['degrees','contacts'].forEach(function(name){pass.setPipeline(contactPipes[name]);pass.setBindGroup(0,contactGroups[name]);pass.dispatchWorkgroups(Math.ceil(instance.uploadedCount/256));});pass.setPipeline(pipes.bedGrains);pass.setBindGroup(0,groups.bedGrains);pass.dispatchWorkgroups(Math.ceil(instance.uploadedCount/256));pass.end();
 };
 model.grainColors=opts.grainColors||null;
 return model;
}
root.LiquidMaterialSlipWGPU={create:create,source:SOURCE,sluiceSource:sluiceSource,contactSource:CONTACT_SOURCE,grainContactSource:contactSource,dragPair:dragPair};
})(typeof window!=='undefined'?window:globalThis);
