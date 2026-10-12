/* Preserved finite Henry fizz, isolated draft namespace. No hose or eruption is added. */
/* Opt-in native dissolved CO2, finite interfacial transfer and real rough-surface nucleation. */
(function(root){
  'use strict';
  var R=8.314462618,ROOM=293.15,ATM=101325;
  function henry(t){return .00034*Math.exp(2300*(1/t-1/298.15));}
  function equilibrium(area,t,partial){return area*henry(t)*R*ROOM*partial/ATM;}
  function transfer(value,target,rate,dt){return (value-target)*(1-Math.exp(-Math.max(0,rate*dt)));}
  function gasPressure(exterior,rootPressure,r,tension,eulerian,atmosphere){return eulerian?Math.max(atmosphere*.01,atmosphere+rootPressure):exterior+tension/r;}
  function quadratic(u){u=Math.abs(u);return u<.5?.75-u*u:u<1.5?.5*(1.5-u)*(1.5-u):0;}
  function surfacePatches(rect,h){
    var rows=[],edges=[[rect.x,rect.y,-1,0,rect.height],[rect.x+rect.width,rect.y,1,0,rect.height],[rect.x,rect.y,0,-1,rect.width],[rect.x,rect.y+rect.height,0,1,rect.width]];
    edges.forEach(function(e){for(var at=0;at<e[4];at+=h){var length=Math.min(h,e[4]-at),along=at+length*.5;rows.push([e[0]+(e[2]===0?along:0),e[1]+(e[3]===0?along:0),e[2],e[3],length,h,0,0,0,0,0,0]);}});return rows;
  }
  function surfaceWeight(face,q){var h=face[5],dx=q.x-face[0],dy=q.y-face[1];if(dx*face[2]+dy*face[3]<0)return 0;return quadratic((dx-face[2]*h*.5)/h)*quadratic((dy-face[3]*h*.5)/h);}
  var SOURCE=`
struct Fizz {material:vec4f, transport:vec4f, candy:vec4f, controls:vec4f};
@group(0) @binding(16) var<uniform> fizz:Fizz;
// Conserved fixed-point room-reference CO2 amount, sub-quantum credit, initialization, stable generation.
@group(0) @binding(17) var<storage,read_write> dissolved:array<vec4u>;
@group(0) @binding(18) var<storage,read_write> pendingGas:array<atomic<i32>>;
@group(0) @binding(19) var<storage,read> slots:array<vec4u>;
@group(0) @binding(20) var<storage,read_write> fizzLedger:array<atomic<i32>>;
@group(0) @binding(21) var<storage,read_write> bubbleBudget:array<atomic<i32>>;
struct FizzSample {state:vec4u, data:vec4f};
@group(0) @binding(22) var<storage,read_write> samples:array<FizzSample>;
struct SurfacePatch {face:vec4f, size:vec4f, flux:vec4f};
@group(0) @binding(23) var<storage,read_write> surface:array<SurfacePatch>;
fn concentration(area:f32,t:f32,partial:f32)->f32{return area*.00034*exp(2300.*(1./t-1./298.15))*8.314462618*293.15*partial/101325.;}
fn recipientPressure(b:u32,support:u32)->f32{
 if(material[b].z<1.5){return outsidePressure(bubbles[b].xy,material[b].y)+p.material.z/material[b].y;}
 // This branch is selected only for the parcel's matching current positive gas root.
 return max(p.material.x*.01,p.material.x+history[support-1u].pressure);
}
fn takeBubble(b:u32,wanted:i32)->i32 {
 loop {let old=atomicLoad(&bubbleBudget[b]);let actual=min(max(0,old),max(0,wanted));if(actual==0){return 0;}
  let result=atomicCompareExchangeWeak(&bubbleBudget[b],old,old-actual);if(result.exchanged){return actual;}}
}
@compute @workgroup_size(64) fn budgetGas(@builtin(global_invocation_id) id:vec3u){let b=id.x;if(b>=u32(p.step.z)){return;}atomicStore(&bubbleBudget[b],select(0,i32(material[b].x),material[b].z>.5 && material[b].z<2.5));}
// Sample native geometry and gas first so no entry point exceeds ten storage bindings.
@compute @workgroup_size(128) fn sampleFizz(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(p.step.y)){return;}let f=flags[i];samples[i]=FizzSample(vec4u(NONE,NONE,f,0u),vec4f(0.));
 if((f&160u)!=0u || (f&3u)!=0u){return;}
 let q=pos[i].xy;let c=cell(q);if(c==NONE || cells[c].kind==0u){return;}
 let t=293.15+80.*f32(flags[i]>>24u)/127.5;let absolute=max(1013.25,(p.material.x+history[c].pressure)/p.material.x*101325.);
 var partial=absolute;var factor=0.;var recipient=NONE;var room=false;var pore=.00000001;
 let used=u32(max(0,atomicLoad(&ledger[4])));let support=supported(c);
 for(var b=0u;b<used;b++){
  if(material[b].z<.5 || material[b].z>2.5){continue;}
  var fractionTouch=0.;if(material[b].z<1.5){fractionTouch=clamp((material[b].y+1.25-distance(q,bubbles[b].xy))/1.25,0.,1.);}
  else if(support!=NONE && support>0u && material[b].w==f32(support)){fractionTouch=clamp(voidArea(c)/(p.air.x*p.air.x),0.,1.);}
  if(fractionTouch>factor){factor=fractionTouch;recipient=b;pore=1.;partial=recipientPressure(b,support)/p.material.x*101325.;}
 }
 if(support==0u){room=true;recipient=NONE;factor=max(factor,clamp(voidArea(c)/(p.air.x*p.air.x),0.,1.));partial=absolute*fizz.controls.z;pore=1.;}
 // Rough tablet transfer is integrated over actual exposed solid faces in separate ordered passes.
 if(factor==0.){for(var k=0u;k<4u;k++){let adj=adjacent(c,k);if(adj!=NONE && geometry[adj].volume.x>0.){factor=1.;}}}
 samples[i]=FizzSample(vec4u(c,recipient,f,select(0u,1u,room)),vec4f(t,partial,factor,pore));
}
@compute @workgroup_size(128) fn dissolve(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(p.step.y)){return;}let sample=samples[i];var d=dissolved[i];let living=slots[i].x!=0u && (sample.state.z&160u)==0u && (sample.state.z&3u)==0u;
 if(!living || (d.z>0u && d.w!=slots[i].y)){if(d.z>0u){atomicAdd(&fizzLedger[4],i32(d.x));}d=vec4u(0u);}
 if(!living){dissolved[i]=d;return;}
 if(d.z==0u){let initial=select(0u,u32(round(fizz.material.x*fizz.material.y*p.air.w)),i<u32(fizz.material.z) && slots[i].y==0u);d=vec4u(initial,0u,1u,slots[i].y);atomicAdd(&fizzLedger[0],i32(initial));}
 let c=sample.state.x;let recipient=sample.state.y;let room=sample.state.w!=0u;
 let t=sample.data.x;let partial=sample.data.y;let factor=sample.data.z;let pore=sample.data.w;
 if(c==NONE || factor==0.){dissolved[i]=d;return;}
 let equilibriumAmount=concentration(fizz.material.x,t,partial)*p.air.w;
 // A pre-existing cavity grows only above its capillary pressure. Smooth walls have tiny pores.
 let threshold=concentration(fizz.material.x,t,partial+select(.144/pore,0.,pore>.1))*p.air.w;
 if(f32(d.x)>equilibriumAmount && f32(d.x)<=threshold){dissolved[i]=d;return;}
 let rate=fizz.transport.x/(fizz.transport.y*sqrt(fizz.material.x)*fizz.transport.z)*factor;
 var credit=bitcast<f32>(d.y)+(f32(d.x)-equilibriumAmount)*(1.-exp(-rate*p.step.x*fizz.transport.w));
 if(credit>=1.){let amount=min(i32(d.x),i32(floor(credit)));d.x-=u32(amount);credit-=f32(amount);
  if(room){atomicAdd(&fizzLedger[3],amount);}else{
   // Existing interfaces grow from their own finite dissolved flux; only new cavities await nucleation.
   if(recipient!=NONE){atomicAdd(&bubbleBudget[recipient],amount);}else{atomicAdd(&pendingGas[c],amount);}atomicAdd(&fizzLedger[6],amount);
  }
 }else if(credit<=-1. && recipient!=NONE){let requested=i32(floor(-credit));let amount=takeBubble(recipient,requested);d.x+=u32(amount);credit+=f32(amount);atomicAdd(&fizzLedger[7],amount);if(amount<requested){credit-=trunc(credit);}}
 if(credit<0. && recipient==NONE){credit=0.;}d.y=bitcast<u32>(credit);dissolved[i]=d;
}
@compute @workgroup_size(64) fn exchangeGas(@builtin(global_invocation_id) id:vec3u){let b=id.x;if(b>=u32(max(0,atomicLoad(&ledger[4]))) || material[b].z<.5 || material[b].z>2.5){return;}
 // All liquid-slot debits and credits complete before this one signed commit per gas recipient.
 let remaining=atomicLoad(&bubbleBudget[b]);let change=remaining-i32(material[b].x);if(change!=0){material[b].x=f32(remaining);if(remaining<=0){material[b]=vec4f(0.);}atomicAdd(&ledger[0],change);}}
fn quadratic(u:f32)->f32{let a=abs(u);if(a<.5){return .75-a*a;}if(a<1.5){return .5*(1.5-a)*(1.5-a);}return 0.;}
fn surfaceWeight(facet:SurfacePatch,q:vec2f)->f32{
 let delta=q-facet.face.xy;if(dot(delta,facet.face.zw)<0.){return 0.;}
 let offset=(delta-facet.face.zw*facet.size.y*.5)/facet.size.y;return quadratic(offset.x)*quadratic(offset.y);
}
fn solutionAlive(i:u32)->bool{return slots[i].x!=0u && (flags[i]&160u)==0u && (flags[i]&3u)==0u && dissolved[i].z>0u && dissolved[i].w==slots[i].y;}
@compute @workgroup_size(32) fn surfaceSample(@builtin(global_invocation_id) id:vec3u){
 let s=id.x;if(s>=arrayLength(&surface)){return;}var facet=surface[s];facet.flux=vec4f(0.);surface[s]=facet;if(fizz.controls.x<=0.){return;}
 let c=cell(facet.face.xy+facet.face.zw*.001);let solid=cell(facet.face.xy-facet.face.zw*.001);
 if(c==NONE || solid==NONE || cells[c].kind==0u || geometry[c].volume.x>.001 || geometry[solid].volume.x<.999){return;}
 var volume=0.;var amount=0.;var heat=0.;for(var i=0u;i<u32(p.step.y);i++){
  if(!solutionAlive(i)){continue;}let w=surfaceWeight(facet,pos[i].xy);let v=fizz.material.x*w;
  volume+=v;amount+=f32(dissolved[i].x)*w;heat+=(293.15+80.*f32(flags[i]>>24u)/127.5)*v;
 }
 if(volume<=0.){return;}let wet=clamp(volume/(facet.size.y*facet.size.y),0.,1.);let area=facet.size.x*wet;
 var exterior=history[c].pressure;if(cells[c].kind==2u){let gasRoot=atomicLoad(&labels[c].current);exterior=0.;if(gasRoot>0u && gasRoot!=NONE){exterior=history[gasRoot-1u].pressure;}}
 let t=heat/volume;let partial=max(1013.25,(p.material.x+exterior)/p.material.x*101325.)+.144/fizz.controls.y;
 let equilibriumAmount=concentration(volume,t,partial)*p.air.w;
 let rate=fizz.transport.x/(fizz.transport.y*fizz.transport.z)*area*fizz.controls.w/volume;
 let requested=max(0.,(amount-equilibriumAmount)*(1.-exp(-rate*p.step.x*fizz.transport.w)));
 facet.flux=vec4f(volume,requested,area,0.);surface[s]=facet;
 atomicAdd(&fizzLedger[9],i32(round(area*p.air.w)));atomicAdd(&fizzLedger[10],i32(round(requested)));atomicAdd(&fizzLedger[11],1);
}
@compute @workgroup_size(128) fn surfaceRelease(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(p.step.y) || !solutionAlive(i)){return;}let q=pos[i].xy;let c=cell(q);if(c==NONE){return;}
 var requested=0.;for(var s=0u;s<arrayLength(&surface);s++){let facet=surface[s];if(facet.flux.x>0. && facet.flux.y>0.){requested+=facet.flux.y*surfaceWeight(facet,q)*fizz.material.x/facet.flux.x;}}
 if(requested<=0.){return;}var d=dissolved[i];var credit=bitcast<f32>(d.y)+requested;
 if(credit>=1.){let demand=i32(floor(credit));let amount=min(i32(d.x),demand);d.x-=u32(amount);credit-=f32(amount);if(amount<demand){credit-=trunc(credit);}
  atomicAdd(&pendingGas[c],amount);atomicAdd(&fizzLedger[6],amount);atomicAdd(&fizzLedger[12],amount);
 }d.y=bitcast<u32>(credit);dissolved[i]=d;
}
@compute @workgroup_size(1) fn nucleate(){
 let step=atomicLoad(&ledger[6]);let unit=max(1,i32(round(p.material.y*p.air.w)));
 for(var c=0u;c<u32(p.air.y*p.air.z);c++){
  let amount=atomicLoad(&pendingGas[c]);if(amount<unit){continue;}let q=center(c);let absolute=outsidePressure(q,3.);
  let r=2.*p.material.x*(f32(unit)/p.air.w)/3.14159265/(sqrt(p.material.z*p.material.z+4.*absolute*p.material.x*(f32(unit)/p.air.w)/3.14159265)+p.material.z);
  if(!clear(q,r)){continue;}var free=NONE;let used=u32(max(0,atomicLoad(&ledger[4])));
  for(var j=0u;j<used;j++){if(material[j].z<.5 || material[j].z>2.5){free=j;break;}}
  if(free==NONE){if(used>=u32(p.step.z)){atomicAdd(&ledger[13],1);return;}free=used;atomicStore(&ledger[4],i32(used+1u));}
  bubbles[free]=vec4f(q,0.,0.);material[free]=vec4f(f32(unit),r,1.,-1.);witness[free]=vec4f(0.,p.step.w,q.y,f32(step));
  atomicAdd(&pendingGas[c],-unit);atomicAdd(&ledger[0],unit);atomicAdd(&ledger[10],1);atomicAdd(&fizzLedger[8],1);
 }
}
@compute @workgroup_size(128) fn dissolvedInventory(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i<u32(p.step.y)){atomicAdd(&fizzLedger[1],i32(dissolved[i].x));if(dissolved[i].z>0u && (!all(pos[i]==pos[i]) || abs(bitcast<f32>(dissolved[i].y))>1.e12)){atomicAdd(&fizzLedger[5],1);}}if(i<u32(p.air.y*p.air.z)){atomicAdd(&fizzLedger[2],atomicLoad(&pendingGas[i]));}}
`;
  function build(options,L,A,resources,buffer){
    if(!options.boundary || !options.boundary.slotsBuffer)throw Error('Dissolved gas needs the native stable-slot lifecycle.');
    var size=L.maxParticles,count=A.width*A.height,uniform=buffer('henry.params',64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST),dissolved=buffer('henry.dissolved',size*16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),pending=buffer('henry.pending',count*4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),ledger=buffer('henry.ledger',128,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST),budget=buffer('henry.budget',size*4,GPUBufferUsage.STORAGE),samples=buffer('henry.context',size*32,GPUBufferUsage.STORAGE);
    resources.push(uniform,dissolved,pending,options.boundary.slotsBuffer,ledger,budget,samples);
    var config=options.fizz,mpp=.0254/(options.width/30),physical=Math.sqrt((30/options.width)*(options.gravity||250)/386.0886),rect=config.candy,faces=surfacePatches(rect,L.cellSize),surface=buffer('henry.surface',faces.length*48,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST);resources.push(surface);L.queue.writeBuffer(surface,0,new Float32Array(faces.flat()));
    L.queue.writeBuffer(uniform,0,new Float32Array([1.5625,config.carbonationVolumes,L.uploadedCount,0,1.9e-9,3e-6,mpp,physical,rect.x,rect.y,rect.width,rect.height,config.mentos===false?0:1,3e-6,.00042,40]));
    return {source:SOURCE,bindings:{budgetGas:[0,2,21],sampleFizz:[0,1,2,4,5,6,7,8,13,14,16,22],dissolve:[0,16,17,18,19,20,21,22],exchangeGas:[2,4,21],surfaceSample:[0,5,6,7,8,13,14,16,17,19,20,23],surfaceRelease:[0,13,14,16,17,18,19,20,23],nucleate:[0,1,2,3,4,5,6,7,18,20],dissolvedInventory:[0,13,17,18,20]},buffers:{dissolved:dissolved,pending:pending,ledger:ledger,surface:surface},surfaceCount:faces.length,latest:new Int32Array(32),mentos:config.mentos!==false};
  }
  root.WSSDraftFizz={build:build,source:SOURCE,henry:henry,equilibrium:equilibrium,transfer:transfer,gasPressure:gasPressure,quadratic:quadratic,surfacePatches:surfacePatches,surfaceWeight:surfaceWeight};
})(typeof window!=='undefined'?window:globalThis);

/* Opt-in isothermal gas parcels coupled to the native water pool and air topology. */
(function(root){
  'use strict';
  function radius(amount,absolute,atmosphere,tension){return 2*atmosphere*amount/Math.PI/(Math.sqrt(tension*tension+4*absolute*atmosphere*amount/Math.PI)+tension);}
  function slip(r,g,drag){return Math.sqrt(Math.PI*r*g/drag);}
  var SOURCE=`
struct Params {step:vec4f, air:vec4f, source:vec4f, material:vec4f, domain:vec4f};
struct History {pressure:f32,fraction:f32,amount:i32,volume:i32,geometricVolume:f32,airRoot:u32,vapor:u32,error:f32};
struct Cell {fraction:f32,u:f32,v:f32,kind:u32,rhs:f32,diagonal:f32,residual:f32,pad:f32};
struct Geometry {volume:vec4f,faces:vec4f};
struct Label {current:atomic<u32>,previous:u32};
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read_write> bubbles:array<vec4f>;
// Fixed-point room-reference gas amount, radius, state (1 dispersed, 2 Eulerian, 3 escaped), native root.
@group(0) @binding(2) var<storage,read_write> material:array<vec4f>;
// Last validated spatial gas support, birth clock, birth y, last birth substep.
@group(0) @binding(3) var<storage,read_write> witness:array<vec4f>;
@group(0) @binding(4) var<storage,read_write> ledger:array<atomic<i32>>;
@group(0) @binding(5) var<storage,read_write> history:array<History>;
@group(0) @binding(6) var<storage,read_write> cells:array<Cell>;
@group(0) @binding(7) var<storage,read> geometry:array<Geometry>;
@group(0) @binding(8) var<storage,read_write> labels:array<Label>;
@group(0) @binding(9) var<storage,read_write> gas:array<atomic<i32>>;
@group(0) @binding(10) var<storage,read_write> previous:array<atomic<i32>>;
@group(0) @binding(11) var<storage,read_write> current:array<atomic<i32>>;
@group(0) @binding(12) var<storage,read> transport:array<vec4f>;
@group(0) @binding(13) var<storage,read_write> pos:array<vec4f>;
@group(0) @binding(14) var<storage,read_write> flags:array<u32>;
@group(0) @binding(15) var<storage,read_write> affine:array<vec4f>;
const NONE:u32=0xffffffffu;
fn cell(q:vec2f)->u32{let c=vec2i(floor(q/p.air.x));if(any(c<vec2i(0)) || c.x>=i32(p.air.y) || c.y>=i32(p.air.z)){return NONE;}return u32(c.y)*u32(p.air.y)+u32(c.x);}
fn center(c:u32)->vec2f{return (vec2f(f32(c%u32(p.air.y)),f32(c/u32(p.air.y)))+.5)*p.air.x;}
fn adjacent(c:u32,d:u32)->u32{return cell(center(c)+array<vec2f,4>(vec2f(-1.,0.),vec2f(1.,0.),vec2f(0.,-1.),vec2f(0.,1.))[d]*p.air.x);}
fn voidArea(c:u32)->f32{return max(0.,(1.-cells[c].fraction)*(1.-geometry[c].volume.x)*p.air.x*p.air.x);}
fn supported(c:u32)->u32{
 if(c==NONE || cells[c].kind==0u || voidArea(c)*p.air.w<.5){return NONE;}
 if(cells[c].kind==2u){return atomicLoad(&labels[c].current);}
 var r=NONE;for(var d=0u;d<4u;d++){let n=adjacent(c,d);let opposite=array<u32,4>(1u,0u,3u,2u)[d];
  if(n==NONE || cells[n].kind!=2u || voidArea(n)*p.air.w<.5 || min(geometry[c].faces[d],geometry[n].faces[opposite])<=0.){continue;}
  let q=atomicLoad(&labels[n].current);if(r!=NONE && r!=q){return NONE;}r=q;
 }return r;
}
fn clear(q:vec2f,r:f32)->bool{
 for(var d=0u;d<9u;d++){let a=f32(d)*6.2831853/8.;let sample=q+select(vec2f(cos(a),sin(a))*r,vec2f(0.),d==8u);let c=cell(sample);
  if(c==NONE || geometry[c].volume.x>.001){return false;}
 }return true;
}
fn waterVelocity(q:vec2f)->vec2f {
 let c=cell(q);if(c==NONE || cells[c].kind==0u){return vec2f(0.);}
 let f=fract(q/p.air.x);let face=transport[c*3u];return vec2f(mix(face.x,face.y,f.x),mix(face.z,face.w,f.y));
}
fn outsidePressure(q:vec2f,r:f32)->f32{
 var pressure=0.;var weight=0.;for(var d=0u;d<8u;d++){let angle=f32(d)*6.2831853/8.;let c=cell(q+vec2f(cos(angle),sin(angle))*(r+p.air.x));
  if(c!=NONE && cells[c].kind==1u){pressure+=history[c].pressure;weight+=1.;}
 }return max(p.material.x*.01,p.material.x+pressure/max(1.,weight));
}
@compute @workgroup_size(1) fn admit(){
 atomicAdd(&ledger[6],1);let step=atomicLoad(&ledger[6]);if(step<=8 || p.source.w<=0.){return;}
 var credit=bitcast<f32>(atomicLoad(&ledger[7]))+p.source.z*p.step.x;
 let unit=max(1,i32(round(p.material.y*p.air.w)));
 for(var count=0u;count<8u && credit*p.air.w>=f32(unit);count++){
  var slot=NONE;let start=u32(max(0,atomicLoad(&ledger[5])));let used=u32(max(0,atomicLoad(&ledger[4])));
  for(var j=0u;j<used;j++){let k=(start+j)%max(1u,used);if(material[k].z<.5 || material[k].z>2.5){slot=k;break;}}
  if(slot==NONE){if(used>=u32(p.step.z)){atomicAdd(&ledger[13],1);break;}slot=used;atomicStore(&ledger[4],i32(used+1u));}
  let absolute=outsidePressure(p.source.xy,4.);let amount=f32(unit)/p.air.w;
  let r=2.*p.material.x*amount/3.14159265/(sqrt(p.material.z*p.material.z+4.*absolute*p.material.x*amount/3.14159265)+p.material.z);
  if(!clear(p.source.xy,r)){atomicAdd(&ledger[15],1);break;}
  bubbles[slot]=vec4f(p.source.xy,0.,0.);material[slot]=vec4f(f32(unit),r,1.,-1.);witness[slot]=vec4f(0.,p.step.w,p.source.y,f32(step));
  atomicStore(&ledger[5],i32(slot+1u));atomicAdd(&ledger[0],unit);atomicAdd(&ledger[10],1);credit-=f32(unit)/p.air.w;
 }atomicStore(&ledger[7],bitcast<i32>(credit));
}
@compute @workgroup_size(128) fn sparger(@builtin(global_invocation_id) id:vec3u){
 let c=id.x;if(c>=u32(p.air.y*p.air.z) || c!=cell(p.source.xy) || geometry[c].volume.x>.001){return;}
 let step=f32(atomicLoad(&ledger[6]));let used=u32(max(0,atomicLoad(&ledger[4])));var birth=false;
 for(var i=0u;i<used;i++){if(material[i].z>.5 && material[i].z<1.5 && step-witness[i].w<3.){birth=true;}}
 if(birth){cells[c].fraction=min(cells[c].fraction,.4);cells[c].kind=2u;atomicStore(&labels[c].current,c+1u);atomicAdd(&ledger[16],1);}
}
@compute @workgroup_size(128) fn strip(@builtin(global_invocation_id) id:vec3u){
 let c=id.x;if(c>=u32(p.air.y*p.air.z)){return;}let amount=atomicLoad(&previous[c]);
 if(amount>history[c].amount){atomicAdd(&ledger[8],1);}history[c].amount-=min(amount,history[c].amount);
 atomicStore(&previous[c],-1);atomicStore(&current[c],0);
}
@compute @workgroup_size(128) fn descendants(@builtin(global_invocation_id) id:vec3u){
 let c=id.x;if(c>=u32(p.air.y*p.air.z)){return;}let old=history[c].airRoot;let now=supported(c);
 if(old==0u || old==NONE || now==NONE || history[old-1u].volume<=0 || cells[c].kind==0u){return;}
 let overlap=min((1.-history[c].fraction)*p.air.x*p.air.x,voidArea(c));if(round(overlap*p.air.w)<=0.){return;}
 let volume=select(0,atomicLoad(&gas[(max(1u,now)-1u)*16u]),now>0u);loop{
  let prior=atomicLoad(&previous[old-1u]);var priorRoot=NONE;var priorVolume=-1;
  if(prior>0){priorRoot=supported(u32(prior-1));if(priorRoot!=NONE){priorVolume=select(0,atomicLoad(&gas[(max(1u,priorRoot)-1u)*16u]),priorRoot>0u);}}
  if(volume<priorVolume || (volume==priorVolume && priorRoot<now) || (volume==priorVolume && priorRoot==now && prior>0 && u32(prior-1)<=c)){return;}
  let changed=atomicCompareExchangeWeak(&previous[old-1u],prior,i32(c+1u));if(changed.exchanged){return;}
 }
}
@compute @workgroup_size(64) fn assign(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;let used=u32(max(0,atomicLoad(&ledger[4])));if(i>=used || material[i].z<.5 || material[i].z>2.5){return;}
 var r=NONE;var support=cell(bubbles[i].xy);
 if(material[i].z>1.5 && material[i].w>0.){let old=u32(material[i].w);let child=atomicLoad(&previous[old-1u]);if(child>0){support=u32(child-1);r=supported(support);}}
 if(r==NONE){support=cell(bubbles[i].xy);r=supported(support);}
 if(r==NONE && material[i].z>1.5 && witness[i].x>0.){support=u32(witness[i].x-1.);r=supported(support);}
 if(r==0u){material[i].z=3.;material[i].w=0.;atomicAdd(&ledger[1],i32(material[i].x));atomicAdd(&ledger[17],1);return;}
 if(r==NONE){
  if(material[i].z>1.5){material[i].z=1.;if(witness[i].x>0.){bubbles[i]=vec4f(center(u32(witness[i].x-1.)),bubbles[i].zw);}atomicAdd(&ledger[12],1);}
  material[i].w=-1.;return;
 }
 if(material[i].z<1.5 && f32(atomicLoad(&gas[(r-1u)*16u]))/p.air.w>=3.*p.air.x*p.air.x){material[i].z=2.;atomicAdd(&ledger[11],1);}
 material[i].w=f32(r);witness[i].x=f32(support+1u);atomicAdd(&current[r-1u],i32(material[i].x));
}
@compute @workgroup_size(128) fn inject(@builtin(global_invocation_id) id:vec3u){let c=id.x;if(c<u32(p.air.y*p.air.z)){atomicAdd(&gas[c*16u+2u],atomicLoad(&current[c]));}}
@compute @workgroup_size(128) fn finish(@builtin(global_invocation_id) id:vec3u){let c=id.x;if(c<u32(p.air.y*p.air.z)){let amount=atomicLoad(&current[c]);if(amount>history[c].amount){atomicAdd(&ledger[8],1);}atomicStore(&previous[c],min(amount,max(0,history[c].amount)));}}
@compute @workgroup_size(64) fn advance(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(max(0,atomicLoad(&ledger[4]))) || material[i].z<.5 || material[i].z>1.5){return;}
 var q=bubbles[i].xy;let amount=material[i].x/p.air.w;let absolute=outsidePressure(q,material[i].y);
 let radius=2.*p.material.x*amount/3.14159265/(sqrt(p.material.z*p.material.z+4.*absolute*p.material.x*amount/3.14159265)+p.material.z);
 let velocity=waterVelocity(q)-vec2f(0.,sqrt(3.14159265*radius*p.domain.z/p.material.w));
 let delta=velocity*p.step.x;let count=max(1u,u32(ceil(length(delta)/max(1.,radius*.5))));
 for(var step=1u;step<=count;step++){let candidate=q+delta/f32(count);if(clear(candidate,radius)){q=candidate;}else{
  let x=q+vec2f(delta.x/f32(count),0.);if(clear(x,radius)){q=x;}let y=q+vec2f(0.,delta.y/f32(count));if(clear(y,radius)){q=y;}
 }}bubbles[i]=vec4f(q,(q-bubbles[i].xy)/p.step.x);material[i].y=radius;
}
@compute @workgroup_size(1) fn coalesce(){
 let used=u32(max(0,atomicLoad(&ledger[4])));for(var a=0u;a<used;a++){if(material[a].z<.5 || material[a].z>1.5){continue;}
  for(var b=a+1u;b<used;b++){if(material[b].z<.5 || material[b].z>1.5 || distance(bubbles[a].xy,bubbles[b].xy)>material[a].y+material[b].y){continue;}
   let total=material[a].x+material[b].x;let q=(bubbles[a].xy*material[a].x+bubbles[b].xy*material[b].x)/total;
   let r=sqrt(material[a].y*material[a].y+material[b].y*material[b].y);if(!clear(q,r)){continue;}
   bubbles[a]=(bubbles[a]*material[a].x+bubbles[b]*material[b].x)/total;material[a].x=total;material[a].y=r;material[b]=vec4f(0.);atomicAdd(&ledger[18],1);
  }
 }
}
@compute @workgroup_size(128) fn contact(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(p.step.y) || (flags[i]&160u)!=0u || (flags[i]&3u)!=0u){return;}var value=pos[i];
 for(var b=0u;b<u32(max(0,atomicLoad(&ledger[4])));b++){
  if(material[b].z<.5 || material[b].z>1.5){continue;}let difference=value.xy-bubbles[b].xy;let distance=length(difference);let r=material[b].y;
  if(distance>=r){continue;}let normal=select(vec2f(1.,0.),difference/max(distance,.00001),distance>.00001);let projected=bubbles[b].xy+normal*(r+.0625);
  let c=cell(projected);if(c==NONE || geometry[c].volume.x>.001){atomicAdd(&ledger[19],1);continue;}
  let closing=min(0.,dot(value.zw-bubbles[b].zw,normal));value=vec4f(projected,value.zw-closing*normal);
  let C=affine[i];let column=vec2f(C.x*normal.x+C.z*normal.y,C.y*normal.x+C.w*normal.y);affine[i]=C-vec4f(normal.x*column.x,normal.x*column.y,normal.y*column.x,normal.y*column.y);
  flags[i]=flags[i]&~0x00ffff10u;atomicAdd(&ledger[20],1);
 }pos[i]=value;
}
@compute @workgroup_size(64) fn inventory(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(max(0,atomicLoad(&ledger[4]))) || material[i].z<.5 || material[i].z>2.5){return;}
 atomicAdd(&ledger[select(2u,3u,material[i].z>1.5)],i32(material[i].x));
 if(any(bubbles[i]!=bubbles[i]) || any(material[i]!=material[i]) || material[i].y<=0. || material[i].x<=0.){atomicAdd(&ledger[9],1);}
}
`;
  async function create(options){
    var L=options.liquid,A=options.air,device=L.device,queue=L.queue,U=GPUBufferUsage;
    if(!L.simActive || !A || !A.enabled || !A.buffers.transport)throw Error('Bubbles need native direct water transport and opt-in air.');
    var n=options.maxParticles,count=A.width*A.height,buffers=[];
    function buffer(label,size,usage){var value=device.createBuffer({label:'toy.bubbles.'+label,size:size,usage:usage});buffers.push(value);return value;}
    var params=buffer('params',80,U.UNIFORM|U.COPY_DST),bubbles=buffer('position',n*16,U.STORAGE|U.COPY_SRC),material=buffer('material',n*16,U.STORAGE|U.COPY_SRC),
      witness=buffer('witness',n*16,U.STORAGE|U.COPY_SRC),ledger=buffer('ledger',128,U.STORAGE|U.COPY_SRC|U.COPY_DST),previous=buffer('previous',count*4,U.STORAGE),current=buffer('current',count*4,U.STORAGE);
    var resources=[params,bubbles,material,witness,ledger,A.buffers.history,A.buffers.cells,A.buffers.geometry,A.buffers.labels,A.buffers.gas,previous,current,A.buffers.transport,L.buf.pos,L.buf.flag,L.buf.affine];
    var fizz=options.fizz ? root.WSSDraftFizz.build(options,L,A,resources,buffer) : null;
    var source=SOURCE;
    if(fizz)source=source.replace('c!=cell(p.source.xy) || ', '').replace('step-witness[i].w<3.', 'step-witness[i].w<3. && cell(bubbles[i].xy)==c')+fizz.source;
    var module=device.createShaderModule({label:'toy.bubbles.model',code:source}),info=await module.getCompilationInfo();
    var errors=info.messages.filter(function(m){return m.type==='error';});if(errors.length)throw Error(errors.map(function(m){return m.lineNum+': '+m.message;}).join('; '));
    var bindings={admit:[0,1,2,3,4,5,6,7],sparger:[0,2,3,4,6,7,8],strip:[0,4,5,10,11],descendants:[0,5,6,7,8,9,10],assign:[0,1,2,3,4,6,7,8,9,10,11],inject:[0,9,11],finish:[0,4,5,10,11],advance:[0,1,2,4,5,6,7,12],coalesce:[0,1,2,4,7],contact:[0,1,2,4,7,13,14,15],inventory:[1,2,4]},pipes={},groups={};
    if(fizz){Object.assign(bindings,fizz.bindings);bindings.sparger=[0,1,2,3,4,6,7,8];}
    for(var name of Object.keys(bindings)){pipes[name]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:name}});groups[name]=device.createBindGroup({layout:pipes[name].getBindGroupLayout(0),entries:bindings[name].map(function(binding){return {binding:binding,resource:{buffer:resources[binding]}};})});}
    var active=options.inject!==false,retired=false,clock=0,quantity=0,latest=new Int32Array(32),points=[],error=null;
    var reads=Array.from({length:3},function(){return {buffer:buffer('read',256+n*32,U.COPY_DST|U.MAP_READ),busy:false,captured:false};}),row=null;
    function encode(enc,key,number){var pass=enc.beginComputePass({label:'toy.bubbles.'+key});pass.setPipeline(pipes[key]);pass.setBindGroup(0,groups[key]);pass.dispatchWorkgroups(Math.max(1,Math.ceil(number/(key==='surfaceSample'?32:['admit','coalesce','nucleate'].includes(key)?1:['advance','assign','inventory','budgetGas','exchangeGas'].includes(key)?64:128))));pass.end();}
    var companion={
      beginFrame:function(enc,frame){clock=frame.clock;quantity=frame.count;var mpp=.0254/(options.width/30),tension=.072*A.settings.atmospherePressure/101325/mpp;
        queue.writeBuffer(params,0,new Float32Array([frame.h,frame.count,n,clock,A.cellSize,A.width,A.height,A.settings.volumeScale,options.hose.x,options.hose.y,options.rateArea,active?1:0,A.settings.atmospherePressure,options.parcelArea,tension,options.dragCoefficient||1,options.width,options.height,options.gravity||250,0]));},
      beforeSubstep:function(enc,step){encode(enc,'admit',1);if(fizz){encode(enc,'budgetGas',n);encode(enc,'sampleFizz',step.count);encode(enc,'dissolve',step.count);encode(enc,'exchangeGas',n);enc.clearBuffer(fizz.buffers.ledger,36,12);encode(enc,'surfaceSample',fizz.surfaceCount);encode(enc,'surfaceRelease',step.count);encode(enc,'nucleate',1);}encode(enc,'contact',step.count);},
      afterSubstep:function(enc,step){encode(enc,'advance',n);encode(enc,'coalesce',1);encode(enc,'contact',step.count);},
      beginGas:function(enc){encode(enc,'strip',count);},prepareGas:function(enc){encode(enc,'sparger',count);},
      collectGas:function(enc){encode(enc,'descendants',count);encode(enc,'assign',n);encode(enc,'inject',count);},finishGas:function(enc){encode(enc,'finish',count);},
      captureFrame:function(enc){enc.clearBuffer(ledger,8,8);encode(enc,'inventory',n);if(fizz){enc.clearBuffer(fizz.buffers.ledger,4,8);encode(enc,'dissolvedInventory',Math.max(quantity,count));}row=reads.find(function(r){return !r.busy;})||null;if(row){row.busy=true;row.captured=true;row.clock=clock;row.count=Math.min(n,Math.max(64,latest[4]+64));enc.copyBufferToBuffer(ledger,0,row.buffer,0,128);if(fizz)enc.copyBufferToBuffer(fizz.buffers.ledger,0,row.buffer,128+n*32,128);enc.copyBufferToBuffer(bubbles,0,row.buffer,128,row.count*16);enc.copyBufferToBuffer(material,0,row.buffer,128+n*16,row.count*16);}},
      afterSubmit:function(){var read=row;row=null;if(!read || !read.captured)return;read.captured=false;read.buffer.mapAsync(GPUMapMode.READ).then(function(){if(!retired){var data=read.buffer.getMappedRange();latest=new Int32Array(data,0,32).slice();if(fizz)fizz.latest=new Int32Array(data,128+n*32,32).slice();var b=new Float32Array(data,128,read.count*4),m=new Float32Array(data,128+n*16,read.count*4);points=[];for(var i=0;i<Math.min(latest[4],read.count);i++)if(m[i*4+2]>.5&&m[i*4+2]<1.5)points.push({x:b[i*4],y:b[i*4+1],radius:m[i*4+1],amount:m[i*4]/A.settings.volumeScale});companion.captureClock=read.clock;}read.buffer.unmap();}).catch(function(e){error=e.message;companion.error=error;}).finally(function(){read.busy=false;});},
      captureClock:0,toggle:function(){active=!active;return active;},
      stats:function(){var scale=A.settings.volumeScale;return {fizz:fizz ? {initialAmount:fizz.latest[0]/scale,dissolvedAmount:fizz.latest[1]/scale,pendingAmount:fizz.latest[2]/scale,surfaceAmount:fizz.latest[3]/scale,exportedAmount:fizz.latest[4]/scale,finiteErrors:fizz.latest[5],releasedAmount:fizz.latest[6]/scale,reabsorbedAmount:fizz.latest[7]/scale,nucleations:fizz.latest[8],mentos:fizz.mentos,residual:(fizz.latest[0]-fizz.latest[1]-fizz.latest[2]-fizz.latest[3]-fizz.latest[4]-latest[0])/scale} : null,injecting:active,injectedAmount:latest[0]/scale,escapedAmount:latest[1]/scale,dispersedAmount:latest[2]/scale,eulerianAmount:latest[3]/scale,residual:(latest[0]-latest[1]-latest[2]-latest[3])/scale,births:latest[10],transitions:latest[11],recoveries:latest[12],coalescences:latest[18],finiteErrors:latest[9],historyUnderflows:latest[8],capacityRefusals:latest[13],blockedSource:latest[15],spargerGasSteps:latest[16],surfaceExits:latest[17],blockedContacts:latest[19],waterContacts:latest[20],usedSlots:latest[4],points:points,captureClock:companion.captureClock,captureAgeSimulationSeconds:Math.max(0,L.simulationClock-companion.captureClock),error:error};},
      draw:function(ctx,colors){ctx.save();ctx.strokeStyle=colors.edge;ctx.fillStyle=colors.fill;ctx.lineWidth=1;points.forEach(function(b){ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);ctx.globalAlpha=.65;ctx.fill();ctx.globalAlpha=.85;ctx.stroke();});ctx.restore();},
      buffers:{position:bubbles,material:material,witness:witness,ledger:ledger,fizz:fizz ? fizz.buffers : null},
      destroy:function(){retired=true;L.setToyMembrane(null);A.setPhaseCompanion(null);buffers.forEach(function(b){try{b.destroy();}catch(e){}});}
    };A.setPhaseCompanion(companion);return companion;
  }
  root.WSSDraftFizzBubbles={create:create,source:SOURCE,radius:radius,slip:slip};
})(typeof window!=='undefined'?window:globalThis);
