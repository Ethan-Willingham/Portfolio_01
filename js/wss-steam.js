/* Interfacial water/vapor phase change over the native stable parcel slots.
 * Dry air keeps its existing topology. Vapor supplies its own conserved nRT.
 * No liquid is moved to a source, sink, or separately integrated water system. */
(function(root){
  'use strict';
  var CP=4180,LATENT=2256400,RV=461.52,ROOM=293.15,ATM=101325;
  function boiling(pressure){return 1/(1/373.15-RV/LATENT*Math.log(Math.max(1000,pressure)/ATM));}
  function parcelMass(pitch,inches,depth){return Math.pow(pitch/inches*.0254,2)*depth*.0254*1000;}
  function referenceAmount(mass,inches,depth){return mass*RV*ROOM/ATM/((depth*.0254)*Math.pow(.0254/inches,2));}
  function ventFlow(delta,density,area,coefficient,absolute,gamma){
    if(!(density>0 && area>0))return 0;
    var speed=Math.abs(delta)/Math.sqrt(Math.abs(delta)+10)*Math.sqrt(2/density);
    return Math.sign(delta)*coefficient*area*Math.min(speed,Math.sqrt(gamma*absolute/density));
  }
  var SOURCE=`
struct Params {step:vec4f, heater:vec4f, material:vec4f, air:vec4f, source:vec4f, vent:vec4f, scale:vec4f};
struct Grid {count:u32,w:u32,h:u32,ox:u32,oy:u32,cells:u32,dt:f32,inv:f32,cols:f32,tile:f32,rows:f32,pad:f32,tc:u32,tr:u32,tw:u32,th:u32,region:vec4f};
struct History {pressure:f32,fraction:f32,amount:i32,volume:i32,geometricVolume:f32,airRoot:u32,vapor:u32,error:f32};
struct Label {current:atomic<u32>,previous:u32};
struct Geometry {volume:vec4f,faces:vec4f};
struct Cell {fraction:f32,u:f32,v:f32,kind:u32,rhs:f32,diagonal:f32,residual:f32,pad:f32};
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read_write> pos:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> flags:array<u32>;
// Enthalpy relative to room water, phase, gas lineage; w is 0 new, 1 liquid,
// negative first-unowned substep, or exact injected amount in a normal float bit pattern.
@group(0) @binding(3) var<storage,read_write> parcel:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> sums:array<atomic<u32>>;
@group(0) @binding(5) var<storage,read_write> history:array<History>;
@group(0) @binding(6) var<storage,read_write> labels:array<Label>;
@group(0) @binding(7) var<storage,read_write> gasWords:array<atomic<i32>>;
// Strip/finish hold the exact previous amount. Between them this same buffer
// holds a positive-overlap support cell + 1, separate from native rounding choice.
@group(0) @binding(8) var<storage,read_write> previousSteam:array<atomic<i32>>;
@group(0) @binding(9) var<storage,read_write> currentSteam:array<atomic<i32>>;
@group(0) @binding(10) var<storage,read_write> affine:array<vec4f>;
@group(0) @binding(11) var<storage,read_write> aux:array<vec4f>;
// Input and lost heat, last validated gas support and native-position cells + 1.
@group(0) @binding(12) var<storage,read_write> book:array<vec4f>;
@group(0) @binding(13) var<storage,read_write> retainedDry:array<atomic<i32>>;
@group(0) @binding(14) var<storage,read> geometry:array<Geometry>;
@group(0) @binding(15) var<storage,read> cells:array<Cell>;
// Credit, requested flow, cumulative escaped dry/steam mass; jet state;
// elapsed time, admitted dry mass, requested vapor mass, escaped enthalpy.
@group(0) @binding(16) var<storage,read_write> ventState:array<vec4f>;
const NONE:u32=0xffffffffu;
fn live(i:u32)->bool{return i<u32(p.step.y) && (flags[i]&128u)==0u && (flags[i]&3u)==0u;}
fn cell(q:vec2f)->u32{let c=vec2i(floor(q/p.air.x));if(any(c<vec2i(0)) || c.x>=i32(p.air.y) || c.y>=i32(p.air.z)){return NONE;}return u32(c.y)*u32(p.air.y)+u32(c.x);}
fn owner(q:vec2f)->u32 {
 let c=cell(q);if(c==NONE){return NONE;}
 // Native history already assigns mixed cells only through open gas faces.
 return history[c].airRoot;
}
fn adjacent(c:u32,d:u32)->u32 {
 let q=vec2f(f32(c%u32(p.air.y))+.5,f32(c/u32(p.air.y))+.5)*p.air.x;
 return cell(q+array<vec2f,4>(vec2f(-1.,0.),vec2f(1.,0.),vec2f(0.,-1.),vec2f(0.,1.))[d]*p.air.x);
}
fn airArea(c:u32)->f32 {
 return max(0.,(1.-cells[c].fraction)*max(0.,1.-geometry[c].volume.x)*p.air.x*p.air.x);
}
fn positiveVoid(c:u32)->bool {
 return c!=NONE && cells[c].kind!=0u && cells[c].fraction<1. && i32(round(airArea(c)*p.air.w))>0;
}
fn nearbyGas(c:u32)->u32 {
 if(!positiveVoid(c)){return NONE;}
 if(cells[c].kind==2u){return atomicLoad(&labels[c].current);}
 var r=NONE;
 for(var d=0u;d<4u;d++){
  let n=adjacent(c,d);let opposite=array<u32,4>(1u,0u,3u,2u)[d];
  if(n==NONE || cells[n].kind!=2u || !positiveVoid(n) || min(geometry[c].faces[d],geometry[n].faces[opposite])<=0.){continue;}
  let q=atomicLoad(&labels[n].current);if(r!=NONE && r!=q){return NONE;}r=q;
 }return r;
}
fn overlapArea(oldFraction:f32,fraction:f32,solid:f32,dx:f32)->f32 {
 return max(0.,min((1.-oldFraction)*dx*dx,(1.-fraction)*max(0.,1.-solid)*dx*dx));
}
fn preferDescendant(candidate:u32,candidateVolume:i32,current:u32,currentVolume:i32)->bool {
 return candidateVolume>currentVolume || (candidateVolume==currentVolume && candidate<current);
}
fn lineage(v:vec4f)->u32 {if(v.z<0. || v.w<0.){return NONE;}return u32(v.z);}
fn nucleation(i:u32)->f32 {var q=i^atomicLoad(&sums[26])^u32(p.step.w);q=(q^(q>>16u))*0x7feb352du;q=(q^(q>>15u))*0x846ca68bu;return f32(q^(q>>16u))/4294967296.;}
fn temperatureBoil(r:u32)->f32{var pressure=101325.;if(r!=NONE && r>0u){pressure=max(1000.,101325.*(1.+history[r-1u].pressure/p.source.z));}
 return clamp(1./(1./373.15-461.52/2256400.*log(pressure/101325.)),293.15,473.15)-293.15;}
fn hot(q:vec2f)->bool{return all(q>=p.heater.xy) && all(q<=p.heater.zw);}
@compute @workgroup_size(64) fn prepare(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i==0u){atomicAdd(&sums[26],1u);}if(!live(i)){return;}
 if(parcel[i].w==0.){parcel[i]=vec4f(select(0.,p.material.x*p.source.y,f32(i)<p.scale.z),0.,-1.,1.);atomicAdd(&sums[8],u32(round(parcel[i].x*64.)));atomicAdd(&sums[25],1u);}
 if(parcel[i].y<.5 && hot(pos[i].xy)){atomicAdd(&sums[0],1u);}
}
@compute @workgroup_size(64) fn thermal(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i) || parcel[i].y>1.5){return;}var e=parcel[i].x;var phase=parcel[i].y;
 let nativeCell=cell(pos[i].xy);book[i].w=select(0.,f32(nativeCell+1u),nativeCell!=NONE);
 let dt=p.step.x;var r=lineage(parcel[i]);if(phase<.5){r=owner(pos[i].xy);}let boil=temperatureBoil(r);let sensible=p.material.x*boil;
 var status=parcel[i].w;
 if(phase<.5){
  if(hot(pos[i].xy) && atomicLoad(&sums[0])>0u){let input=p.source.x*p.step.z*dt/f32(atomicLoad(&sums[0]));e+=input;book[i].x+=input;}
  let loss=min(e,e*.01*dt);e-=loss;book[i].y+=loss;
  // Paid heat stays in native liquid until the current gas classification
  // verifies an exposed interface. Vapor birth runs after the native remap.
 }else{
  // Finite wall heat exchange pays the latent heat before condensation.
  let temperature=max(boil,(e-p.material.y)/p.material.x);
  let loss=min(e,p.source.w*temperature*dt);e-=loss;book[i].y+=loss;
  if(e<=sensible){phase=0.;status=1.;r=NONE;book[i].z=0.;flags[i]=flags[i]&0x0000000fu;affine[i]=vec4f(0.);aux[i]=vec4f(4.,0.,pos[i].xy);pos[i]=vec4f(pos[i].xy,0.,0.);atomicAdd(&sums[5],1u);}
 }
 var gasLineage=select(-1.,f32(r),r!=NONE);
 // An unresolved parcel keeps its last owner for diagnostics. Physical
 // recovery uses the native position or separately validated support cell.
 if(phase>.5 && r==NONE){gasLineage=parcel[i].z;}
 parcel[i]=vec4f(e,phase,gasLineage,status);
 // The existing parcel heat channel also colors the native water surface.
 let heat=select(min(2.,max(0.,e/p.material.x/80.)),0.,phase>.5);
 flags[i]=(flags[i]&0x00ffffffu)|(u32(floor(heat*127.5))<<24u);
}
@compute @workgroup_size(128) fn stripSteam(@builtin(global_invocation_id) id:vec3u){
 let c=id.x;if(c>=u32(p.air.y*p.air.z)){return;}
 let previous=atomicLoad(&previousSteam[c]);
 if(previous>history[c].amount){atomicAdd(&sums[20],1u);}
 if(previous>0){history[c].amount-=min(history[c].amount,previous);}
 atomicStore(&previousSteam[c],-1);atomicStore(&currentSteam[c*2u],0);atomicStore(&currentSteam[c*2u+1u],0);
}
@compute @workgroup_size(128) fn mapDescendants(@builtin(global_invocation_id) id:vec3u){
 let c=id.x;if(c>=u32(p.air.y*p.air.z)){return;}
 let old=history[c].airRoot;if(old==0u || old==NONE || history[old-1u].volume<=0 || cells[c].kind==0u || cells[c].fraction>=1.){return;}
 let now=nearbyGas(c);if(now==0u || now==NONE){return;}
 // The native remap's positive fixed-point overlap is the only lineage
 // evidence. A nearby unrelated pocket is not a descendant.
 let overlap=i32(round(overlapArea(history[c].fraction,cells[c].fraction,geometry[c].volume.x,p.air.x)*p.air.w));
 if(overlap<=0 || atomicLoad(&gasWords[(old-1u)*16u+1u])<=0){return;}
 let volume=atomicLoad(&gasWords[(now-1u)*16u]);if(volume<=0){return;}
 loop {
  let currentCell=bitcast<u32>(atomicLoad(&previousSteam[old-1u]));var current=NONE;var currentVolume=-1;
  if(currentCell!=NONE){current=nearbyGas(currentCell-1u);if(current>0u && current!=NONE){currentVolume=atomicLoad(&gasWords[(current-1u)*16u]);}}
  var preferred=preferDescendant(now,volume,current,currentVolume);
  // Within the chosen child retain its fullest supported cell, then a stable
  // cell tie. The pocket's minimum label is not a material position.
  if(now==current && volume==currentVolume){preferred=airArea(c)>airArea(currentCell-1u) || (airArea(c)==airArea(currentCell-1u) && c+1u<currentCell);}
  if(!preferred){return;}
  let result=atomicCompareExchangeWeak(&previousSteam[old-1u],bitcast<i32>(currentCell),i32(c+1u));
  if(result.exchanged){return;}
 }
}
@compute @workgroup_size(128) fn retainDry(@builtin(global_invocation_id) id:vec3u){
 let c=id.x;let count=u32(p.air.y*p.air.z);if(c>=count){return;}
 if(labels[c].previous==c+1u && history[c].volume>0 && atomicLoad(&gasWords[c*16u+12u])==-1){
  atomicAdd(&retainedDry[c],max(0,history[c].amount));
 }
 if(c==0u && atomicLoad(&gasWords[count*16u+3u])!=0){
  atomicAdd(&sums[19],u32(max(0,atomicLoad(&gasWords[count*16u+4u]))));
  atomicAdd(&sums[22],u32(max(0,atomicLoad(&gasWords[count*16u+1u]))));
 }
}
@compute @workgroup_size(128) fn returnDry(@builtin(global_invocation_id) id:vec3u){
 let c=id.x;if(c>=u32(p.air.y*p.air.z)){return;}let amount=atomicLoad(&retainedDry[c]);if(amount<=0){return;}
 let r=nearbyGas(c);if(r==NONE){return;}atomicStore(&retainedDry[c],0);
 if(r==0u){atomicAdd(&sums[19],u32(amount));return;}
 atomicAdd(&gasWords[(r-1u)*16u+2u],amount);
}
@compute @workgroup_size(64) fn collectSteam(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i) || parcel[i].y<.5 || parcel[i].y>1.5){return;}
 let old=select(NONE,u32(max(0.,parcel[i].z)),parcel[i].z>=0.);var r=NONE;var support=NONE;
 if(old>0u && old!=NONE && parcel[i].w>0.){
  let witness=bitcast<u32>(atomicLoad(&previousSteam[old-1u]));
  if(witness!=NONE){support=witness-1u;r=nearbyGas(support);}
 }
 // A failed map never treats a root number as a spatial anchor. The frozen
 // native position and last validated material support permit local recovery.
 if((r==NONE || r==0u) && book[i].w>0.){support=u32(book[i].w)-1u;r=nearbyGas(support);}
 if((r==NONE || r==0u) && book[i].z>0.){support=u32(book[i].z)-1u;r=nearbyGas(support);}
 if(r==NONE || r==0u){
  if(parcel[i].w>0.){parcel[i].w=-f32(atomicLoad(&sums[26]));}
  atomicMax(&sums[30],u32(max(0.,f32(atomicLoad(&sums[26]))+parcel[i].w)));
  atomicAdd(&sums[7],1u);return;
 }
 recordSteam(i,r,support,temperatureBoil(lineage(parcel[i])));
}
fn recordSteam(i:u32,r:u32,support:u32,boil:f32){
 let q=r-1u;let temperature=293.15+max(boil,(parcel[i].x-p.material.y)/p.material.x);
 parcel[i].z=f32(r);book[i].z=f32(support+1u);
 // The steam term is n R T, expressed as equivalent room-air area.
 let raw=p.material.z*temperature/293.15*p.air.w;if(raw>1.5e9 || raw!=raw){atomicAdd(&sums[29],1u);}
 let amount=i32(round(clamp(raw,0.,1.5e9)));parcel[i].w=bitcast<f32>(amount+0x10000000);atomicAdd(&currentSteam[q*2u],amount);atomicAdd(&currentSteam[q*2u+1u],1);
}
@compute @workgroup_size(64) fn promoteSteam(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i) || parcel[i].y>=.5){return;}
 // Current P2G gas geometry, not prior history ownership, must support birth.
 let c=cell(pos[i].xy);let r=nearbyGas(c);if(r==NONE || r==0u){return;}
 // The last native pressure at this physical interface supplies an explicit
 // pressure estimate. Heat and APIC remain unchanged while support is absent.
 let boil=temperatureBoil(owner(pos[i].xy));let exposed=clamp(1.-cells[c].fraction,0.,1.);
 if(parcel[i].x<p.material.x*boil+p.material.y || nucleation(i)>=1.-exp(-p.step.x*exposed/p.material.w)){return;}
 parcel[i].y=1.;book[i].w=f32(c+1u);book[i].z=0.;flags[i]=(flags[i]&0x0000000fu)|32u;atomicAdd(&sums[4],1u);
 // Collection already mapped older vapor. Register this current-root birth
 // directly, so a numerically reused old root cannot remap it a second time.
 recordSteam(i,r,c,boil);
}
@compute @workgroup_size(1) fn ventGas(){
 ventState[2].x+=p.step.x;ventState[0].y=0.;ventState[1]=vec4f(0.);ventState[3].x=-1.;
 let c=cell(p.vent.xy);if(c==NONE || p.vent.z<=0. || cells[c].kind!=2u){return;}
 let r=nearbyGas(c);if(r==NONE || r==0u){return;}let q=r-1u;
 let volume=max(1e-12,f32(atomicLoad(&gasWords[q*16u]))/p.air.w*p.scale.x);
 let dry=max(0.,f32(atomicLoad(&gasWords[q*16u+2u]))/p.air.w);
 let vapor=f32(atomicLoad(&currentSteam[q*2u+1u]));
 let dryMass=dry*p.scale.x*p.scale.y;let vaporMass=vapor*p.scale.w;
 let delta=101325.*history[c].pressure/p.source.z;let absolute=max(1000.,101325.+delta);
 let density=select(p.scale.y,max(1e-6,(dryMass+vaporMass)/volume),delta>0.);
 let gamma=select(1.4,(1.4*dryMass+1.33*vaporMass)/max(dryMass+vaporMass,1e-12),delta>0.);
 let speed=min(abs(delta)/sqrt(abs(delta)+10.)*sqrt(2./density),sqrt(gamma*absolute/density));
 var flow=p.vent.w*p.vent.z*speed;
 // Explicit finite-port transfer is bounded to two percent per substep.
 var fraction=min(.02,flow*p.step.x/volume);flow=fraction*volume/p.step.x;
 let gasConstant=select(287.05,(287.05*dryMass+461.52*vaporMass)/max(dryMass+vaporMass,1e-12),delta>0.);
 ventState[0].y=select(-flow,flow,delta>0.);ventState[1]=vec4f(flow/max(1e-12,p.vent.w*p.vent.z),density,absolute/(density*gasConstant),absolute);
 ventState[3]=vec4f(f32(r),vapor,gamma,fraction);
 if(delta<=0.){
  let added=i32(round(flow*p.step.x/p.scale.x*p.air.w));atomicAdd(&gasWords[q*16u+2u],added);atomicAdd(&sums[22],u32(added));
  ventState[2].y+=f32(added)/p.air.w*p.scale.x*p.scale.y;return;
 }
 let removed=i32(round(dry*fraction*p.air.w));atomicSub(&gasWords[q*16u+2u],removed);atomicAdd(&sums[19],u32(removed));
 ventState[0].z+=f32(removed)/p.air.w*p.scale.x*p.scale.y;
 // Gas transfer accumulates a physical mass credit. Only full native vapor
 // parcels may leave; the requested/actual difference is bounded by one parcel.
 let wanted=vaporMass*fraction;ventState[0].x+=wanted;ventState[2].z+=wanted;
 if(ventState[0].x<p.scale.w || vapor<1.){return;}
 let start=(atomicLoad(&sums[26])*719u)%max(1u,u32(p.step.y));
 for(var j=0u;j<u32(p.step.y) && ventState[0].x>=p.scale.w;j++){
  let i=(start+j)%u32(p.step.y);if(!live(i) || parcel[i].y<.5 || parcel[i].y>1.5 || parcel[i].w<0. || u32(max(0.,parcel[i].z))!=r){continue;}
  let amount=bitcast<i32>(parcel[i].w)-0x10000000;atomicSub(&currentSteam[q*2u],amount);atomicSub(&currentSteam[q*2u+1u],1);
  ventState[0].x=max(0.,ventState[0].x-p.scale.w);ventState[0].w+=p.scale.w;ventState[2].w+=parcel[i].x;
  parcel[i].y=2.;atomicAdd(&sums[27],1u);
 }
}
@compute @workgroup_size(128) fn injectSteam(@builtin(global_invocation_id) id:vec3u){
 let c=id.x;if(c>=u32(p.air.y*p.air.z)){return;}
 let amount=atomicLoad(&currentSteam[c*2u]);if(amount<=0){return;}
 atomicAdd(&gasWords[c*16u+2u],amount);
}
@compute @workgroup_size(128) fn finishSteam(@builtin(global_invocation_id) id:vec3u){
 let c=id.x;if(c>=u32(p.air.y*p.air.z)){return;}
 // Record the steam actually written to native history, not a proposed term.
 let written=min(max(0,history[c].amount),atomicLoad(&currentSteam[c*2u]));atomicStore(&previousSteam[c],written);
 atomicAdd(&sums[16],u32(max(0,history[c].amount-written)));
 atomicAdd(&sums[17],u32(max(0,atomicLoad(&retainedDry[c]))));
}
@compute @workgroup_size(1) fn initializeLedger(){
 if(atomicLoad(&sums[23])==0u){atomicStore(&sums[18],atomicLoad(&sums[16])+atomicLoad(&sums[17]));atomicStore(&sums[23],1u);}
}
@compute @workgroup_size(64) fn inventory(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(!live(i)){return;}
 if(parcel[i].y<1.5){atomicAdd(&sums[select(10u,11u,parcel[i].y>.5)],1u);atomicAdd(&sums[12],u32(round(parcel[i].x*64.)));}
 else{atomicAdd(&sums[28],u32(round(parcel[i].x*64.)));}
 atomicAdd(&sums[2],u32(round(book[i].x*64.)));atomicAdd(&sums[3],u32(round(book[i].y*64.)));
 if(parcel[i].y<.5){atomicAdd(&sums[13],u32(round(min(parcel[i].x/p.material.x,temperatureBoil(owner(pos[i].xy)))*64.)));}
 if(parcel[i].y>.5 && parcel[i].y<1.5 && parcel[i].w<0.){
  atomicAdd(&sums[21],1u);atomicMax(&sums[31],u32(max(0.,f32(atomicLoad(&sums[26]))+parcel[i].w)));
 }
 if(any(pos[i]!=pos[i]) || any(abs(pos[i])>vec4f(1e7)) || !(parcel[i].x>=0.)){atomicAdd(&sums[14],1u);}
}
`;
  async function create(options){
    var L=options.liquid,A=options.air,device=L.device,queue=L.queue,U=GPUBufferUsage;
    if(!L.simActive || !A || !A.enabled)throw Error('Steam needs native water and air.');
    var n=options.maxParticles,count=A.width*A.height,mass=parcelMass(1.25,24,1),cp=mass*CP,latent=mass*LATENT;
    var initialCount=L.uploadedCount,unitVolume=.0254*Math.pow(.0254/24,2),roomDensity=ATM/(287.05*ROOM),area=Math.PI*Math.pow((options.ventDiameterInches||.25)*.0254,2)/4;
    var buffers=[];
    function buffer(label,size,usage){var b=device.createBuffer({label:'toy.steam.'+label,size:size,usage:usage});buffers.push(b);return b;}
    var params=buffer('params',112,U.UNIFORM|U.COPY_DST),parcels=buffer('parcels',n*16,U.STORAGE|U.COPY_SRC),
      sums=buffer('sums',128,U.STORAGE|U.COPY_DST|U.COPY_SRC),previous=buffer('previous',count*4,U.STORAGE),
      current=buffer('current',count*8,U.STORAGE),book=buffer('heat-book',n*16,U.STORAGE|U.COPY_SRC),retained=buffer('retained-dry',count*4,U.STORAGE),
      vent=buffer('vent',64,U.STORAGE|U.COPY_SRC),read=buffer('read',192,U.MAP_READ|U.COPY_DST);
    var module=device.createShaderModule({label:'toy.steam.phase',code:SOURCE}),info=await module.getCompilationInfo();
    var errors=info.messages.filter(function(m){return m.type==='error';});if(errors.length)throw Error(errors.map(function(m){return m.lineNum+': '+m.message;}).join('; '));
    var resources=[params,L.buf.pos,L.buf.flag,parcels,sums,A.buffers.history,A.buffers.labels,A.buffers.gas,previous,current,L.buf.affine,L.buf.aux,book,retained,A.buffers.geometry,A.buffers.cells,vent];
    var used={prepare:[0,1,2,3,4],thermal:[0,1,2,3,4,5,10,11,12],stripSteam:[0,4,5,8,9],
      mapDescendants:[0,5,6,7,8,14,15],retainDry:[0,4,5,6,7,13],returnDry:[0,4,6,7,13,14,15],
      collectSteam:[0,2,3,4,5,6,8,9,12,14,15],promoteSteam:[0,1,2,3,4,5,6,9,12,14,15],ventGas:[0,2,3,4,5,6,7,9,14,15,16],injectSteam:[0,7,9],
      finishSteam:[0,4,5,8,9,13],initializeLedger:[4],inventory:[0,1,2,3,4,5,12]},pipes={},groups={};
    for(var key of Object.keys(used)){
      pipes[key]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:key}});
      groups[key]=device.createBindGroup({layout:pipes[key].getBindGroupLayout(0),entries:used[key].map(function(binding){return {binding:binding,resource:{buffer:resources[binding]}};})});
    }
    var heated=options.heated!==false,pending=false,retired=false,error=null,latest=new Uint32Array(32),latestVent=new Float32Array(16),clock=0,capturedClock=0,quantity=0;
    var events=[],eventElapsed=0,eventDry=0,eventSteam=0,eventFrames=0,lastVent=null;
    function dispatch(encoder,key,number){var pass=encoder.beginComputePass({label:'toy.steam.'+key});pass.setPipeline(pipes[key]);pass.setBindGroup(0,groups[key]);pass.dispatchWorkgroups(Math.max(1,Math.ceil(number/(['injectSteam','stripSteam','mapDescendants','retainDry','returnDry','finishSteam'].includes(key)?128:64))));pass.end();}
    var companion={
      beginFrame:function(encoder,frame){
        clock=frame.clock;quantity=frame.count;var r=options.heater;
        queue.writeBuffer(params,0,new Float32Array([frame.h,frame.count,heated?1:0,options.seed||17,r.x,r.y,r.x+r.width,r.y+r.height,
          cp,latent,referenceAmount(mass,24,1),options.phaseRelaxationSeconds||.5,A.cellSize,A.width,A.height,A.settings.volumeScale,
          options.powerWatts,options.initialC-20,A.settings.atmospherePressure,options.vaporConductance,
          options.vent?options.vent.x:0,options.vent?options.vent.y:0,options.capped || !options.vent?0:area,options.ventCoefficient||.62,
          unitVolume,roomDensity,initialCount,mass]));
      },
      beforeSubstep:function(encoder,step){encoder.clearBuffer(sums,0,4);dispatch(encoder,'prepare',step.count);dispatch(encoder,'thermal',step.count);},
      afterSubstep:function(){},
      beginGas:function(encoder){dispatch(encoder,'stripSteam',count);},
      collectGas:function(encoder){dispatch(encoder,'mapDescendants',count);dispatch(encoder,'retainDry',count);dispatch(encoder,'returnDry',count);dispatch(encoder,'collectSteam',quantity);dispatch(encoder,'promoteSteam',quantity);dispatch(encoder,'ventGas',1);dispatch(encoder,'injectSteam',count);},
      finishGas:function(encoder){encoder.clearBuffer(sums,64,8);dispatch(encoder,'finishSteam',count);dispatch(encoder,'initializeLedger',1);},
      captureFrame:function(encoder){if(pending)return;encoder.clearBuffer(sums,8,8);encoder.clearBuffer(sums,40,24);encoder.clearBuffer(sums,84,4);encoder.clearBuffer(sums,112,4);encoder.clearBuffer(sums,124,4);dispatch(encoder,'inventory',quantity);encoder.copyBufferToBuffer(sums,0,read,0,128);encoder.copyBufferToBuffer(vent,0,read,128,64);pending=true;capturedClock=clock;},
      afterSubmit:function(){if(!pending || read.mapState!=='unmapped')return;read.mapAsync(GPUMapMode.READ).then(function(){
        if(!retired){var data=read.getMappedRange();latest=new Uint32Array(data,0,32).slice();latestVent=new Float32Array(data,128,16).slice();
          var elapsed=latestVent[8]-eventElapsed,dry=Math.max(0,latestVent[2]-eventDry),steam=Math.max(0,latest[27]-eventSteam)*mass;
          if(elapsed>0){lastVent={kind:'steam-vent',frameId:latest[26],simulationTime:capturedClock,duration:elapsed,dryMassKg:dry,steamMassKg:steam,
            massFlowKgPerSecond:(dry+steam)/elapsed,densityKgPerM3:latestVent[5],jetSpeedMPerSecond:latestVent[4],temperatureK:latestVent[6],
            requestedVolumeM3PerSecond:latestVent[1],actualVolumeM3PerSecond:latestVent[5]>0?(dry+steam)/elapsed/latestVent[5]:0,
            soundSpeedMPerSecond:latestVent[5]>0?Math.sqrt(latestVent[14]*latestVent[7]/latestVent[5]):0,
            throatAreaM2:area,whistleLengthM:(options.whistleLengthInches||2)*.0254,x:options.outlet?options.outlet.x:0,receivedAt:performance.now()};
            events.push(lastVent);if(events.length>4)events.shift();eventFrames++;
          }eventElapsed=latestVent[8];eventDry=latestVent[2];eventSteam=latest[27];
        }read.unmap();
      }).catch(function(e){error=e.message;companion.error=error;}).finally(function(){pending=false;});},
      toggle:function(){heated=!heated;return heated;},
      setPortFraction:function(fraction){if(retired||!Number.isFinite(fraction)||fraction<0||fraction>1)throw Error('Gas-port opening must be between zero and one');area=Math.PI*Math.pow((options.ventDiameterInches||.25)*.0254,2)/4*fraction;options.capped=fraction===0;return area;},
      setWhistleLength:function(inches){
        if(!options.adjustableWhistle || retired || !Number.isFinite(inches))return null;
        options.whistleLengthInches=Math.max(1.5,Math.min(5,inches));
        if(lastVent)lastVent.whistleLengthM=options.whistleLengthInches*.0254;
        events.forEach(function(event){event.whistleLengthM=options.whistleLengthInches*.0254;});
        return options.whistleLengthInches;
      },
      stats:function(){return {heated:heated,liquidParcels:latest[10],vaporParcels:latest[11],evaporations:latest[4],condensations:latest[5],
        parcelMassKg:mass,heaterWatts:heated?options.powerWatts:0,heatInputJ:latest[2]/64,heatLossJ:latest[3]/64,initialHeatJ:latest[8]/64,
        currentHeatJ:latest[12]/64,escapedHeatJ:latest[28]/64,heatResidualJ:(latest[8]+latest[2]-latest[3]-latest[12]-latest[28])/64,
        heatReadbackQuantizationBoundJ:latest[25]*4/(2*64),
        waterTemperatureC:latest[10]?20+latest[13]/64/latest[10]:null,finiteErrors:latest[14]+latest[29],phaseAmountOverflows:latest[29],unownedVaporVisits:latest[7],
        dryAmount:{initial:latest[18]/A.settings.volumeScale,live:latest[16]/A.settings.volumeScale,retained:latest[17]/A.settings.volumeScale,
          escaped:latest[19]/A.settings.volumeScale,captured:latest[22]/A.settings.volumeScale,
          residual:(latest[18]+latest[22]-latest[16]-latest[17]-latest[19])/A.settings.volumeScale},
        steamHistoryUnderflows:latest[20],strandedVaporParcels:latest[21],unownedVaporMaxConsecutiveSteps:latest[30],unownedVaporCurrentMaxSteps:latest[31],
        unownedVaporMaxSeconds:latest[30]*L.stepDt,unownedVaporCurrentMaxSeconds:latest[31]*L.stepDt,phaseRelaxationSeconds:options.phaseRelaxationSeconds||.5,
        escapedVaporParcels:latest[27],waterMassKg:{initial:initialCount*mass,added:Math.max(0,latest[25]-initialCount)*mass,
          liquid:latest[10]*mass,vapor:latest[11]*mass,escaped:latest[27]*mass,residual:(latest[25]-latest[10]-latest[11]-latest[27])*mass},
        vent:{capped:!!options.capped,whistleLengthInches:options.whistleLengthInches||2,adjustableWhistle:!!options.adjustableWhistle,diameterInches:options.ventDiameterInches||.25,coefficient:options.ventCoefficient||.62,
          escapedDryMassKg:latestVent[2],admittedDryMassKg:latestVent[9],
          requestedVaporMassKg:latestVent[10],escapedVaporMassKg:latest[27]*mass,quantizationCreditKg:latestVent[0],maxParcelKg:mass,
          events:eventFrames,last:lastVent},
        captureClock:capturedClock,captureAgeSimulationSeconds:Math.max(0,L.simulationClock-capturedClock),pending:pending,error:error,
        approximation:'Whole native parcels become vapor only at a currently validated gas interface, with a declared half-second material relaxation time scaled by exposed area. Heating and paid-heat condensation precede native P2G; vapor birth follows current gas classification and remap, using the previous native pressure at that physical interface. A new vapor parcel retains its last liquid grid contribution until the next native scatter, an explicit one-substep material staggering. Vapor is well mixed within its native gas lineage; its nRT is added to room-temperature dry air. At a pocket split, whole vapor parcels follow the largest current child supported by native gas overlap, rather than splitting a parcel between children. Recovery uses current positive gas void at the retained native position or the last validated support cell through open faces; topology labels are never spatial anchors. Vapor positions are not separately advected, and condensation returns the same native slots at their retained positions. Unresolved dry pockets retain amount locally and return only through open adjacent gas faces; retained dry gas and stranded vapor have no resolved pressure. A declared gas-only finite port uses pressure, area and mixture density, is linearized near zero and limited at sonic speed and two percent transfer per substep. Water covering the inlet blocks it. Vapor escape is quantized to whole 44 mg parcels; requested minus escaped transfer stays as a reported credit. Condensation, escape and added room-temperature water close the water-mass and heat ledgers. Gas momentum and compressional work remain unresolved.'};},
      events:function(){return events.splice(0);},
      buffers:{parcels:parcels,retainedDry:retained,support:book},
      destroy:function(){retired=true;L.setToyMembrane(null);A.setPhaseCompanion(null);buffers.forEach(function(b){try{b.destroy();}catch(e){}});}
    };
    A.setPhaseCompanion(companion);return companion;
  }
  root.WSSSteam={create:create,source:SOURCE,boiling:boiling,parcelMass:parcelMass,referenceAmount:referenceAmount,ventFlow:ventFlow};
})(typeof window!=='undefined'?window:globalThis);
