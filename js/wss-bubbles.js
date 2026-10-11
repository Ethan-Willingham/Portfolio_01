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
    var module=device.createShaderModule({label:'toy.bubbles.model',code:SOURCE}),info=await module.getCompilationInfo();
    var errors=info.messages.filter(function(m){return m.type==='error';});if(errors.length)throw Error(errors.map(function(m){return m.lineNum+': '+m.message;}).join('; '));
    var resources=[params,bubbles,material,witness,ledger,A.buffers.history,A.buffers.cells,A.buffers.geometry,A.buffers.labels,A.buffers.gas,previous,current,A.buffers.transport,L.buf.pos,L.buf.flag,L.buf.affine];
    var bindings={admit:[0,1,2,3,4,5,6,7],sparger:[0,2,3,4,6,7,8],strip:[0,4,5,10,11],descendants:[0,5,6,7,8,9,10],assign:[0,1,2,3,4,6,7,8,9,10,11],inject:[0,9,11],finish:[0,4,5,10,11],advance:[0,1,2,4,5,6,7,12],coalesce:[0,1,2,4,7],contact:[0,1,2,4,7,13,14,15],inventory:[0,1,2,4]},pipes={},groups={};
    for(var name of Object.keys(bindings)){pipes[name]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:name}});groups[name]=device.createBindGroup({layout:pipes[name].getBindGroupLayout(0),entries:bindings[name].map(function(binding){return {binding:binding,resource:{buffer:resources[binding]}};})});}
    var active=options.inject!==false,retired=false,clock=0,quantity=0,latest=new Int32Array(32),points=[],error=null;
    var reads=Array.from({length:3},function(){return {buffer:buffer('read',128+n*32,U.COPY_DST|U.MAP_READ),busy:false,captured:false};}),row=null;
    function encode(enc,key,number){var pass=enc.beginComputePass({label:'toy.bubbles.'+key});pass.setPipeline(pipes[key]);pass.setBindGroup(0,groups[key]);pass.dispatchWorkgroups(Math.max(1,Math.ceil(number/(['admit','coalesce'].includes(key)?1:['advance','assign','inventory'].includes(key)?64:128))));pass.end();}
    var companion={
      beginFrame:function(enc,frame){clock=frame.clock;quantity=frame.count;var mpp=.0254/(options.width/30),tension=.072*A.settings.atmospherePressure/101325/mpp;
        queue.writeBuffer(params,0,new Float32Array([frame.h,frame.count,n,clock,A.cellSize,A.width,A.height,A.settings.volumeScale,options.hose.x,options.hose.y,options.rateArea,active?1:0,A.settings.atmospherePressure,options.parcelArea,tension,options.dragCoefficient||1,options.width,options.height,options.gravity||250,0]));},
      beforeSubstep:function(enc,step){encode(enc,'admit',1);encode(enc,'contact',step.count);},
      afterSubstep:function(enc,step){encode(enc,'advance',n);encode(enc,'coalesce',1);encode(enc,'contact',step.count);},
      beginGas:function(enc){encode(enc,'strip',count);},prepareGas:function(enc){encode(enc,'sparger',count);},
      collectGas:function(enc){encode(enc,'descendants',count);encode(enc,'assign',n);encode(enc,'inject',count);},finishGas:function(enc){encode(enc,'finish',count);},
      captureFrame:function(enc){enc.clearBuffer(ledger,8,8);encode(enc,'inventory',n);row=reads.find(function(r){return !r.busy;})||null;if(row){row.busy=true;row.captured=true;row.clock=clock;row.count=Math.min(n,Math.max(64,latest[4]+64));enc.copyBufferToBuffer(ledger,0,row.buffer,0,128);enc.copyBufferToBuffer(bubbles,0,row.buffer,128,row.count*16);enc.copyBufferToBuffer(material,0,row.buffer,128+n*16,row.count*16);}},
      afterSubmit:function(){var read=row;row=null;if(!read || !read.captured)return;read.captured=false;read.buffer.mapAsync(GPUMapMode.READ).then(function(){if(!retired){var data=read.buffer.getMappedRange();latest=new Int32Array(data,0,32).slice();var b=new Float32Array(data,128,read.count*4),m=new Float32Array(data,128+n*16,read.count*4);points=[];for(var i=0;i<Math.min(latest[4],read.count);i++)if(m[i*4+2]>.5&&m[i*4+2]<1.5)points.push({x:b[i*4],y:b[i*4+1],radius:m[i*4+1],amount:m[i*4]/A.settings.volumeScale});companion.captureClock=read.clock;}read.buffer.unmap();}).catch(function(e){error=e.message;companion.error=error;}).finally(function(){read.busy=false;});},
      captureClock:0,toggle:function(){active=!active;return active;},
      stats:function(){var scale=A.settings.volumeScale;return {injecting:active,injectedAmount:latest[0]/scale,escapedAmount:latest[1]/scale,dispersedAmount:latest[2]/scale,eulerianAmount:latest[3]/scale,residual:(latest[0]-latest[1]-latest[2]-latest[3])/scale,births:latest[10],transitions:latest[11],recoveries:latest[12],coalescences:latest[18],finiteErrors:latest[9],historyUnderflows:latest[8],capacityRefusals:latest[13],blockedSource:latest[15],spargerGasSteps:latest[16],surfaceExits:latest[17],blockedContacts:latest[19],waterContacts:latest[20],usedSlots:latest[4],points:points,captureClock:companion.captureClock,captureAgeSimulationSeconds:Math.max(0,L.simulationClock-companion.captureClock),error:error};},
      draw:function(ctx,colors){ctx.save();ctx.strokeStyle=colors.edge;ctx.fillStyle=colors.fill;ctx.lineWidth=1;points.forEach(function(b){ctx.beginPath();ctx.arc(b.x,b.y,b.radius,0,Math.PI*2);ctx.globalAlpha=.65;ctx.fill();ctx.globalAlpha=.85;ctx.stroke();});ctx.restore();},
      buffers:{position:bubbles,material:material,witness:witness,ledger:ledger},
      destroy:function(){retired=true;L.setToyMembrane(null);A.setPhaseCompanion(null);buffers.forEach(function(b){try{b.destroy();}catch(e){}});}
    };A.setPhaseCompanion(companion);return companion;
  }
  root.WSSBubbles={create:create,source:SOURCE,radius:radius,slip:slip};
})(typeof window!=='undefined'?window:globalThis);
